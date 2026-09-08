import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

vi.mock('@/lib/platform/db', () => ({ sql: () => { throw new Error('Database must not be reached by pure validation'); } }));
import { parseAgentInput, validateRunInput, assertAgentOwner, runnerRequired } from '@/lib/platform/agents';
import { createCredential, assertCredentialScope, bearerToken, parseKeyName } from '@/lib/platform/credentials';

const agentId = '11111111-1111-4111-8111-111111111111';
const input = { name: ' Repo observer ', description: ' watches releases ', dataBudgetAtomic: 100000000, verificationBudgetAtomic: 1000000 };

describe('agent boundaries', () => {
  it('normalizes labels and preserves integer atomic budgets', () => {
    expect(parseAgentInput(input)).toEqual({ ...input, name: 'Repo observer', description: 'watches releases' });
  });
  it.each([-1, 0.1, 100000001, '100000000', null, Infinity])('rejects unsafe HBAR budget %s', (value) => {
    expect(() => parseAgentInput({ ...input, dataBudgetAtomic: value })).toThrow();
  });
  it.each([-1, 0.1, 1000001, '1000000', null])('rejects unsafe USDC budget %s', (value) => {
    expect(() => parseAgentInput({ ...input, verificationBudgetAtomic: value })).toThrow();
  });
  it('rejects empty or oversized agent text and accepts zero budgets', () => {
    for (const name of ['', ' ', 'a'.repeat(81)]) expect(() => parseAgentInput({ ...input, name })).toThrow();
    expect(() => parseAgentInput({ ...input, description: 'a'.repeat(1001) })).toThrow();
    expect(parseAgentInput({ ...input, dataBudgetAtomic: 0, verificationBudgetAtomic: 0 })).toMatchObject({ dataBudgetAtomic: 0, verificationBudgetAtomic: 0 });
  });
  it('hides another owner’s agent and absent agents', () => {
    expect(() => assertAgentOwner({ user_id: 'owner' }, 'intruder')).toThrow(expect.objectContaining({ status: 404 }));
    expect(() => assertAgentOwner(undefined, 'owner')).toThrow(expect.objectContaining({ status: 404 }));
    expect(() => assertAgentOwner({ user_id: 'owner' }, 'owner')).not.toThrow();
  });
  it('validates bounded GitHub repo input and idempotency keys', () => {
    expect(validateRunInput({ repos: ['openai/codex', 'owner/repo'] }, 'request-123')).toEqual({ repos: ['openai/codex', 'owner/repo'], idempotencyKey: 'request-123' });
    for (const repos of [[], ['https://localhost/secret'], ['../x'], ['a/b', 'a/b'], Array(4).fill('a/b')]) {
      expect(() => validateRunInput({ repos }, 'request-123')).toThrow();
    }
    expect(() => validateRunInput({ repos: ['a/b'] }, null)).toThrow();
    expect(() => validateRunInput({ repos: ['a/b'] }, 'a'.repeat(129))).toThrow();
  });
  it('refuses execution without a tenant runner', () => {
    expect(() => runnerRequired()).toThrow(expect.objectContaining({ status: 409, code: 'RUNNER_REQUIRED' }));
  });
});

describe('scoped API credentials', () => {
  it('creates unique high entropy bearer tokens with SHA-256 hashes', () => {
    const a = createCredential();
    const b = createCredential();
    expect(a.token).toMatch(/^ob_test_[A-Za-z0-9_-]{43}$/);
    expect(a.hash).toBe(createHash('sha256').update(a.token).digest('hex'));
    expect(a.hash).not.toContain(a.token);
    expect(a.token).not.toBe(b.token);
    expect(a.prefix.length).toBeLessThan(a.token.length);
  });
  it('only accepts a single correctly formed Bearer API token', () => {
    const token = createCredential().token;
    expect(bearerToken(`Bearer ${token}`)).toBe(token);
    for (const value of [null, token, `Basic ${token}`, `Bearer ${token}, other`, 'Bearer cookie-value']) {
      expect(() => bearerToken(value)).toThrow(expect.objectContaining({ status: 401 }));
    }
  });
  it('rejects revoked, expired and unknown keys independently of scope', () => {
    const now = new Date('2026-09-09T00:00:00Z');
    const row = { agent_id: agentId, revoked_at: null, expires_at: new Date('2026-09-10T00:00:00Z') };
    expect(() => assertCredentialScope(row, agentId, now)).not.toThrow();
    for (const key of [undefined, { ...row, revoked_at: now }, { ...row, expires_at: now }, { ...row, expires_at: new Date('2026-09-08T00:00:00Z') }]) {
      expect(() => assertCredentialScope(key, agentId, now)).toThrow(expect.objectContaining({ status: 401 }));
    }
    expect(() => assertCredentialScope(row, 'another-agent', now)).toThrow(expect.objectContaining({ status: 403 }));
  });
  it('does not let invalid expiry values bypass expiration', () => {
    expect(() => assertCredentialScope({ agent_id: agentId, expires_at: 'garbage', revoked_at: null }, agentId)).toThrow(expect.objectContaining({ status: 401 }));
  });
  it('requires a useful bounded key label', () => {
    expect(parseKeyName({ name: ' laptop ' })).toBe('laptop');
    for (const name of ['', ' ', 'x'.repeat(81), null]) expect(() => parseKeyName({ name })).toThrow();
  });
});
