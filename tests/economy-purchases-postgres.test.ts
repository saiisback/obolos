import {randomUUID} from 'node:crypto';
import {readFile, readdir} from 'node:fs/promises';
import pg from 'pg';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {keccak256, toHex} from 'viem';
const transport = vi.hoisted(() => ({query: undefined as unknown}));
vi.mock('@/lib/platform/db', () => ({sql: () => transport.query}));
import {listOwnedEconomyPurchases} from '@/lib/platform/economy-purchases';
import {economyDeployment} from '@/lib/economy/chain';
const hash = (s: string) => keccak256(toHex(s));
const address = (s: string) => `0x${s.repeat(40)}`;
const deployment = economyDeployment()!;
describe.skipIf(!process.env.TEST_DATABASE_URL)('Owned resource purchases in isolated PostgreSQL', () => {
  let admin: pg.Client, db: pg.Client;
  const schema = 'resource_purchases_' + randomUUID().replaceAll('-', '');
  const owner = randomUUID(), stranger = randomUUID(), agent = randomUUID(), strangerAgent = randomUUID(), serviceHash = hash('service');
  beforeAll(async () => {
    admin = new pg.Client({connectionString: process.env.TEST_DATABASE_URL}); await admin.connect(); await admin.query(`CREATE SCHEMA ${schema}`);
    db = new pg.Client({connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema}`}); await db.connect();
    for (const file of (await readdir('db/migrations')).filter(n => n.endsWith('.sql')).sort()) await db.query(await readFile('db/migrations/' + file, 'utf8'));
    transport.query = async (parts: TemplateStringsArray, ...values: unknown[]) => (await db.query(parts.reduce((s, p, i) => s + (i ? '$' + i : '') + p, ''), values)).rows;
    await db.query('INSERT INTO platform_users(id,address) VALUES($1,$2),($3,$4)', [owner, address('a'), stranger, address('b')]);
    await db.query("INSERT INTO platform_agents(id,user_id,name,data_budget_atomic,verification_budget_atomic) VALUES($1,$2,'Mine',0,1000),($3,$4,'Private stranger agent',0,1000)", [agent, owner, strangerAgent, stranger]);
    await db.query('INSERT INTO economy_services(service_hash,user_id,definition) VALUES($1,$2,$3)', [serviceHash, owner, {seller: address('a')}]);
    const insert = async (id: string, userId: string, agentId: string, settlement: string, state = 'fulfilled') => db.query("INSERT INTO economy_orders(order_id,user_id,platform_agent_id,service_hash,request_hash,request,definition,transaction_hash,receipt,state,output,output_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'{}',$9,$10,$11)", [hash(id), userId, agentId, serviceHash, hash('request'+id), {agentId: hash(agentId), payer: address('c'), category: 'compute', unit: 'compute-unit', quantity: '1', amountAtomic: '9007199254740993', input: 'PRIVATE INPUT', settlement: {chainId: deployment.chainId, address: settlement, ledgerAddress: deployment.ledger}}, {seller: address('a')}, hash('payment'+id), state, state === 'fulfilled' ? {text: 'PRIVATE OUTPUT'} : null, state === 'fulfilled' ? hash('output'+id) : null]);
    await insert('owned', owner, agent, deployment.settlement);
    await insert('pending', owner, agent, deployment.settlement, 'paid');
    await insert('stranger', stranger, strangerAgent, deployment.settlement);
    await insert('mismatched-agent-owner', owner, strangerAgent, deployment.settlement);
    await insert('other-deployment', owner, agent, address('f'));
    const event = async (id: string, name: string, contract: string, payload: object) => db.query("INSERT INTO economy_chain_events(chain_id,contract_address,transaction_hash,log_index,block_number,block_hash,block_timestamp,event_name,payload) VALUES($1,$2,$3,0,100,$4,1000,$5,$6)", [deployment.chainId, contract, hash(id), hash('block'), name, {orderId: hash('owned'), ...payload}]);
    await event('delivery', 'DeliveryAttested', deployment.ledger, {seller: address('a'), outputHash: hash('outputowned')});
    await event('wrong-ack-output', 'BuyerAcknowledged', deployment.ledger, {payer: address('c'), outputHash: hash('wrong')});
    await event('wrong-contract', 'BuyerAcknowledged', address('f'), {payer: address('c'), outputHash: hash('outputowned')});
  }, 30000);
  afterAll(async () => {await db?.end(); if (admin) {await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end();}});
  it('shows only owned agents in this deployment, preserving exact money without private payloads', async () => {
    const result = await listOwnedEconomyPurchases(owner);
    expect(result.orders.map(o => o.orderId).sort()).toEqual([hash('owned'), hash('pending')].sort());
    expect(result.orders[0].amountAtomic).toBe('9007199254740993');
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|stranger/);
  });
  it('does not turn fulfilled provider output into a buyer acknowledgment or accept unrelated receipts', async () => {
    const result = await listOwnedEconomyPurchases(owner);
    expect(result.orders.find(o => o.orderId === hash('owned'))).toMatchObject({state: 'fulfilled', sellerAttestation: {transactionHash: hash('delivery'), outputHash: hash('outputowned')}, buyerAcknowledgment: null});
    expect(result.orders.find(o => o.orderId === hash('pending'))).toMatchObject({state: 'paid', sellerAttestation: null, buyerAcknowledgment: null});
  });
  it('returns the matching finalized buyer receipt once indexed', async () => {
    await db.query("INSERT INTO economy_chain_events(chain_id,contract_address,transaction_hash,log_index,block_number,block_hash,block_timestamp,event_name,payload) VALUES($1,$2,$3,0,101,$4,1001,'BuyerAcknowledged',$5)", [deployment.chainId, deployment.ledger, hash('matching-ack'), hash('block101'), {orderId: hash('owned'), payer: address('c'), outputHash: hash('outputowned')}]);
    const result = await listOwnedEconomyPurchases(owner);
    expect(result.orders.find(o => o.orderId === hash('owned'))?.buyerAcknowledgment).toEqual({transactionHash: hash('matching-ack'), outputHash: hash('outputowned')});
  });
});
