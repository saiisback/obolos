import {beforeEach, expect, it, vi} from 'vitest';
import {keccak256, toHex} from 'viem';
const state = vi.hoisted(() => ({query: vi.fn()}));
vi.mock('@/lib/platform/db', () => ({sql: () => state.query}));
import {getAgentEconomy} from '@/lib/platform/agent-economy';
const id = '11111111-1111-4111-8111-111111111111';
const user = {id: 'owner', address: `0x${'a'.repeat(40)}`};
const readPolicy = vi.fn(async (_agentId?: string) => ({owner: user.address, executor: `0x${'b'.repeat(40)}`, active: true, totalCapAtomic: '9007199254740993', spentAtomic: '1000', windowCapAtomic: '2000', windowSeconds: '86400', blockNumber: '123', timestamp: 1789128000}));
beforeEach(() => {state.query.mockReset(); readPolicy.mockClear(); state.query.mockImplementation(async (parts: TemplateStringsArray) => parts.join('').includes('FROM platform_agents') ? [{user_id: user.id}] : []);});
it('denies another owner before reading policy or orders', async () => {
  state.query.mockResolvedValue([{user_id: 'someone-else'}]);
  await expect(getAgentEconomy(user, id, {readPolicy})).rejects.toMatchObject({code: 'AGENT_NOT_FOUND'});
  expect(readPolicy).not.toHaveBeenCalled(); expect(state.query).toHaveBeenCalledTimes(1);
});
it('maps the UUID to its on-chain ID and preserves exact caps', async () => {
  const result = await getAgentEconomy(user, id, {readPolicy});
  expect(readPolicy.mock.calls[0]?.[0]).toBe(keccak256(toHex(id)));
  expect(result.policy).toMatchObject({status: 'registered', totalCapAtomic: '9007199254740993'});
});
it('preserves owned order history during a chain outage without exposing private fields', async () => {
  state.query.mockImplementation(async (parts: TemplateStringsArray) => parts.join('').includes('FROM platform_agents') ? [{user_id: user.id}] : parts.join('').includes('FROM economy_orders') ? [{order_id: `0x${'1'.repeat(64)}`, category: 'compute', amount_atomic: '1000', state: 'fulfilled', created_at: new Date(), transaction_hash: `0x${'2'.repeat(64)}`, output: {words: 12, text: 'PRIVATE OUTPUT'}, request: {input: 'PRIVATE INPUT'}, delivery_token: 'SECRET', delivery_attempts: 1, output_hash: `0x${'3'.repeat(64)}`, attestation_hash: null, acknowledgment_hash: null}] : []);
  const result = await getAgentEconomy(user, id, {readPolicy: async () => {throw Error('RPC secret');}});
  expect(result.policy).toEqual({status: 'unavailable'});
  expect(result.orders[0]).toMatchObject({providerState: 'fulfilled', sellerAttestation: null, buyerAcknowledgment: null, outputSummary: 'words: 12'});
  expect(JSON.stringify(result)).not.toMatch(/PRIVATE|SECRET|RPC secret/);
});
it('does not present a mismatched on-chain owner as an authorized envelope', async () => {
  const result = await getAgentEconomy(user, id, {readPolicy: async () => ({...await readPolicy(), owner: `0x${'c'.repeat(40)}`})});
  expect(result.policy).toEqual({status: 'owner_mismatch'});
});
it('bounds a hung chain read so saved orders can still return', async () => {
  vi.useFakeTimers();
  try {
    const pending = getAgentEconomy(user, id, {readPolicy: () => new Promise(() => {})});
    await vi.advanceTimersByTimeAsync(7000);
    expect((await pending).policy.status).toBe('unavailable');
  } finally {vi.useRealTimers();}
});
