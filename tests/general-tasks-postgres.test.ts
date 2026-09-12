import {randomUUID} from 'node:crypto';
import {readFile, readdir} from 'node:fs/promises';
import pg from 'pg';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {encodeAbiParameters, encodeEventTopics, keccak256, toHex, type Hex} from 'viem';
import {NextRequest} from 'next/server';
const transport = vi.hoisted(() => ({query: undefined as unknown}));
vi.mock('@/lib/platform/db', () => ({sql: () => transport.query}));
import {claimTask, createTask, getTask, listRunnerTasks, listTasks, updateRunnerTask, updateTask} from '@/lib/platform/tasks';
import {createCredential} from '@/lib/platform/credentials';
import {POST as claimRoute} from '@/app/api/v1/agents/[id]/tasks/route';
import {economyDeployment, ledgerAbi, marketAbi} from '@/lib/economy/chain';
import {canonicalJsonHash, createServiceDefinition, type ServiceRequest, type ServiceDefinition} from '@/lib/economy/service-contract';
import {taskStepOrderId, type GeneralTask} from '@/lib/tasks/model';
const address = (digit: string) => `0x${digit.repeat(40)}` as Hex;
const hash = (text: string) => keccak256(toHex(text));
const schemaValue = {type: 'object' as const, properties: {text: {type: 'string' as const, maxLength: 1000}}, required: ['text'], additionalProperties: false as const};
const deployment = economyDeployment()!;
const service = createServiceDefinition({chainId: 5042002, settlementAddress: deployment.settlement, ledgerAddress: deployment.ledger, seller: address('3'), endpoint: 'https://provider.example/translate', category: 'inference', unit: 'inference-request', quantity: '2', unitPriceAtomic: '10', inputSchema: schemaValue, outputSchema: schemaValue});

