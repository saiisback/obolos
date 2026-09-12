import {test, expect, type Page} from '@playwright/test';

// Synthetic, fully intercepted browser fixtures. No wallets, payments or production writes.
const origin = process.env.WORKSPACE_TEST_URL || 'http://127.0.0.1:3100';
const hash = (digit: string) => `0x${digit.repeat(64)}`;
const agent = {id: '11111111-1111-4111-8111-111111111111', name: 'Vector · Compute specialist', description: 'Synthetic browser fixture', dataBudgetAtomic: 0, verificationBudgetAtomic: 0};
const order = {orderId: hash('1'), category: 'compute', amountAtomic: '1000', providerState: 'fulfilled', createdAt: '2026-09-12T00:00:00Z', transactionHash: hash('2'), deliveryAttempts: 1, outputHash: hash('3'), outputSummary: 'characters: 36 · words: 6 · bytes: 36', sellerAttestation: {transactionHash: hash('4'), outputHash: hash('3'), outputMatches: true}, buyerAcknowledgment: null};
async function fixture(page: Page, unavailable = false) {
  const requests: string[] = [];
  await page.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    expect(request.method()).toBe('GET'); requests.push(path);
    const json = (body: unknown) => route.fulfill({json: body});
    if (path === '/api/account') return json({configured: true, user: {id: 'fixture-owner', address: `0x${'a'.repeat(40)}`}});
    if (path === '/api/agents') return json({agents: [agent]});
    if (path === '/api/tasks') return json({tasks: []});
    if (path === '/api/economy/service-profiles') return json({profiles: []});
    if (path === `/api/agents/${agent.id}/economy`) return json({agentId: hash('5'), indexedAt: '2026-09-12T00:00:00Z', policy: unavailable ? {status: 'unavailable'} : {status: 'registered', owner: `0x${'a'.repeat(40)}`, executor: `0x${'b'.repeat(40)}`, active: true, totalCapAtomic: '2000', spentAtomic: '1000', windowCapAtomic: '2000', windowSeconds: '86400', blockNumber: '123', timestamp: 1789171200}, orders: [order]});
    if (path.endsWith('/runner')) return json({runner: null});
    if (path.endsWith('/mandate')) return json({mandate: null});
    if (path.endsWith('/runs')) return json({runs: []});
    if (path === '/api/market/services') return json({services: []});
    throw Error(`Unexpected synthetic fixture request: ${path}`);
  });
  return requests;
}

for (const width of [1280, 390]) test(`specialist shows owned orders and distinct lifecycle at ${width}px`, async ({page}) => {
  await page.setViewportSize({width, height: 900}); await fixture(page); await page.goto(origin + '/app');
  await page.getByRole('button', {name: 'Manage agent'}).click();
  const panel = page.getByRole('region', {name: 'Economy activity'});
  await expect(panel.getByText('Registered · Authorization active')).toBeVisible();
  await expect(panel.getByText('compute · 0.001 test USDC', {exact: true})).toBeVisible();
  await expect(panel.locator('p').filter({hasText: 'Total cap:'})).toContainText('0.002 test USDC');
  await expect(panel.locator('p').filter({hasText: 'Provider delivery:'})).toContainText('Output received');
  await expect(panel.locator('p').filter({hasText: 'Seller attestation:'})).toContainText('Recorded');
  await expect(panel.locator('p').filter({hasText: 'Buyer acknowledgment:'})).toContainText('Not observed');
  await expect(panel.getByRole('link', {name: 'Payment receipt'})).toHaveAttribute('href', `https://testnet.arcscan.app/tx/${hash('2')}`);
  await expect(panel.getByText(/does not confirm that an agent process is running/)).toBeVisible();
  await expect(page.getByRole('button', {name: 'Pair a runner'})).not.toBeVisible();
  await expect(page.getByText('Repository research setup and runs', {exact: true})).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('chain failure keeps paid output and receipts visible', async ({page}) => {
  await fixture(page, true); await page.goto(origin + '/app'); await page.getByRole('button', {name: 'Manage agent'}).click();
  const panel = page.getByRole('region', {name: 'Economy activity'});
  await expect(panel.getByText(/On-chain policy is unavailable/)).toBeVisible();
  await expect(panel.getByText('compute · 0.001 test USDC', {exact: true})).toBeVisible();
  await expect(panel.getByRole('link', {name: 'Open owned order and output JSON'})).toBeVisible();
});
