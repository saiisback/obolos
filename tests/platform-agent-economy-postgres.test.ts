import {randomUUID} from 'node:crypto';
import {readFile, readdir} from 'node:fs/promises';
import pg from 'pg';
import {afterAll, beforeAll, expect, it, describe, vi} from 'vitest';
import {NextRequest} from 'next/server';
import {keccak256, toHex} from 'viem';
const transport = vi.hoisted(() => ({query: undefined as unknown}));
const auth = vi.hoisted(() => ({user: null as null | {id: string; address: string}}));
vi.mock('@/lib/platform/db', () => ({sql: () => transport.query}));
vi.mock('@/lib/platform/auth', () => ({requireUser: async () => {if (!auth.user) throw new PlatformError(401, 'AUTH_REQUIRED', 'Sign in.'); return auth.user;}}));
import {getAgentEconomy} from '@/lib/platform/agent-economy';
import {GET} from '@/app/api/agents/[id]/economy/route';
import {PlatformError} from '@/lib/platform/http';
import {economyDeployment} from '@/lib/economy/chain';

describe.skipIf(!process.env.TEST_DATABASE_URL)('owned agent economy PostgreSQL boundary', () => {
  let admin: pg.Pool, pool: pg.Pool;
  const schema = `agent_economy_${randomUUID().replaceAll('-', '')}`;
  const owner = {id: randomUUID(), address: `0x${'a'.repeat(40)}`}, outsider = {id: randomUUID(), address: `0x${'b'.repeat(40)}`};
  const id = randomUUID(), otherAgent = randomUUID(), deployment = economyDeployment()!;
  const hash = (text: string) => keccak256(toHex(text));
  const ownedOrder = hash('owned-order'), deliveryTx = hash('delivery'), ackTx = hash('ack'), outputHash = hash('output');
  const readPolicy = vi.fn(async () => ({owner: owner.address, executor: `0x${'c'.repeat(40)}`, active: true, totalCapAtomic: '2000', spentAtomic: '1000', windowCapAtomic: '2000', windowSeconds: '86400', blockNumber: '123', timestamp: 1789128000}));
  beforeAll(async () => {
    admin = new pg.Pool({connectionString: process.env.TEST_DATABASE_URL}); await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new pg.Pool({connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema}`});
    for (const name of (await readdir('db/migrations')).filter(name => name.endsWith('.sql')).sort()) await pool.query(await readFile(`db/migrations/${name}`, 'utf8'));
    transport.query = (parts: TemplateStringsArray, ...values: unknown[]) => pool.query(parts.reduce((sum, part, index) => sum + (index ? `$${index}` : '') + part, ''), values).then(result => result.rows);
    for (const user of [owner, outsider]) await pool.query('INSERT INTO platform_users(id,address) VALUES($1,$2)', [user.id, user.address]);
    for (const agent of [id, otherAgent]) await pool.query("INSERT INTO platform_agents(id,user_id,name,data_budget_atomic,verification_budget_atomic) VALUES($1,$2,'Synthetic specialist',0,0)", [agent, owner.id]);
    await pool.query('INSERT INTO economy_services(service_hash,user_id,definition) VALUES($1,$2,$3)', [hash('service'), owner.id, {}]);
    const cases = [{name: 'owned-order'}, {name: 'other-agent', agent: otherAgent}, {name: 'other-user', user: outsider.id}, {name: 'old-settlement', settlement: `0x${'e'.repeat(40)}`}, {name: 'old-ledger', ledger: `0x${'e'.repeat(40)}`}, {name: 'wrong-chain', chain: 1}, {name: 'wrong-agent-id', chainAgent: hash('other')}];
    for (const row of cases) {
      const request = {agentId: row.chainAgent ?? hash(row.agent ?? id), payer: owner.address, category: 'compute', amountAtomic: '1000', settlement: {chainId: row.chain ?? deployment.chainId, address: row.settlement ?? deployment.settlement, ledgerAddress: row.ledger ?? deployment.ledger}, input: {secret: 'PRIVATE INPUT'}};
      await pool.query("INSERT INTO economy_orders(order_id,user_id,platform_agent_id,service_hash,request_hash,request,definition,transaction_hash,receipt,state,output,output_hash,delivery_attempts) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'fulfilled',$10,$11,1)", [hash(row.name), row.user ?? owner.id, row.agent ?? id, hash('service'), hash(`request-${row.name}`), request, {seller: outsider.address}, hash(`payment-${row.name}`), {}, {words: 12, text: 'PRIVATE OUTPUT'}, outputHash]);
    }
    await pool.query('INSERT INTO economy_index_state(settlement_address,block_number,block_hash,snapshot) VALUES($1,123,$2,$3)', [deployment.settlement, hash('block'), {}]);
    // A same-ID event emitted by another deployment is not this order's evidence.
    await event('DeliveryAttested', hash('foreign-delivery'), `0x${'e'.repeat(40)}`);
    await event('DeliveryAttested', hash('wrong-seller'), deployment.ledger, {seller: owner.address});
    await event('BuyerAcknowledged', hash('wrong-payer'), deployment.ledger, {payer: outsider.address});
    await event('DeliveryAttested', hash('beyond-index'), deployment.ledger, {}, 124);
  });
  async function event(name: string, tx: string, ledger = deployment.ledger, extra = {}, block = 123) {
    await pool.query('INSERT INTO economy_chain_events(chain_id,contract_address,transaction_hash,log_index,block_number,block_hash,block_timestamp,event_name,payload) VALUES($1,$2,$3,0,$7,$4,1789128000,$5,$6)', [deployment.chainId, ledger, tx, hash('block'), name, {orderId: ownedOrder, outputHash, seller: outsider.address, payer: owner.address, ...extra}, block]);
  }
  afterAll(async () => {await pool?.end(); if (admin) {await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end();}});
  it('filters by owner, platform agent, deterministic chain identity and full deployment', async () => {
    const result = await getAgentEconomy(owner, id, {readPolicy});
    expect(result.orders.map(order => order.orderId)).toEqual([ownedOrder]);
    expect(result.orders[0]).toMatchObject({providerState: 'fulfilled', sellerAttestation: null, buyerAcknowledgment: null, outputSummary: 'words: 12'});
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|request|delivery_token/);
  });
  it('tracks indexed seller and buyer receipts independently from provider fulfillment', async () => {
    await event('DeliveryAttested', deliveryTx);
    let result = await getAgentEconomy(owner, id, {readPolicy});
    expect(result.orders[0].sellerAttestation).toEqual({transactionHash: deliveryTx, outputHash, outputMatches: true});
    expect(result.orders[0].buyerAcknowledgment).toBeNull();
    await event('BuyerAcknowledged', ackTx);
    result = await getAgentEconomy(owner, id, {readPolicy: async () => {throw Error('RPC failure');}});
    expect(result.policy.status).toBe('unavailable');
    expect(result.orders[0].buyerAcknowledgment).toEqual({transactionHash: ackTx, outputHash, outputMatches: true});
  });
  it('rejects unauthenticated and another-owner HTTP requests without exposing history', async () => {
    const request = new NextRequest(`http://localhost/api/agents/${id}/economy`), context = {params: Promise.resolve({id})};
    auth.user = null; expect((await GET(request, context)).status).toBe(401);
    auth.user = outsider; const response = await GET(request, context);
    expect(response.status).toBe(404); expect(response.headers.get('cache-control')).toContain('private, no-store');
    expect(await response.json()).toMatchObject({code: 'AGENT_NOT_FOUND'});
  });
  it('preserves conflicting source receipts without calling their output a match', async () => {
    await pool.query('UPDATE economy_orders SET output_hash=$1 WHERE order_id=$2', [hash('different-output'), ownedOrder]);
    const result = await getAgentEconomy(owner, id, {readPolicy});
    expect(result.orders[0].sellerAttestation).toMatchObject({transactionHash: deliveryTx, outputMatches: false});
    expect(result.orders[0].buyerAcknowledgment).toMatchObject({transactionHash: ackTx, outputMatches: false});
  });
});
