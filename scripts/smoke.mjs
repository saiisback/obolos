import assert from 'node:assert/strict';

// Starts an isolated, explicitly simulated browser session against a running app.
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
const created = await request('/api/runs', { repos: ['vercel/next.js', 'sveltejs/kit'], mode: 'rehearsal' });
assert.equal(created.status, 200);
let run = created.result.data;
const route = `/api/runs/${run.id}`;
const action = async (name, payload = {}) => {
  const result = await request(`${route}/${name}`, payload);
  assert.equal(result.status, 200, JSON.stringify(result.result));
  run = result.result.data;
};
await action('advance');
await action('advance');
await action('pause');
await action('advance');
assert.equal(run.receipts.length, 0);
await action('pause');
await action('shock');
await action('advance');
assert.equal(run.status, 'awaiting_approval');
assert.equal(run.receipts.length, 0);
await action('approve');
assert.equal(run.mandate.version, 2);
for (let step = 0; step < 5 && run.status !== 'completed'; step++) await action('advance');
assert.equal(run.status, 'completed');
assert.equal(run.receipts.length, 2);
assert.ok(run.receipts.every(receipt => receipt.status === 'simulated' && !receipt.transactionId));
assert.equal(run.report.verified, true);
await action('advance');
assert.equal(run.receipts.length, 2);
const exported = await request(`${route}/export`);
assert.equal(exported.status, 200);
assert.ok(JSON.stringify(exported.result).includes(run.id));
assert.equal(exported.result.run.authorizations.length,1);
assert.equal(exported.result.run.authorizations[0].mode,'rehearsal');
assert.equal(exported.result.run.authorizations[0].signature,undefined);
const anonymous = await fetch(`${origin}${route}/export`);
assert.notEqual(anonymous.status, 200);
console.log(`HTTP smoke passed: session, CSRF, live gate, validation, pause, price shock, approval, completion, two simulated receipts, export and ownership (${run.id}).`);
