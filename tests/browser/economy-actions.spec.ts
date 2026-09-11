import {test, expect, type Page} from '@playwright/test';
import {encodeAbiParameters, encodeFunctionData, keccak256, parseAbi, toHex} from 'viem';
import {canonicalJsonHash, createServiceDefinition, type ServiceDefinition} from '../../src/lib/economy/service-contract';

// Synthetic browser fixtures only. Every API call and wallet RPC is intercepted.
const origin = process.env.WORKSPACE_TEST_URL || 'http://127.0.0.1:3100';
const address = (digit: string) => `0x${digit.repeat(40)}` as `0x${string}`;
const hash = (digit: string) => `0x${digit.repeat(64)}` as `0x${string}`;
const user = {id: 'fixture-owner', address: address('1')};
const agent = {id: '11111111-1111-4111-8111-111111111111', name: 'Test fixture agent', description: '', status: 'active', createdAt: '2026-09-11T00:00:00Z', dataBudgetAtomic: 0, verificationBudgetAtomic: 0};
const deployment = {chainId: 5042002, policy: address('2'), settlement: address('3'), ledger: address('4'), controller: address('5'), approver: address('6'), reserve: address('7'), reviewPool: address('8')};
const terms = {endpoint: 'https://fixture.example/compute', category: 'compute' as const, unit: 'compute-unit', quantity: '1', unitPriceAtomic: '10000', inputSchema: {type: 'object' as const, properties: {text: {type: 'string' as const, maxLength: 2000}}, required: ['text'], additionalProperties: false as const}, outputSchema: {type: 'object' as const, properties: {result: {type: 'string' as const, maxLength: 4000}}, required: ['result'], additionalProperties: false as const}};
const service = createServiceDefinition({...terms, chainId: 5042002, settlementAddress: deployment.settlement, ledgerAddress: deployment.ledger, seller: user.address});
const input = {text: 'Synthetic browser fixture'};
const request = {protocol: 'obolos.service.v1', orderId: hash('a'), agentId: keccak256(toHex(agent.id)), payer: address('9'), serviceHash: service.serviceHash, inputHash: canonicalJsonHash(input), category: terms.category, unit: terms.unit, quantity: terms.quantity, unitPriceAtomic: terms.unitPriceAtomic, amountAtomic: '10000', settlement: {chainId: 5042002, address: deployment.settlement, ledgerAddress: deployment.ledger, transactionHash: hash('b')}, input};
const baseOrder = {orderId: request.orderId, serviceHash: service.serviceHash, transactionHash: request.settlement.transactionHash, state: 'paid', deliveryAttempts: 1};
const snapshot = {deployment, blockNumber: '100', indexedAt: '2026-09-11T12:00:00Z', chainTimestamp: 1789128000, caughtUp: true,
  metrics: {methodology: 'obolos-agentgdp-v1', asset: 'USDC', start: 1788998400, end: 1789084800, arpiBps: null, inflationBps: null, baselineChangeBps: null, grossPaymentsAtomic: '0', sellerRevenueAtomic: '0', gapAtomic: null, surplusAtomic: null, productivityBps: null, moneyVelocityBps: null, paymentTurnoverBps: null, utilizationBps: null, purchasingPower: [], limitations: ['Synthetic fixture: valuation and basket evidence unavailable.']},
  policy: {enabled: true, reserveBps: 300, reviewBps: 200, policyVersion: '1', feeVersion: '1', categories: []}, services: [], reputation: [], orders: [], policyHistory: []};

