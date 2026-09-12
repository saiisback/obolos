import {test, expect, type Page} from '@playwright/test';

// Intercept all API calls: these exercise the real workspace UI without payments or external writes.
const origin = process.env.WORKSPACE_TEST_URL || 'http://127.0.0.1:3100';
const hash = (digit: string) => `0x${digit.repeat(64)}`;
const first = {id: '11111111-1111-4111-8111-111111111111', name: 'Compute agent', description: '', status: 'active', dataBudgetAtomic: 0, verificationBudgetAtomic: 0, createdAt: '2026-09-12T00:00:00Z'};
const second = {...first, id: '22222222-2222-4222-8222-222222222222', name: 'Storage agent'};
const order = {orderId: hash('1'), category: 'compute', amountAtomic: '1000', providerState: 'fulfilled', createdAt: first.createdAt, transactionHash: hash('2'), deliveryAttempts: 1, outputHash: hash('3'), outputSummary: 'characters: 36 · words: 6 · bytes: 36', sellerAttestation: {transactionHash: hash('4'), outputHash: hash('3'), outputMatches: true}, buyerAcknowledgment: null};
const activity = {agentId: hash('5'), indexedAt: first.createdAt, policy: {status: 'unavailable'}, orders: [order]};
const run = {id: 'research-one', status: 'succeeded', repos: ['fixture/research'], createdAt: first.createdAt, result: null};

async function fixture(page: Page) {
  await page.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    expect(request.method()).toBe('GET');
    if (path === '/api/account') return route.fulfill({json: {configured: true, user: {id: 'fixture-owner', address: `0x${'a'.repeat(40)}`}}});
    if (path === '/api/agents') return route.fulfill({json: {agents: [first, second]}});
    if (path === `/api/agents/${first.id}/economy`) return route.fulfill({json: activity});
    if (path === `/api/agents/${second.id}/economy`) return route.fulfill({json: {...activity, agentId: hash('6'), indexedAt: null, orders: []}});
    if (path === `/api/agents/${first.id}/runs`) return route.fulfill({json: {runs: [run]}});
    if (path === `/api/agents/${second.id}/runs`) return route.fulfill({json: {runs: []}});
    throw Error(`Unexpected evidence request: ${path}`);
  });
}

