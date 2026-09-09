/**
 * Real public HTTP + Neon smoke test. Creates a disposable EOA and zero-budget
 * agents, then removes that EOA's rows. Never prints keys, signatures or cookies.
 * Run: npx tsx --env-file=.env.local scripts/platform-smoke.ts
 * Optional: PLATFORM_SMOKE_ORIGIN=https://obolos.app
 * For a local production server, set PLATFORM_SMOKE_ORIGIN=http://127.0.0.1:3000
 * and PLATFORM_SMOKE_APP_ORIGIN=https://obolos.app to match its APP_ORIGIN.
 */
import { createHash, randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const origin = new URL(process.env.PLATFORM_SMOKE_ORIGIN || 'https://obolos.app').origin;
const appOrigin = new URL(process.env.PLATFORM_SMOKE_APP_ORIGIN || origin).origin;
const wallet = privateKeyToAccount(generatePrivateKey());
const address = wallet.address.toLowerCase();
const cookies = new Map<string, string>();
let stage = 'configuration';
let failedStage = '';
let checks = 0;
let cleanupNeeded = false;
let verifyRateBucket: string | undefined;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

function check(condition: unknown, label: string): asserts condition {
  if (!condition) {
    console.error(`FAIL ${label}`);
    throw new Error(label);
  }
  checks++;
  console.log(`PASS ${label}`);
}

async function request(path: string, expectedStatus: number, options: {
  method?: string; body?: unknown; token?: string; cookie?: string; absorbCookies?: boolean;
  idempotencyKey?: string;
} = {}) {
  stage = `${options.method || 'GET'} ${path.replace(/[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}/gi, ':id')}`;
  const headers = new Headers({ Origin: appOrigin });
  const cookie = options.cookie ?? [...cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  if (cookie) headers.set('Cookie', cookie);
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  if (options.token) headers.set('Authorization', `Bearer ${options.token}`);
  if (options.idempotencyKey) headers.set('Idempotency-Key', options.idempotencyKey);
  const response = await fetch(`${origin}${path}`, {
    method: options.method || 'GET', headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    redirect: 'error', signal: AbortSignal.timeout(30_000),
  });
  check(response.status === expectedStatus, `${stage}: HTTP ${response.status} (expected ${expectedStatus})`);
  if (options.absorbCookies !== false) {
    for (const value of response.headers.getSetCookie()) {
      check(/;\s*HttpOnly/i.test(value) && /;\s*SameSite=Lax/i.test(value) &&
        (new URL(appOrigin).protocol !== 'https:' || /;\s*Secure/i.test(value)), 'auth cookie security attributes');
      const pair = value.split(';', 1)[0];
      const separator = pair.indexOf('=');
      const name = pair.slice(0, separator);
      const token = pair.slice(separator + 1);
      if (token) cookies.set(name, token); else cookies.delete(name);
    }
  }
  return await response.json();
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for disposable-row cleanup');
  const db = neon(process.env.DATABASE_URL, { fetchOptions: { cache: 'no-store' } });
  check((await db`SELECT 1 AS ready`)[0]?.ready === 1, 'real Neon HTTP transport');
  check((await db`SELECT id FROM platform_users WHERE address=${address}`).length === 0, 'disposable identity is new');
  const anonymous = await request('/api/account', 200);
  check(anonymous.configured === true && anonymous.user === null, 'public account database configured');
  await request('/api/agents', 401);
  cleanupNeeded = true;
  try {
    const challenge = await request('/api/auth/challenge', 200, { method: 'POST', body: { address: wallet.address } });
    check(typeof challenge.message === 'string', 'SIWE challenge issued');
    verifyRateBucket = hash(`verify:${hash(cookies.get('obolos_challenge') || '')}`);
    const challengeCookie = `obolos_challenge=${cookies.get('obolos_challenge')}`;
    const signature = await wallet.signMessage({ message: challenge.message });
    const login = await request('/api/auth/verify', 200, { method: 'POST', body: { signature } });
    check(login.user?.address === address, 'real EOA signature accepted');
    check((await db`SELECT id FROM platform_users WHERE address=${address}`)[0]?.id === login.user.id,
      'public API identity persisted in connected Neon database');
    await request('/api/auth/verify', 401, {
      method: 'POST', body: { signature }, cookie: challengeCookie, absorbCookies: false,
    });
    const account = await request('/api/account', 200);
    check(account.user?.id === login.user.id, 'session restores wallet identity');
    const agents = [];
    for (const name of ['Disposable smoke agent', 'Disposable scope target']) {
      const result = await request('/api/agents', 201, { method: 'POST', body: {
        name, description: 'Temporary automated verification; deleted after test.',
        dataBudgetAtomic: 0, verificationBudgetAtomic: 0,
      } });
      check(result.agent?.status === 'setup_required', 'new zero-budget agent requires setup');
      agents.push(result.agent);
    }
    const listed = await request('/api/agents', 200);
    check(listed.agents.length === 2 && agents.every((agent) => listed.agents.some((item: { id: string }) => item.id === agent.id)),
      'session lists its persisted agents');
    const agentPath = `/api/agents/${agents[0].id}`;
    const issued = await request(`${agentPath}/keys`, 201, { method: 'POST', body: { name: 'Disposable smoke key' } });
    check(typeof issued.token === 'string' && issued.token.startsWith('ob_test_'), 'agent key issued once');
    const persisted = await db`SELECT token_hash FROM platform_api_keys WHERE id=${issued.key.id}`;
    check(persisted[0]?.token_hash === hash(issued.token), 'database stores SHA-256 credential hash');
    const keys = await request(`${agentPath}/keys`, 200);
    check(keys.keys.length === 1 && !JSON.stringify(keys).includes(issued.token) && !JSON.stringify(keys).includes(hash(issued.token)),
      'key listing omits bearer secret and hash');
    const runsPath = `/api/v1/agents/${agents[0].id}/runs`;
    const runs = await request(runsPath, 200, { token: issued.token });
    check(runs.runs.length === 0, 'new agent has no runs');
    const rejected = await request(runsPath, 409, { method: 'POST', token: issued.token,
      body: { repos: ['octocat/Hello-World'] }, idempotencyKey: `smoke-${randomUUID()}` });
    check(rejected.code === 'RUNNER_REQUIRED', 'execution explicitly blocked without isolated runner');
    check((await db`SELECT id FROM platform_jobs WHERE agent_id=${agents[0].id}`).length === 0,
      'rejected execution creates no job');
    const mismatch = await request(`/api/v1/agents/${agents[1].id}/runs`, 403, { token: issued.token });
    check(mismatch.code === 'KEY_SCOPE_MISMATCH', 'credential cannot access another agent');
    await request(`${agentPath}/keys/${issued.key.id}`, 200, { method: 'DELETE' });
    await request(runsPath, 401, { token: issued.token });
    const savedSession = `obolos_session=${cookies.get('obolos_session')}`;
    await request('/api/auth/logout', 200, { method: 'POST' });
    await request('/api/agents', 401, { cookie: savedSession, absorbCookies: false });
    const loggedOut = await request('/api/account', 200, { cookie: savedSession, absorbCookies: false });
    check(loggedOut.user === null, 'logged-out session cannot restore identity');
  } catch (error) {
    failedStage = stage;
    throw error;
  } finally {
    stage = 'disposable identity cleanup';
    // Match only the fresh randomly generated EOA. Foreign-key cascades remove
    // only its sessions, agents, API keys and jobs; no unrelated rows are touched.
    await db`DELETE FROM platform_users WHERE address=${address}`;
    await db`DELETE FROM platform_challenges WHERE address=${address}`;
    await db`DELETE FROM platform_rate_limits WHERE bucket=${hash(`login:${address}`)}`;
    if (verifyRateBucket) await db`DELETE FROM platform_rate_limits WHERE bucket=${verifyRateBucket}`;
    check((await db`SELECT id FROM platform_users WHERE address=${address}`).length === 0, 'disposable identity removed');
    cleanupNeeded = false;
  }
  console.log(`PASS platform smoke: ${checks} checks; temporary account removed; no payments`);
}

main().catch(() => {
  // Raw errors can contain credentials, SQL parameters or response bodies.
  console.error(`FAIL platform smoke at ${failedStage || stage}; details suppressed to protect credentials`);
  if (cleanupNeeded) console.error('FAIL disposable-row cleanup needs investigation');
  process.exitCode = 1;
});