describe.skipIf(!process.env.TEST_DATABASE_URL)('general tasks in isolated PostgreSQL', () => {
  let admin: pg.Pool, pool: pg.Pool;
  const schema = 'general_tasks_' + randomUUID().replaceAll('-', ''), owner = randomUUID(), stranger = randomUUID();
  beforeAll(async () => {
    admin = new pg.Pool({connectionString: process.env.TEST_DATABASE_URL}); await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new pg.Pool({connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema}`});
    for (const file of (await readdir('db/migrations')).filter(file => file.endsWith('.sql')).sort()) await pool.query(await readFile('db/migrations/' + file, 'utf8'));
    type Query = {text: string; values: unknown[]; then: PromiseLike<pg.QueryResultRow[]>['then']};
    const query = (parts: TemplateStringsArray, ...values: unknown[]): Query => {
      const text = parts.reduce((sql, part, index) => sql + (index ? '$' + index : '') + part, '');
      return {text, values, then(resolve, reject) {return pool.query(text, values).then(result => result.rows).then(resolve, reject);}};
    };
    query.transaction = async (queries: Query[]) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const results = [];
        for (const item of queries) results.push((await client.query(item.text, item.values)).rows);
        await client.query('COMMIT'); return results;
      } catch (error) {await client.query('ROLLBACK'); throw error;} finally {client.release();}
    };
    transport.query = query;
    await pool.query('INSERT INTO platform_users(id,address) VALUES($1,$2),($3,$4)', [owner, address('a'), stranger, address('b')]);
    await pool.query('INSERT INTO economy_services(service_hash,user_id,definition) VALUES($1,$2,$3)', [service.serviceHash, owner, service]);
  }, 30000);
  afterAll(async () => {await pool?.end(); if (admin) {await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end();}});
  async function newTask() {
    const agentId = randomUUID();
    await pool.query("INSERT INTO platform_agents(id,user_id,name,data_budget_atomic,verification_budget_atomic) VALUES($1,$2,'Writer',0,1000)", [agentId, owner]);
    return (await createTask(owner, {agentId, instruction: 'Translate this text, then refine it.', budgetAtomic: '40'}, randomUUID())).task;
  }
  async function planned() {
    const task = await newTask(), claim = (await claimTask(task.agentId, {action: 'claim', workerId: 'planner'}))!;
    const plan = {summary: 'Translate and refine.', steps: [{serviceHash: service.serviceHash, input: {text: 'Hello'}}, {serviceHash: service.serviceHash, input: {text: {$from: 0, path: ['text']}}}]};
    const proposed = await updateRunnerTask(task.agentId, task.id, {action: 'plan', claimToken: claim.claimToken, plan});
    return {task: proposed, claim, plan};
  }
  async function executing() {
    const {task} = await planned();
    await updateTask(owner, task.id, {action: 'approve', planHash: task.planHash});
    return (await claimTask(task.agentId, {action: 'claim', workerId: 'private-executor'}))!;
  }
  function receipt(request: ServiceRequest, definition: ServiceDefinition = service) {
    const topics = (value: ReturnType<typeof encodeEventTopics>) => value as [Hex, ...Hex[]];
    return {chainId: 5042002, status: 'success', transactionHash: request.settlement.transactionHash, logs: [
      {address: definition.settlementAddress, topics: topics(encodeEventTopics({abi: marketAbi, eventName: 'OrderSettled', args: {orderId: request.orderId, orderHash: hash('order-hash'), payer: request.payer}})), data: encodeAbiParameters([{type: 'uint256'}, {type: 'uint256'}, {type: 'uint256'}, {type: 'uint256'}, {type: 'uint256'}, {type: 'uint64'}, {type: 'uint64'}], [20n, 19n, 1n, 0n, 0n, 1n, 1n])},
      {address: definition.ledgerAddress, topics: topics(encodeEventTopics({abi: ledgerAbi, eventName: 'OrderPaid', args: {orderId: request.orderId, agentId: request.agentId, seller: definition.seller}})), data: encodeAbiParameters([{type: 'bytes32'}, {type: 'uint8'}, {type: 'bytes32'}, {type: 'uint256'}, {type: 'uint256'}, {type: 'uint256'}, {type: 'bytes32'}], [definition.serviceHash, 2, hash(definition.unit), 2n, 10n, 20n, request.inputHash])},
    ]};
  }
  async function paidOrder(task: GeneralTask, index: number, options: {userId?: string; input?: unknown; output?: unknown; noReceipt?: boolean; state?: 'paid' | 'fulfilled'; definition?: ServiceDefinition} = {}) {
    const definition = options.definition ?? service;
    const orderId = taskStepOrderId(task.id, task.planHash!, index), input = options.input ?? {text: index ? 'Bonjour' : 'Hello'}, output = options.output ?? {text: index ? 'Bonjour!' : 'Bonjour'};
    const request: ServiceRequest = {protocol: 'obolos.service.v1', orderId, agentId: hash(task.agentId), payer: address('c'), serviceHash: definition.serviceHash, inputHash: canonicalJsonHash(input), category: definition.category, unit: definition.unit, quantity: definition.quantity, unitPriceAtomic: definition.unitPriceAtomic, amountAtomic: '20', settlement: {chainId: 5042002, address: definition.settlementAddress, ledgerAddress: definition.ledgerAddress, transactionHash: hash(orderId)}, input};
    await pool.query("INSERT INTO economy_orders(order_id,user_id,platform_agent_id,service_hash,request_hash,request,definition,transaction_hash,receipt,state,output,output_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)", [orderId, options.userId ?? owner, task.agentId, definition.serviceHash, canonicalJsonHash(request), request, definition, request.settlement.transactionHash, options.noReceipt ? {} : receipt(request, definition), options.state ?? 'fulfilled', options.state === 'paid' ? null : output, options.state === 'paid' ? null : canonicalJsonHash(output)]);
    return orderId;
  }
  it('isolates owners and API keys and rejects duplicate create terms without leaking claim tokens', async () => {
    const task = await newTask(), key = randomUUID(), input = {agentId: task.agentId, instruction: 'Write a paragraph.', budgetAtomic: '20'};
    const [a, b] = await Promise.all([createTask(owner, input, key), createTask(owner, input, key)]);
    expect(a.task.id).toBe(b.task.id);
    await expect(createTask(owner, {...input, budgetAtomic: '21'}, key)).rejects.toMatchObject({code: 'TASK_CONFLICT'});
    await expect(createTask(stranger, input, key)).rejects.toMatchObject({code: 'AGENT_NOT_FOUND'});
    await expect(getTask(stranger, task.id)).rejects.toMatchObject({code: 'TASK_NOT_FOUND'});
    expect(await listTasks(stranger)).toEqual([]);
    const credential = createCredential(), other = await newTask();
    await pool.query("INSERT INTO platform_api_keys(id,agent_id,name,prefix,token_hash,expires_at) VALUES($1,$2,'runner',$3,$4,now()+interval '1 day')", [randomUUID(), task.agentId, credential.prefix, credential.hash]);
    const response = await claimRoute(new NextRequest('http://localhost/api/v1/agents/' + other.agentId + '/tasks', {method: 'POST', headers: {'authorization': 'Bearer ' + credential.token, 'content-type': 'application/json'}, body: JSON.stringify({action: 'claim', workerId: 'evil'})}), {params: Promise.resolve({id: other.agentId})});
    expect(response.status).toBe(403);
    expect(JSON.stringify(await listRunnerTasks(task.agentId))).not.toMatch(/claim_token|claimToken|execution_worker/);
  });
  it('caps concurrent open work while keeping exact idempotent replays and older active authority visible', async () => {
    const task = await newTask(), input = {agentId: task.agentId, instruction: 'Write text.', budgetAtomic: '20'}, key = randomUUID();
    const first = await createTask(owner, input, key);
    const attempts = await Promise.allSettled(Array.from({length: 27}, () => createTask(owner, input, randomUUID())));
    expect(attempts.filter(result => result.status === 'fulfilled')).toHaveLength(23);
    expect(attempts.filter(result => result.status === 'rejected')).toHaveLength(4);
    expect((await createTask(owner, input, key)).task.id).toBe(first.task.id);
    await expect(createTask(owner, {...input, instruction: 'Different'}, key)).rejects.toMatchObject({code: 'TASK_CONFLICT'});
    // Historical records may be much newer than the task the private runner owns.
    for (let index = 0; index < 105; index++) await pool.query("INSERT INTO platform_tasks(id,user_id,agent_id,instruction,budget_atomic,idempotency_key,request_hash,status) VALUES($1::uuid,$2,$3,'Old completed work',1,$1::text,$4,'cancelled')", [randomUUID(), owner, task.agentId, hash('history' + index)]);
    const listed = await listRunnerTasks(task.agentId);
    expect(listed.tasks.some(item => item.id === task.id)).toBe(true);
    expect(listed.tasks.filter(item => item.status === 'queued')).toHaveLength(25);
    expect(listed.tasks).toHaveLength(100);
    expect((await listRunnerTasks(task.agentId, {taskId: task.id})).tasks.map(item => item.id)).toEqual([task.id]);
    expect(await listRunnerTasks(task.agentId, {identityOnly: true})).toEqual({ownerAddress: address('a'), tasks: []});
    const unrelated = await newTask();
    await expect(listRunnerTasks(unrelated.agentId, {taskId: task.id})).rejects.toMatchObject({code: 'TASK_NOT_FOUND'});
  });
  it('uses exclusive planning claims and rejects stale or tampered owner approvals', async () => {
    const task = await newTask();
    const claims = await Promise.all(['one', 'two'].map(workerId => claimTask(task.agentId, {action: 'claim', workerId})));
    expect(claims.filter(Boolean)).toHaveLength(1);
    const {task: proposed, claim, plan} = await planned();
    expect((await updateRunnerTask(proposed.agentId, proposed.id, {action: 'plan', claimToken: claim.claimToken, plan})).planHash).toBe(proposed.planHash);
    await expect(updateTask(owner, proposed.id, {action: 'approve', planHash: hash('tampered')})).rejects.toMatchObject({code: 'STALE_PLAN'});
    const approved = await updateTask(owner, proposed.id, {action: 'approve', planHash: proposed.planHash});
    expect((await updateTask(owner, proposed.id, {action: 'approve', planHash: proposed.planHash})).approvalExpiresAt).toBe(approved.approvalExpiresAt);
    expect(new Date(approved.approvalExpiresAt!).getTime() - Date.now()).toBeLessThanOrEqual(3600000);
    await expect(pool.query("UPDATE platform_tasks SET plan_hash=$1 WHERE id=$2", [hash('tampered'), proposed.id])).rejects.toThrow(/immutable/);
    await expect(pool.query("UPDATE platform_tasks SET budget_atomic=999 WHERE id=$1", [proposed.id])).rejects.toThrow(/immutable/);
  });
  it('lets expired planning move hosts but keeps uncertain execution on its original host', async () => {
    const task = await newTask(), original = (await claimTask(task.agentId, {action: 'claim', workerId: 'lost-planner'}))!;
    await pool.query("UPDATE platform_tasks SET claim_until=now()-interval '1 minute' WHERE id=$1", [task.id]);
    const replacement = (await claimTask(task.agentId, {action: 'claim', workerId: 'replacement'}))!;
    expect(replacement.claimToken).not.toBe(original.claimToken);
    await expect(updateRunnerTask(task.agentId, task.id, {action: 'blocked', claimToken: original.claimToken, error: 'stale'})).rejects.toMatchObject({code: 'INVALID_TASK_CLAIM'});
    const execution = await executing();
    await pool.query("UPDATE platform_tasks SET claim_until=now()-interval '1 minute' WHERE id=$1", [execution.task.id]);
    expect(await claimTask(execution.task.agentId, {action: 'claim', workerId: 'different-host'})).toBeNull();
    expect((await claimTask(execution.task.agentId, {action: 'claim', workerId: 'private-executor'}))?.claimToken).toBe(execution.claimToken);
    await expect(updateTask(owner, execution.task.id, {action: 'cancel'})).rejects.toMatchObject({code: 'TASK_CONFLICT'});
  });
  it('rejects completion without actual orders and foreign-owner, wrong-input, invalid-output and missing-receipt results', async () => {
    const execution = await executing();
    await expect(updateRunnerTask(execution.task.agentId, execution.task.id, {action: 'complete', claimToken: execution.claimToken})).rejects.toThrow(/Every approved/);
    for (const options of [{userId: stranger}, {input: {text: 'Unauthorized input'}}, {output: {wrong: 'schema'}}, {noReceipt: true}, {state: 'paid' as const}]) {
      const claim = await executing(), orderId = await paidOrder(claim.task, 0, options);
      await expect(updateRunnerTask(claim.task.agentId, claim.task.id, {action: 'progress', claimToken: claim.claimToken, index: 0, orderId})).rejects.toThrow();
      expect((await getTask(owner, claim.task.id)).steps).toHaveLength(0);
    }
  });
  it('accepts schema-valid multibyte output up to the provider protocol 128 KiB bound', async () => {
    const {protocol: _protocol, serviceHash: _hash, ...terms} = service;
    const largeService = createServiceDefinition({...terms, endpoint: 'https://provider.example/long-writing', outputSchema: {type: 'object', properties: {text: {type: 'string', maxLength: 65536}}, required: ['text'], additionalProperties: false}});
    await pool.query('INSERT INTO economy_services(service_hash,user_id,definition) VALUES($1,$2,$3)', [largeService.serviceHash, owner, largeService]);
    const task = await newTask(), planning = (await claimTask(task.agentId, {action: 'claim', workerId: 'planner'}))!;
    const proposed = await updateRunnerTask(task.agentId, task.id, {action: 'plan', claimToken: planning.claimToken, plan: {summary: 'Write a long text.', steps: [{serviceHash: largeService.serviceHash, input: {text: 'Hello'}}]}});
    await updateTask(owner, task.id, {action: 'approve', planHash: proposed.planHash});
    const claim = (await claimTask(task.agentId, {action: 'claim', workerId: 'private-executor'}))!;
    const output = {text: '𐍈'.repeat(32762)}, orderId = await paidOrder(claim.task, 0, {definition: largeService, output});
    const result = await updateRunnerTask(task.agentId, task.id, {action: 'progress', claimToken: claim.claimToken, index: 0, orderId});
    expect(result.steps[0].output).toEqual(output);
    expect((await updateRunnerTask(task.agentId, task.id, {action: 'complete', claimToken: claim.claimToken})).status).toBe('completed');
  });
  it('recovers verified paid delivery after expiry without renewing the approved plan or moving execution hosts', async () => {
    const {task} = await planned();
    // Seed an approval that has aged out; the application cannot extend it after approval.
    await pool.query("UPDATE platform_tasks SET status='approved',approved_plan_hash=plan_hash,approval_expires_at=now()-interval '1 minute',claim_until=NULL WHERE id=$1", [task.id]);
    const claim = (await claimTask(task.agentId, {action: 'claim', workerId: 'private-executor'}))!;
    const expiry = claim.task.approvalExpiresAt;
    const orderId = await paidOrder(claim.task, 0);
    await updateRunnerTask(task.agentId, task.id, {action: 'progress', claimToken: claim.claimToken, index: 0, orderId});
    await updateRunnerTask(task.agentId, task.id, {action: 'blocked', claimToken: claim.claimToken, error: 'Approval expired before the next unpaid step.'});
    const retried = await updateTask(owner, task.id, {action: 'retry'});
    expect(retried.approvalExpiresAt).toBe(expiry);
    expect(retried.steps).toHaveLength(1);
    await expect(pool.query("UPDATE platform_tasks SET approval_expires_at=now()+interval '1 hour' WHERE id=$1", [task.id])).rejects.toThrow(/immutable/);
    await expect(pool.query("UPDATE platform_tasks SET step_results='[]'::jsonb WHERE id=$1", [task.id])).rejects.toThrow(/append-only/);
  });
  it('preserves verified partial paid work and deterministic orders across blocked retries and completes from actual output proofs', async () => {
    const claim = await executing(), orderId = await paidOrder(claim.task, 0);
    const progress = {action: 'progress', claimToken: claim.claimToken, index: 0, orderId};
    expect((await updateRunnerTask(claim.task.agentId, claim.task.id, progress)).steps).toHaveLength(1);
    expect((await updateRunnerTask(claim.task.agentId, claim.task.id, progress)).steps).toHaveLength(1);
    await updateRunnerTask(claim.task.agentId, claim.task.id, {action: 'blocked', claimToken: claim.claimToken, error: 'Provider is unavailable. Retry existing orders.'});
    const retry = await updateTask(owner, claim.task.id, {action: 'retry'});
    expect(retry.steps[0].orderId).toBe(orderId);
    expect(retry.approvedPlanHash).toBe(claim.task.approvedPlanHash);
    expect(await claimTask(claim.task.agentId, {action: 'claim', workerId: 'other-host'})).toBeNull();
    const resumed = (await claimTask(claim.task.agentId, {action: 'claim', workerId: 'private-executor'}))!;
    expect(resumed.claimToken).toBe(claim.claimToken);
    const second = await paidOrder(resumed.task, 1);
    await updateRunnerTask(claim.task.agentId, claim.task.id, {action: 'progress', claimToken: claim.claimToken, index: 1, orderId: second});
    const complete = await updateRunnerTask(claim.task.agentId, claim.task.id, {action: 'complete', claimToken: claim.claimToken});
    expect(complete.status).toBe('completed');
    expect(complete.steps.map(step => step.output)).toEqual([{text: 'Bonjour'}, {text: 'Bonjour!'}]);
    expect(JSON.stringify(complete)).not.toContain(claim.claimToken);
  });
});