for (const width of [1280, 390]) test(`evidence exposes owned resource receipts alongside research at ${width}px`, async ({page}) => {
  await page.setViewportSize({width, height: 900}); await fixture(page);
  await page.goto(origin + '/app/evidence');
  const resources = page.getByRole('region', {name: 'Resource evidence', exact: true});
  await expect(resources.getByText('compute · 0.001 test USDC', {exact: true})).toBeVisible();
  await expect(resources.getByText('characters: 36 · words: 6 · bytes: 36', {exact: true})).toBeVisible();
  await expect(resources.getByRole('link', {name: 'Payment receipt'})).toHaveAttribute('href', `https://testnet.arcscan.app/tx/${hash('2')}`);
  await expect(resources.locator('p').filter({hasText: 'Buyer acknowledgment:'})).toContainText('Not observed');
  const receipt = await resources.getByRole('link', {name: 'Payment receipt'}).boundingBox();
  expect(receipt).not.toBeNull();
  expect(receipt!.y + receipt!.height).toBeLessThanOrEqual(900);
  await resources.getByText('About indexed receipts', {exact: true}).click();
  await expect(resources.getByText(/An absent receipt means it has not been observed/)).toBeVisible();
  await expect(page.getByText('fixture/research', {exact: true})).toBeVisible();
  await expect(page.getByRole('heading', {name: 'No execution history yet'})).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('pending output and mismatched receipts retain their distinct evidence states', async ({page}) => {
  await fixture(page);
  await page.route(`**/api/agents/${first.id}/economy`, route => route.fulfill({json: {...activity, orders: [
    {...order, sellerAttestation: {...order.sellerAttestation, outputHash: hash('7'), outputMatches: false}, buyerAcknowledgment: {transactionHash: hash('8'), outputHash: hash('3'), outputMatches: true}},
    {...order, orderId: hash('9'), providerState: 'paid', outputHash: null, outputSummary: null, deliveryAttempts: 0, sellerAttestation: null},
  ]}}));
  await page.goto(origin + '/app/evidence');
  const resources = page.getByRole('region', {name: 'Resource evidence', exact: true});
  await expect(resources.getByText('Provider output does not match the seller’s attested output hash.')).toBeVisible();
  await expect(resources.getByText('Seller and buyer output hashes do not match.')).toBeVisible();
  await expect(resources.getByText('Recorded · output mismatch', {exact: false})).toBeVisible();
  await expect(resources.getByText(/Paid · awaiting output/)).toBeVisible();
});

test('agent switching clears both evidence sources before delayed requests resolve', async ({page}) => {
  await fixture(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => {release = resolve;});
  await page.route(`**/api/agents/${second.id}/economy`, async route => {await gate; await route.fulfill({json: {...activity, orders: [{...order, category: 'storage', outputSummary: 'bytes: 12'}]}});});
  await page.route(`**/api/agents/${second.id}/runs`, async route => {await gate; await route.fulfill({json: {runs: []}});});
  await page.goto(origin + '/app/evidence');
  await expect(page.getByText(order.outputSummary, {exact: true})).toBeVisible();
  await expect(page.getByText('fixture/research', {exact: true})).toBeVisible();
  await page.getByLabel('Agent', {exact: true}).selectOption(second.id);
  await expect(page.getByText(order.outputSummary, {exact: true})).toHaveCount(0);
  await expect(page.getByText('fixture/research', {exact: true})).toHaveCount(0);
  await expect(page.getByRole('status').filter({hasText: 'Loading resource'})).toBeVisible();
  release();
  await expect(page.getByText('storage · 0.001 test USDC', {exact: true})).toBeVisible();
  await expect(page.getByRole('heading', {name: 'No repository research runs yet'})).toBeVisible();
  await page.getByLabel('Agent', {exact: true}).selectOption(first.id);
  await expect(page.getByText(order.outputSummary, {exact: true})).toBeVisible();
  await expect(page.getByText('bytes: 12', {exact: true})).toHaveCount(0);
});

test('research failure leaves resources visible and retries without leaking errors across agents', async ({page}) => {
  await fixture(page);
  let failed = true;
  await page.route(`**/api/agents/${first.id}/runs`, route => route.fulfill(failed ? {status: 503, json: {error: 'Research temporarily unavailable'}} : {json: {runs: [run]}}));
  await page.goto(origin + '/app/evidence');
  await expect(page.getByText(order.outputSummary, {exact: true})).toBeVisible();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Research temporarily unavailable');
  failed = false;
  await page.getByRole('button', {name: 'Retry research'}).click();
  await expect(page.getByText('fixture/research', {exact: true})).toBeVisible();
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
  await page.getByLabel('Agent', {exact: true}).selectOption(second.id);
  await expect(page.getByText('No economy orders recorded for this agent.')).toBeVisible();
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
});

test('resource failure leaves research visible and a read-only retry recovers', async ({page}) => {
  await fixture(page);
  let failed = true;
  await page.route(`**/api/agents/${first.id}/economy`, route => route.fulfill(failed ? {status: 503, json: {error: 'Resources temporarily unavailable'}} : {json: activity}));
  await page.goto(origin + '/app/evidence');
  await expect(page.getByText('fixture/research', {exact: true})).toBeVisible();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Resources temporarily unavailable');
  failed = false;
  await page.getByRole('button', {name: 'Refresh resources', exact: true}).click();
  await expect(page.getByText(order.outputSummary, {exact: true})).toBeVisible();
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
});

test('an abandoned agent response cannot replace the current agent evidence', async ({page}) => {
  await fixture(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => {release = resolve;});
  await page.route(`**/api/agents/${first.id}/economy`, async route => {await gate; await route.fulfill({json: activity});});
  await page.route(`**/api/agents/${first.id}/runs`, async route => {await gate; await route.fulfill({json: {runs: [run]}});});
  await page.goto(origin + '/app/evidence');
  await expect(page.getByRole('status').filter({hasText: 'Loading resource'})).toBeVisible();
  await page.getByLabel('Agent', {exact: true}).selectOption(second.id);
  await expect(page.getByText('No economy orders recorded for this agent.')).toBeVisible();
  await expect(page.getByRole('heading', {name: 'No repository research runs yet'})).toBeVisible();
  release();
  // A new read gives the aborted handlers time to finish without a timing-based assertion.
  await page.getByRole('button', {name: 'Refresh resources', exact: true}).click();
  await expect(page.getByRole('button', {name: 'Refresh resources', exact: true})).toBeEnabled();
  await expect(page.getByText(order.outputSummary, {exact: true})).toHaveCount(0);
  await expect(page.getByText('fixture/research', {exact: true})).toHaveCount(0);
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
});