async function fixture(page: Page, mode: 'publish' | 'delivery') {
  const posts: {path: string; body: unknown}[] = [];
  let publicationAttempts = 0;
  let definitions: ServiceDefinition[] = mode === 'delivery' ? [service] : [];
  let order = baseOrder;
  const emptyService = encodeAbiParameters([{type:'address'},{type:'uint8'},{type:'bytes32'},{type:'uint256'},{type:'uint256'},{type:'bytes32'}], [address('0'), 0, hash('0'), 0n, 0n, hash('0')]);
  await page.addInitScript(({owner, emptyService, tx}) => {
    const state = window as Window & {ethereum?: unknown; fixtureWalletCalls?: string[]; fixtureTransactions?: unknown[]};
    state.fixtureWalletCalls = [];
    state.fixtureTransactions = [];
    let chain = '0x1';
    state.ethereum = {request: async ({method, params}: {method: string; params?: unknown[]}) => {
      state.fixtureWalletCalls!.push(method);
      if (method === 'eth_requestAccounts') return [owner];
      if (method === 'eth_chainId') return chain;
      if (method === 'wallet_switchEthereumChain') {chain = String((params?.[0] as {chainId: string}).chainId); return null;}
      if (method === 'eth_call') return emptyService;
      if (method === 'eth_sendTransaction') {state.fixtureTransactions!.push(params?.[0]); return tx;}
      throw Error(`Unexpected mocked wallet method: ${method}`);
    }};
  }, {owner: user.address, emptyService, tx: hash('c')});
  await page.route('**/api/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({status, json: body});
    if (req.method() === 'POST') posts.push({path, body: req.postDataJSON()});
    if (path === '/api/account') return json({user, configured: true});
    if (path === '/api/agents') return json({agents: [agent]});
    if (path === '/api/economy') return json({status: 'indexed', snapshot});
    if (path === '/api/economy/services' && req.method() === 'GET') return json({services: definitions});
    if (path === `/api/economy/services/${service.serviceHash}`) return json({service});
    if (path === '/api/economy/services') {
      publicationAttempts++;
      if (publicationAttempts === 1) return json({error: 'Registration is not finalized.', code: 'SERVICE_NOT_REGISTERED'}, 409);
      definitions = [req.postDataJSON() as ServiceDefinition]; return json({service: definitions[0]}, 201);
    }
    if (path === '/api/economy/orders') return json({error: 'Payment is finalized, but provider delivery did not complete.', code: 'DELIVERY_FAILED'}, 502);
    if (path === `/api/economy/orders/${request.orderId}`) return json({order});
    if (path === `/api/economy/orders/${request.orderId}/delivery`) {order = {...baseOrder, state: 'fulfilled', deliveryAttempts: 2}; return json({order: {...order, output: {result: 'Synthetic output'}, outputHash: hash('d')}});}
    throw Error(`Unexpected fixture request: ${req.method()} ${path}`);
  });
  return posts;
}

async function screenshot(page: Page, name: string) {
  await page.evaluate(() => {
    const label = document.createElement('div');
    label.textContent = 'TEST FIXTURE — NO LIVE TRANSACTIONS';
    label.style.cssText = 'padding:10px;text-align:center;background:#fff0ce;color:#402c00;font:12px sans-serif';
    document.body.prepend(label);
    document.querySelectorAll('textarea').forEach(textarea => {textarea.scrollTop = 0; textarea.scrollLeft = 0;});
    window.scrollTo(0, 0);
  });
  await page.screenshot({path: `test-results/${name}.png`, fullPage: true});
}

