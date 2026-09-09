import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const database = vi.hoisted(() => { const transaction=vi.fn();return {query:Object.assign(vi.fn(),{transaction}),transaction}; });
vi.mock('@/lib/platform/db', () => ({ sql: () => database.query }));
import { GET, POST } from '@/app/api/v1/agents/[id]/runs/route';
import { GET as getRun } from '@/app/api/v1/agents/[id]/runs/[runId]/route';
import { createCredential } from '@/lib/platform/credentials';

const agentId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
let token: string;
let credential: { agent_id: string; expires_at: string; revoked_at: string | null; checked_at: string };

function request(method: string, headers: Record<string, string> = {}, body: unknown = { repos: ['openai/codex'] }) {
  return new NextRequest(`https://obolos.example/api/v1/agents/${agentId}/runs`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'idempotency-key': 'sample-request', ...headers },
    ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
  });
}

beforeEach(() => {
  token = createCredential().token;
  credential = { agent_id: agentId, expires_at: '2026-10-01T00:00:00Z', revoked_at: null, checked_at: '2026-09-09T00:00:00Z' };
  database.query.mockReset();
  database.transaction.mockReset().mockResolvedValue([[],[],[]]);
  // Neon is the sole replaced external boundary. Unexpected reads/writes fail.
  database.query.mockImplementation(async (parts: TemplateStringsArray) => {
    const query = parts.join('?');
    if (query.includes('FROM platform_api_keys')) return [credential];
    if (query.includes('FROM platform_jobs') || query.includes('platform_runners') || query.includes('FOR UPDATE') || query.includes('WITH inserted')) return [];
    throw new Error('Unexpected database operation');
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('tenant run HTTP boundary', () => {
  it('returns 409 without writing jobs or calling any external service', async () => {
    let externalCalls = 0;
    vi.stubGlobal('fetch', async () => { externalCalls += 1; throw new Error('Unexpected network'); });
    const response = await POST(request('POST'), { params: Promise.resolve({ id: agentId }) });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'RUNNER_REQUIRED' });
    expect(externalCalls).toBe(0);
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
  it('does not treat browser cookies as API authorization', async () => {
    const response = await POST(request('POST', { authorization: '', cookie: 'platform_session=example' }), { params: Promise.resolve({ id: agentId }) });
    expect(response.status).toBe(401);
    expect(database.query).not.toHaveBeenCalled();
  });
  it('rejects a revoked key before parsing run input', async () => {
    credential.revoked_at = '2026-09-08T00:00:00Z';
    const response = await POST(request('POST', {}, { repos: [] }), { params: Promise.resolve({ id: agentId }) });
    expect(response.status).toBe(401);
  });
  it('rejects keys scoped to other agents', async () => {
    const response = await GET(request('GET'), { params: Promise.resolve({ id: runId }) });
    expect(response.status).toBe(403);
    expect(database.query).toHaveBeenCalledTimes(1);
  });
  it('returns an honest empty run list for an authenticated new agent', async () => {
    const response = await GET(request('GET'), { params: Promise.resolve({ id: agentId }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ runs: [] });
    expect(database.query.mock.calls[1].slice(1)).toEqual([agentId]);
  });
  it('scopes individual run lookup to the authenticated agent', async () => {
    const response = await getRun(request('GET'), { params: Promise.resolve({ id: agentId, runId }) });
    expect(response.status).toBe(404);
    expect(database.query.mock.calls[1].slice(1)).toEqual([agentId, runId]);
  });
  it('returns validation errors before runner status for malformed authenticated requests', async () => {
    const response = await POST(request('POST', {}, { repos: ['https://localhost'] }), { params: Promise.resolve({ id: agentId }) });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'INVALID_RUN' });
  });
});
