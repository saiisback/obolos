import assert from 'node:assert/strict';

// Read-only readiness and rejection smoke. Does not create jobs or move funds.
const origin = new URL(process.env.SMOKE_ORIGIN ?? 'http://127.0.0.1:3000').origin;
const initial = await fetch(`${origin}/api/state`);
assert.equal(initial.status, 200);
const cookie = initial.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
assert.ok(cookie.includes('ag_session='));
async function request(path, payload, options = {}) {
  const response = await fetch(`${origin}${path}`, {
    method: payload === undefined ? 'GET' : 'POST',
    headers: { cookie, origin, 'content-type': 'application/json', ...options.headers },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const result = await response.json();
  return { status: response.status, result };
}
const crossSite = await request('/api/runs', {}, { headers: { origin: 'https://untrusted.example' } });
assert.equal(crossSite.status, 400);
assert.match(crossSite.result.error, /Cross-origin/);
const live = await request('/api/runs', { repos: ['vercel/next.js'], mode: 'live' });
assert.equal(live.status, 400);
assert.match(live.result.error, /Operator/);
const readiness=await request('/api/live');
assert.equal(readiness.status,200);
assert.equal(readiness.result.data.operatorAuthenticated,false);
assert.equal(readiness.result.data.liveEnabled,false);
assert.deepEqual(readiness.result.data.wallets,[]);
assert.equal(readiness.result.data.controllerAddress,null);
assert.equal(readiness.result.data.serviceUrl,null);
assert.ok(readiness.result.data.resources.some(resource=>resource.url==='https://faucet.circle.com/'));
const invalid = await request('/api/runs', { repos: ['https://untrusted.example/repository'], mode: 'rehearsal' });
assert.equal(invalid.status, 400);
const rejected = await request('/api/runs', { repos: ['vercel/next.js'], mode: 'rehearsal' });
assert.equal(rejected.status, 400);
const demo = await fetch(`${origin}/demo`, {redirect: 'manual'});
assert.equal(demo.status, 307);
assert.equal(demo.headers.get('location'), '/app');
console.log('HTTP smoke passed: session, CSRF, operator gate, rehearsal rejection and live workspace redirect. No payment submitted.');