for (const viewport of [{width: 1440, height: 1000}, {width: 390, height: 844}]) {
  test(`settled receipt links stay within the table scroll area (${viewport.width}px)`, async ({page}) => {
    await page.setViewportSize(viewport);
    await fixture(page, 'delivery');
    await page.route('**/api/economy', route => route.fulfill({json: {status: 'indexed', snapshot: {...snapshot,
      orders: [{orderId: request.orderId, agentId: request.agentId, seller: user.address, principalAtomic: '1000', sellerAtomic: '950', buyerAcknowledged: true, delivered: true, transactionHash: request.settlement.transactionHash}],
      reputation: [{seller: user.address, paid: 1, delivered: 1, acknowledged: 1, acceptanceBps: '10000'}]}}}));
    await page.goto(origin + '/app/economy#settlements');
    await expect(page.getByText('Buyer acknowledged', {exact: true})).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);
  });

  test(`service registration and finality retry never resend a wallet transaction (${viewport.width}px)`, async ({page}) => {
    await page.setViewportSize(viewport);
    const posts = await fixture(page, 'publish');
    await page.goto(origin + '/app/economy');
    await page.getByText('Open advanced service publication', {exact: true}).click();
    await page.getByLabel('Service terms JSON', {exact: true}).fill(JSON.stringify(terms, null, 2));
    await page.getByRole('button', {name: 'Review service terms', exact: true}).click();
    await expect(page.getByText('0.0095 test USDC', {exact: true})).toBeVisible();
    await page.getByRole('button', {name: 'Register service in wallet', exact: true}).click();
    await expect(page.getByRole('button', {name: 'Registration submitted or found', exact: true})).toBeDisabled();
    await page.getByRole('button', {name: 'Publish registered service', exact: true}).click();
    await expect(page.locator('main').getByRole('alert')).toContainText('Registration is not finalized');
    await page.getByRole('button', {name: 'Publish registered service', exact: true}).click();
    await expect(page.getByRole('status').first()).toContainText('Service published');
    expect(posts.map(post => post.path)).toEqual(['/api/economy/services', '/api/economy/services']);
    expect(posts[1].body).toEqual(service);
    expect(await page.evaluate(() => (window as Window & {fixtureWalletCalls?: string[]}).fixtureWalletCalls!.filter(method => method === 'eth_sendTransaction').length)).toBe(1);
    expect(await page.evaluate(() => (window as Window & {fixtureTransactions?: unknown[]}).fixtureTransactions)).toEqual([{from: user.address, to: deployment.settlement, chainId: toHex(5042002), value: '0x0', data: encodeFunctionData({abi: parseAbi(['function registerService(uint8,bytes32,uint256,uint256,bytes32) returns(bytes32)']), functionName: 'registerService', args: [1, keccak256(toHex(terms.unit)), 1n, 10000n, keccak256(toHex(terms.endpoint))]})}]);
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', viewport.width);
    await screenshot(page, `economy-publication-${viewport.width}-fixture`);
    await page.reload();
    await page.getByText('Open advanced service publication', {exact: true}).click();
    await page.getByLabel('Service terms JSON', {exact: true}).fill(JSON.stringify(terms));
    await page.getByRole('button', {name: 'Review service terms', exact: true}).click();
    await expect(page.getByRole('button', {name: 'Registration submitted or found', exact: true})).toBeDisabled();
    expect(await page.evaluate(() => (window as Window & {fixtureWalletCalls?: string[]}).fixtureWalletCalls!.filter(method => method === 'eth_sendTransaction').length)).toBe(0);
  });

  test(`provider retry reuses the original paid order and never calls a wallet (${viewport.width}px)`, async ({page}) => {
    await page.setViewportSize(viewport);
    const posts = await fixture(page, 'delivery');
    await page.goto(origin + '/app/economy#settlements');
    await page.getByText('Open advanced paid-order delivery', {exact: true}).click();
    await page.getByLabel('Settled ServiceRequest JSON', {exact: true}).fill(JSON.stringify(request, null, 2));
    await page.getByRole('button', {name: 'Review paid request', exact: true}).click();
    await page.getByRole('button', {name: 'Verify payment & request delivery', exact: true}).click();
    await expect(page.locator('main').getByRole('alert')).toContainText('Keep the same order ID');
    await page.getByRole('button', {name: 'Read order status', exact: true}).click();
    await expect(page.getByRole('heading', {name: 'Paid · awaiting delivery', exact: true})).toBeVisible();
    await page.getByRole('button', {name: 'Retry delivery only', exact: true}).click();
    await expect(page.getByRole('heading', {name: 'Provider response received', exact: true})).toBeVisible();
    await expect(page.getByRole('button', {name: 'Retry delivery only', exact: true})).toBeDisabled();
    expect(posts.map(post => post.path)).toEqual(['/api/economy/orders', `/api/economy/orders/${request.orderId}/delivery`]);
    expect(posts[0].body).toEqual({platformAgentId: agent.id, request});
    expect(await page.evaluate(() => (window as Window & {fixtureWalletCalls?: string[]}).fixtureWalletCalls)).toEqual([]);
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', viewport.width);
    await screenshot(page, `economy-delivery-${viewport.width}-fixture`);
  });
}

for (const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
 test(`dispute recovery preserves the order and sends no wallet transaction (${viewport.width}px)`,async({page})=>{
  await page.setViewportSize(viewport);await fixture(page,'delivery');let disputes:{reason:string}[]=[];const submissions:unknown[]=[];
  await page.route(`**/api/economy/orders/${request.orderId}/recovery`,async route=>{
   if(route.request().method()==='POST'){const body=route.request().postDataJSON();submissions.push(body);disputes=[{reason:body.reason}];return route.fulfill({json:{recorded:true}});}
   return route.fulfill({json:{orderId:request.orderId,canDispute:true,canRefund:false,disputes,refunds:[],reviews:[],refundPolicy:'Voluntary'}});
  });
  await page.goto(origin+'/app/economy#settlements');await page.getByText('Disputes and completed refunds',{exact:true}).click();
  await page.getByLabel('Order ID',{exact:true}).last().fill(request.orderId);await page.getByRole('button',{name:'Read recovery records',exact:true}).click();
  await page.getByLabel('What went wrong?').fill('The paid provider has not delivered.');await page.getByRole('button',{name:'Record dispute',exact:true}).click();
  await expect(page.getByText('Dispute recorded. This does not reverse the settlement.')).toBeVisible();
  expect(submissions).toEqual([{action:'dispute',reason:'The paid provider has not delivered.'}]);
  await expect(page.getByRole('button',{name:'Record completed refund',exact:true})).toHaveCount(0);
  expect(await page.evaluate(()=>(window as Window & {fixtureWalletCalls?:string[]}).fixtureWalletCalls)).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(viewport.width);
  await screenshot(page,`economy-recovery-${viewport.width}-fixture`);
 });
}
