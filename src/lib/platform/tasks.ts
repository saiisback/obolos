import {randomBytes, randomUUID} from 'node:crypto';
import {keccak256, toHex} from 'viem';
import {z} from 'zod';
import {economyDeployment} from '@/lib/economy/chain';
import {listEconomyServices} from '@/lib/economy/marketplace';
import {canonicalJson, canonicalJsonHash, validateSchemaValue, validateServiceRequest, verifyServiceSettlement, type ServiceReceipt} from '@/lib/economy/service-contract';
import {createTaskPlan, resolveTaskInput, taskAtomicSchema, taskPlanHash, taskStepOrderId, type GeneralTask, type TaskStepResult, type TaskPlan} from '@/lib/tasks/model';
import {sql} from './db';
import {assertUuid, requireOwnedAgent} from './agents';
import {PlatformError} from './http';

type Row = Record<string, unknown>;
const fail = (message: string, code = 'TASK_CONFLICT') => new PlatformError(409, code, message);
const iso = (value: unknown) => new Date(String(value)).toISOString();
export function publicTask(row: Row): GeneralTask {
  return {id: String(row.id), agentId: String(row.agent_id), instruction: String(row.instruction), budgetAtomic: String(row.budget_atomic), status: row.status as GeneralTask['status'], plan: row.plan as GeneralTask['plan'], planHash: row.plan_hash as string | null, approvedPlanHash: row.approved_plan_hash as string | null, approvalExpiresAt: row.approval_expires_at ? iso(row.approval_expires_at) : null, steps: row.step_results as TaskStepResult[], error: row.error as string | null, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at)};
}
async function ownedRow(userId: string, id: string) {
  assertUuid(id);
  const rows = await sql()`SELECT t.* FROM platform_tasks t JOIN platform_agents a ON a.id=t.agent_id AND a.user_id=t.user_id WHERE t.id=${id} AND t.user_id=${userId}`;
  if (!rows[0]) throw new PlatformError(404, 'TASK_NOT_FOUND', 'Task not found.');
  return rows[0];
}
export async function listTasks(userId: string, agentId?: string) {
  if (agentId) await requireOwnedAgent(userId, agentId);
  const rows = await sql()`SELECT t.* FROM platform_tasks t JOIN platform_agents a ON a.id=t.agent_id AND a.user_id=t.user_id WHERE t.user_id=${userId} AND (${agentId ?? null}::uuid IS NULL OR t.agent_id=${agentId ?? null}::uuid) ORDER BY t.created_at DESC,t.id LIMIT 100`;
  return rows.map(publicTask);
}
export async function getTask(userId: string, id: string) {return publicTask(await ownedRow(userId, id));}
export async function createTask(userId: string, value: unknown, key: string | null) {
  const input = z.object({agentId: z.uuid(), instruction: z.string().trim().min(1).max(12000), budgetAtomic: taskAtomicSchema}).strict().parse(value);
  if (!key || !/^[\x21-\x7e]{1,128}$/.test(key)) throw new PlatformError(400, 'IDEMPOTENCY_REQUIRED', 'Provide a stable Idempotency-Key for this task.');
  await requireOwnedAgent(userId, input.agentId);
  const db = sql(), fingerprint = canonicalJsonHash(input);
  // Separate statements obtain a fresh READ COMMITTED snapshot after waiting for
  // the agent lock. Concurrent creates cannot overbook the open-task limit.
  const created = await db.transaction([
    db`SELECT id FROM platform_agents WHERE id=${input.agentId} AND user_id=${userId} FOR UPDATE`,
    db`INSERT INTO platform_tasks(id,user_id,agent_id,instruction,budget_atomic,idempotency_key,request_hash)
      SELECT ${randomUUID()},${userId},${input.agentId},${input.instruction},${input.budgetAtomic},${key},${fingerprint}
      WHERE (SELECT count(*) FROM platform_tasks WHERE agent_id=${input.agentId} AND status NOT IN ('completed','cancelled'))<25
      ON CONFLICT(user_id,agent_id,idempotency_key) DO NOTHING RETURNING *`,
  ], {isolationLevel: 'ReadCommitted'});
  if (created[1][0]) return {task: publicTask(created[1][0]), replayed: false};
  const rows = await db`SELECT * FROM platform_tasks WHERE user_id=${userId} AND agent_id=${input.agentId} AND idempotency_key=${key}`;
  if (!rows[0]) throw fail('This agent has 25 open tasks. Finish or cancel an existing task first.', 'TASK_LIMIT');
  if (rows[0].request_hash !== fingerprint) throw fail('This Idempotency-Key already belongs to a different request.');
  return {task: publicTask(rows[0]), replayed: true};
}
const ownerAction = z.discriminatedUnion('action', [z.object({action: z.literal('approve'), planHash: z.string().regex(/^0x[\da-f]{64}$/)}).strict(), z.object({action: z.literal('cancel')}).strict(), z.object({action: z.literal('retry')}).strict()]);
export async function updateTask(userId: string, id: string, value: unknown) {
  const input = ownerAction.parse(value), row = await ownedRow(userId, id), db = sql();
  if (input.action === 'approve') {
    if (row.plan_hash !== input.planHash || !row.plan || taskPlanHash(row.plan as TaskPlan) !== input.planHash) throw fail('The plan changed. Review the current plan before approving.', 'STALE_PLAN');
    if (row.approved_plan_hash === input.planHash) return publicTask(row);
    const updated = await db`UPDATE platform_tasks SET status='approved',approved_plan_hash=plan_hash,approval_expires_at=now()+interval '1 hour',claim_until=NULL,error=NULL,revision=revision+1,updated_at=now() WHERE id=${id} AND user_id=${userId} AND status='needs_approval' AND plan_hash=${input.planHash} AND revision=${row.revision} RETURNING *`;
    if (!updated[0]) throw fail('This task is no longer waiting for approval.');
    return publicTask(updated[0]);
  }
  if (input.action === 'cancel') {
    if (row.status === 'cancelled') return publicTask(row);
    // Once a host may have submitted funds, retain the recoverable payment workflow.
    const updated = await db`UPDATE platform_tasks SET status='cancelled',claim_token=NULL,claim_until=NULL,revision=revision+1,updated_at=now() WHERE id=${id} AND user_id=${userId} AND execution_worker IS NULL AND status NOT IN ('completed','cancelled') AND revision=${row.revision} RETURNING *`;
    if (!updated[0]) throw fail('Execution has started. Preserve this task to recover its existing payments.');
    return publicTask(updated[0]);
  }
  const updated = await db`UPDATE platform_tasks SET status=CASE WHEN approved_plan_hash IS NOT NULL THEN 'approved' ELSE 'queued' END,error=NULL,claim_until=NULL,revision=revision+1,updated_at=now() WHERE id=${id} AND user_id=${userId} AND status='blocked' AND revision=${row.revision} RETURNING *`;
  if (!updated[0]) {if (['queued','approved','running'].includes(String(row.status))) return publicTask(row); throw fail('Only a blocked task can be retried.');}
  return publicTask(updated[0]);
}
export async function listRunnerTasks(agentId: string, options: {taskId?: string; identityOnly?: boolean} = {}) {
  assertUuid(agentId);
  const db = sql(), owners = await db`SELECT u.address,a.user_id FROM platform_agents a JOIN platform_users u ON u.id=a.user_id WHERE a.id=${agentId}`;
  if (!owners[0]) throw new PlatformError(404, 'AGENT_NOT_FOUND', 'Agent not found.');
  const ownerAddress = String(owners[0].address);
  if (options.identityOnly) return {ownerAddress, tasks: []};
  if (options.taskId) {
    assertUuid(options.taskId);
    const rows = await db`SELECT * FROM platform_tasks WHERE id=${options.taskId} AND agent_id=${agentId} AND user_id=${owners[0].user_id}`;
    if (!rows[0]) throw new PlatformError(404, 'TASK_NOT_FOUND', 'Task not found.');
    return {ownerAddress, tasks: rows.map(publicTask)};
  }
  // The 25-open-task cap ensures every claimable task fits the runner's bounded
  // 100-record response, even after a long history of terminal work.
  const rows = await db`SELECT * FROM platform_tasks WHERE agent_id=${agentId} AND user_id=${owners[0].user_id}
    ORDER BY CASE WHEN status IN ('queued','planning','approved','running') THEN 0 ELSE 1 END,created_at DESC,id LIMIT 100`;
  return {ownerAddress: String(owners[0].address), tasks: rows.map(publicTask)};
}
export async function claimTask(agentId: string, value: unknown) {
  assertUuid(agentId);
  const {workerId} = z.object({action: z.literal('claim'), workerId: z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/)}).strict().parse(value);
  const token = randomBytes(32).toString('hex');
  // SKIP LOCKED + conditional row update prevent two hosts owning the same claim.
  // An execution host is pinned forever: expiry never authorizes another payment journal.
  // Expired approvals without a prior execution host stay unclaimed and cancellable.
  const rows = await sql()`WITH candidate AS (
    SELECT t.id FROM platform_tasks t JOIN platform_agents a ON a.id=t.agent_id AND a.user_id=t.user_id
    WHERE t.agent_id=${agentId} AND (
      (t.status IN ('queued','planning') AND (t.claim_until IS NULL OR t.claim_until<now() OR t.claim_worker=${workerId})) OR
      (t.status IN ('approved','running') AND (t.execution_worker IS NULL OR t.execution_worker=${workerId}) AND
       (t.execution_worker IS NOT NULL OR t.approval_expires_at>now()) AND
       (t.claim_until IS NULL OR t.claim_until<now() OR t.claim_worker=${workerId}))
    ) ORDER BY CASE WHEN t.claim_worker=${workerId} THEN 0 ELSE 1 END,t.created_at,t.id FOR UPDATE OF t SKIP LOCKED LIMIT 1
  ) UPDATE platform_tasks t SET
    status=CASE WHEN t.approved_plan_hash IS NULL THEN 'planning' ELSE 'running' END,
    claim_phase=CASE WHEN t.approved_plan_hash IS NULL THEN 'plan' ELSE 'execute' END,
    claim_token=CASE WHEN t.claim_worker=${workerId} AND t.claim_token IS NOT NULL THEN t.claim_token ELSE ${token} END,
    claim_worker=${workerId},claim_until=now()+interval '2 minutes',
    execution_worker=CASE WHEN t.approved_plan_hash IS NOT NULL THEN COALESCE(t.execution_worker,${workerId}) ELSE t.execution_worker END,
    revision=revision+1,updated_at=now() FROM candidate WHERE t.id=candidate.id RETURNING t.*`;
  if (!rows[0]) return null;
  return {task: publicTask(rows[0]), claimToken: String(rows[0].claim_token), phase: rows[0].claim_phase as 'plan' | 'execute'};
}
const tokenSchema = z.string().regex(/^[\da-f]{64}$/);
const runnerAction = z.discriminatedUnion('action', [
  z.object({action: z.literal('plan'), claimToken: tokenSchema, plan: z.unknown()}).strict(),
  z.object({action: z.literal('progress'), claimToken: tokenSchema, index: z.number().int().min(0).max(4), orderId: z.string().regex(/^0x[\da-f]{64}$/)}).strict(),
  z.object({action: z.literal('complete'), claimToken: tokenSchema}).strict(),
  z.object({action: z.literal('blocked'), claimToken: tokenSchema, error: z.string().trim().min(1).max(2000)}).strict(),
]);

