import {test, expect} from '@playwright/test';
const seller = `0x${'2'.repeat(40)}`;
const categories = ['data', 'compute', 'inference', 'verification', 'storage'];
const services = categories.map((category, i) => ({protocol: 'obolos.service.v1', serviceHash: `0x${String(i + 1).repeat(64)}`, chainId: 5042002, settlementAddress: `0x${'3'.repeat(40)}`, ledgerAddress: `0x${'4'.repeat(40)}`, seller, category, endpoint: `https://obolos.app/api/economy/reference/${category}`, unit: `${category}-unit`, quantity: '2', unitPriceAtomic: '1000', inputSchema: {type: 'object'}, outputSchema: {type: 'object'}}));
for (const width of [1280, 390]) test(`published resources and honest offline status at ${width}px`, async ({page}) => {
  await page.setViewportSize({width, height: 900});
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({json: path === '/api/account' ? {user: {id: 'owner', address: seller}, configured: true} : path === '/api/economy/services' ? {services} : path === '/api/economy/provider/status' ? {seller, status: 'unavailable', endpoints: services.map(s => s.endpoint), lastSeen: null} : {services: [], orders: [], agents: [], totalAtomic: '0'}});
  });
  await page.goto((process.env.WORKSPACE_TEST_URL || 'http://127.0.0.1:3105') + '/app/marketplace');
  const catalog = page.getByRole('region', {name: 'Resource services', exact: true});
  await expect(catalog).toBeVisible();
  await expect(catalog.getByRole('article')).toHaveCount(5);
  await expect(catalog.getByText('Provider unavailable', {exact: true})).toHaveCount(5);
  await expect(catalog.getByText('0.002', {exact: true})).toHaveCount(5);
  await catalog.getByText('Exact service terms', {exact: true}).first().click();
  await expect(catalog.getByText(services[0].serviceHash, {exact: true})).toBeVisible();
  await expect(catalog.getByRole('link', {name: 'Resource execution guide'})).toHaveAttribute('href', '/app/developers#selling');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({path: `test-results/resource-marketplace-${width}.png`, fullPage: true});
});
test('provider heartbeat never claims an unrelated seller or endpoint is online', async ({page}) => {
  const external = [{...services[0], endpoint: 'https://external.example/data'}, {...services[1], seller: `0x${'9'.repeat(40)}`}];
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({json: path === '/api/account' ? {user: null} : path === '/api/economy/services' ? {services: external} : path === '/api/economy/provider/status' ? {seller, status: 'online', endpoints: services.map(s => s.endpoint)} : {services: [], orders: [], agents: []}});
  });
  await page.goto((process.env.WORKSPACE_TEST_URL || 'http://127.0.0.1:3105') + '/marketplace');
  await expect(page.getByText('Provider status unknown', {exact: true})).toHaveCount(2);
  await expect(page.getByText('Provider online', {exact: true})).toHaveCount(0);
});
test('owned resource purchases distinguish provider output from ledger acknowledgment', async ({page}) => {
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({json: path === '/api/account' ? {user: {id: 'owner', address: seller}, configured: true} : path === '/api/economy/purchases' ? {indexedAt: null, orders: [{orderId: services[0].serviceHash, platformAgentId: 'agent1', agentName: 'Data specialist', serviceHash: services[0].serviceHash, seller, category: 'data', quantity: '2', unit: 'source-record', amountAtomic: '2000', state: 'fulfilled', transactionHash: `0x${'7'.repeat(64)}`, outputHash: `0x${'8'.repeat(64)}`, createdAt: new Date().toISOString(), sellerAttestation: null, buyerAcknowledgment: null}]} : {services: [], orders: [], agents: [], totalAtomic: '0'}});
  });
  await page.goto((process.env.WORKSPACE_TEST_URL || 'http://127.0.0.1:3105') + '/app/marketplace#purchases');
  const purchases = page.getByRole('region', {name: 'Resource purchases', exact: true});
  await expect(purchases.getByText('Data specialist', {exact: false})).toBeVisible();
  await expect(purchases.getByText('Payment finalized', {exact: true})).toBeVisible();
  await expect(purchases.getByText('Output received', {exact: true})).toBeVisible();
  await expect(purchases.getByText('Buyer acknowledgment not indexed', {exact: true})).toBeVisible();
  await expect(purchases.getByRole('link', {name: 'Payment receipt'})).toHaveAttribute('href', `https://testnet.arcscan.app/tx/0x${'7'.repeat(64)}`);
});