/** Re-derive success solely from immutable paid-order evidence, never runner assertions.
 * Reporting may happen after approval expiry: the private runner pins the submitted
 * on-chain order deadline to that expiry and refuses fresh unpaid work afterward.
 * ServiceRequest contains no deadline, so reporting does not invent payment timing
 * or depend on a potentially lagging chain index for already-paid recovery.
 */
async function verifiedStep(row: Row, index: number): Promise<TaskStepResult> {
  try {return await verifyPaidStep(row, index);} catch (error) {
    if (error instanceof PlatformError) throw error;
    throw fail('The order does not contain valid paid delivery evidence for this approved step.', 'TASK_ORDER_MISMATCH');
  }
}
async function verifyPaidStep(row: Row, index: number): Promise<TaskStepResult> {
  const task = publicTask(row), plan = task.plan;
  if (!plan || !task.planHash || task.approvedPlanHash !== task.planHash || taskPlanHash(plan) !== task.planHash) throw fail('An owner-approved plan is required.');
  const deployment = economyDeployment();
  const step = plan.steps[index];
  if (!step) throw fail('Invalid task step.');
  if (!deployment || step.definition.chainId !== deployment.chainId || step.definition.settlementAddress !== deployment.settlement || step.definition.ledgerAddress !== deployment.ledger) throw fail('The approved service belongs to another economy deployment.');
  const orderId = taskStepOrderId(task.id, task.planHash, index), input = resolveTaskInput(step.input, task.steps.slice(0, index).map(result => result.output));
  validateSchemaValue(input, step.definition.inputSchema);
  const orders = await sql()`SELECT o.* FROM economy_orders o JOIN platform_agents a ON a.id=o.platform_agent_id AND a.user_id=o.user_id WHERE o.order_id=${orderId} AND o.user_id=${row.user_id} AND o.platform_agent_id=${task.agentId}`;
  const order = orders[0];
  if (!order || order.state !== 'fulfilled') throw fail('The approved service order has not delivered a paid result.', 'TASK_ORDER_PENDING');
  const request = validateServiceRequest(step.definition, order.request);
  if (canonicalJsonHash(order.definition) !== canonicalJsonHash(step.definition) || order.service_hash !== step.serviceHash || request.orderId !== orderId || request.agentId !== keccak256(toHex(task.agentId)) || request.inputHash !== canonicalJsonHash(input) || order.request_hash !== canonicalJsonHash(request) || order.transaction_hash !== request.settlement.transactionHash) throw fail('Paid order does not match the approved owner, agent, input and service.');
  verifyServiceSettlement(step.definition, request, order.receipt as ServiceReceipt);
  validateSchemaValue(order.output, step.definition.outputSchema, 128 * 1024);
  if (order.output_hash !== canonicalJsonHash(order.output)) throw fail('Delivered output hash does not match its body.');
  return {index, orderId, transactionHash: String(order.transaction_hash), outputHash: String(order.output_hash), output: order.output};
}
export async function updateRunnerTask(agentId: string, taskId: string, value: unknown) {
  assertUuid(agentId); assertUuid(taskId);
  const input = runnerAction.parse(value), db = sql();
  const rows = await db`SELECT t.* FROM platform_tasks t JOIN platform_agents a ON a.id=t.agent_id AND a.user_id=t.user_id WHERE t.id=${taskId} AND t.agent_id=${agentId} AND t.claim_token=${input.claimToken}`;
  const row = rows[0];
  if (!row) throw fail('The task claim is invalid.', 'INVALID_TASK_CLAIM');
  let status = String(row.status), plan = row.plan, planHash = row.plan_hash, results = row.step_results as TaskStepResult[], error: string | null = null;
  if (input.action === 'plan') {
    if (row.claim_phase !== 'plan' || !['planning','needs_approval'].includes(status)) throw fail('A planning claim is required.');
    try {
      const deployment = economyDeployment();
      const catalog = (await listEconomyServices()).filter(service => deployment && service.chainId === deployment.chainId && service.settlementAddress === deployment.settlement && service.ledgerAddress === deployment.ledger);
      plan = createTaskPlan(input.plan, catalog, String(row.budget_atomic));
    } catch {throw new PlatformError(400, 'INVALID_TASK_PLAN', 'The plan must use available services, valid inputs, earlier outputs and the approved budget.');}
    planHash = taskPlanHash(plan as TaskPlan);
    if (status === 'needs_approval') {if (row.plan_hash === planHash) return publicTask(row); throw fail('A submitted plan cannot be replaced.');}
    if (new Date(String(row.claim_until)).getTime() <= Date.now()) throw fail('The planning lease expired. Claim the task again.');
    status = 'needs_approval';
  } else if (input.action === 'blocked') {
    if (!['planning','running','blocked'].includes(status)) throw fail('This task cannot be blocked by this claim.');
    status = 'blocked'; error = input.error;
  } else {
    if (row.claim_phase !== 'execute' || !['running','completed'].includes(status)) throw fail('An execution claim is required.');
    if (input.action === 'progress') {
      if (input.index > results.length || input.orderId !== taskStepOrderId(taskId, String(row.plan_hash), input.index)) throw fail('Progress must identify the next deterministic approved order.');
      const result = await verifiedStep(row, input.index);
      if (input.index < results.length) {if (canonicalJson(results[input.index]) === canonicalJson(result)) return publicTask(row); throw fail('Recorded task results are immutable.');}
      results = [...results, result];
    } else {
      const taskPlan = plan as NonNullable<GeneralTask['plan']>;
      if (results.length !== taskPlan.steps.length) throw fail('Every approved step must have a verified paid result.');
      for (let index = 0; index < results.length; index++) if (canonicalJson(await verifiedStep(row, index)) !== canonicalJson(results[index])) throw fail('Recorded task result does not match its paid order.');
      status = 'completed';
    }
  }
  const updated = await db`UPDATE platform_tasks SET status=${status},plan=${plan == null ? null : JSON.stringify(plan)}::jsonb,plan_hash=${planHash},step_results=${JSON.stringify(results)}::jsonb,error=${error},claim_until=now()+interval '2 minutes',revision=revision+1,updated_at=now() WHERE id=${taskId} AND agent_id=${agentId} AND claim_token=${input.claimToken} AND revision=${row.revision} RETURNING *`;
  if (!updated[0]) throw fail('The task changed concurrently. Read it and retry the same update.');
  return publicTask(updated[0]);
}
