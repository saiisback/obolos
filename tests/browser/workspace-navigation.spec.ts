import {test, expect, type Page} from '@playwright/test';

const origin = process.env.WORKSPACE_TEST_URL || 'http://127.0.0.1:3100';
const first = {id:'11111111-1111-4111-8111-111111111111', name:'First agent', description:'Navigation fixture', dataBudgetAtomic:100000, verificationBudgetAtomic:50000};
const second = {...first, id:'22222222-2222-4222-8222-222222222222', name:'Second agent'};
const user = {id:'fixture-owner', address:'0x1111111111111111111111111111111111111111'};

async function fixture(page: Page, initialAuth = true) {
  let authed = initialAuth;
  const mutations: string[] = [];
  await page.route('**/api/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname, method = req.method();
    const json = (body: unknown) => route.fulfill({json:body});
    if(path === '/api/account') return json({user:authed ? user : null, configured:true});
    if(path === '/api/auth/challenge') return json({message:'Sign in to Obolos (browser fixture)'});
    if(path === '/api/auth/verify') { authed = true; return json({user}); }
    if(path === '/api/auth/logout') { authed = false; return json({ok:true}); }
    if(path === '/api/agents') return json({agents:[first, second]});
    if(path.endsWith('/economy') && path.startsWith('/api/agents/')) return json({agentId:'0x'+'1'.repeat(64),policy:{status:'not_registered'},orders:[],indexedAt:null});
    if(path === '/api/economy') return json({snapshot:null,status:'awaiting_index'});
    if(path === '/api/tasks') return json({tasks:[]});
    if(path === '/api/economy/service-profiles') return json({profiles:[]});
    if(path === '/api/economy/earnings') return json({orders:[],totals:null,indexedAt:null});
    if(path === '/api/economy/services') return json({services:[]});
    if(path === '/api/economy/purchases') return json({orders:[]});
    if(path === '/api/economy/provider/status') return json({status:'unavailable',endpoints:[],lastSeen:null});
    if(path === '/api/market/services') return json({services:[]});
    if(path === '/api/market/purchases') return json({orders:[]});
    if(path === '/api/market/earnings') return json({orders:[],totalAtomic:'0'});
    if(path.endsWith('/keys') && method === 'GET') return json({keys:[]});
    if(path.endsWith('/keys') && method === 'POST') {
      mutations.push(path);
      return json({key:{id:'key-one',name:'Local fixture',prefix:'ob_test_fixture',createdAt:new Date().toISOString(),expiresAt:'2099-01-01T00:00:00Z',revokedAt:null},token:'ob_test_browser_fixture_not_a_real_key'});
    }
    if(path.endsWith('/keys/key-one') && method === 'DELETE') { mutations.push(path); return json({ok:true}); }
    if(path.endsWith('/runner') && method === 'POST') return json({runner:{id:'runner-fixture',prefix:'ob_runner_fixture',createdAt:new Date().toISOString(),lastSeenAt:null,revokedAt:null,online:false},token:'ob_runner_browser_fixture_not_a_real_key'});
    if(path.endsWith('/runner')) return json({runner:null});
    if(path.endsWith('/mandate')) return json({mandate:null});
    if(path.endsWith('/runs')) return json({runs:path.includes(first.id) ? [{id:'job-one', status:'succeeded', repos:['owner-one/repo'], createdAt:'2026-09-10T00:00:00Z', result:null}] : []});
    throw new Error(`Unexpected API request: ${method} ${path}`);
  });
  return mutations;
}

test('workspace navigation uses private sections and agent-scoped content', async ({page}) => {
  await fixture(page);
  await page.goto(origin+'/app');
  await expect(page.getByRole('heading',{name:'Your agents',exact:false})).toBeVisible();
  for (const [label,path,heading] of [['Marketplace','/app/marketplace','Marketplace'],['Evidence','/app/evidence','Your execution evidence'],['Developers','/app/developers','API credentials']]) {
    await page.getByRole('navigation',{name:'Workspace navigation'}).getByRole('link',{name:label,exact:true}).click();
    await expect(page).toHaveURL(origin+path);
    await expect(page.getByRole('heading',{name:heading,exact:true})).toBeVisible();
    await expect(page.getByRole('navigation',{name:'Workspace navigation'}).getByRole('link',{name:label,exact:true})).toHaveAttribute('aria-current','page');
    await expect(page.getByRole('navigation',{name:'Main navigation'})).toHaveCount(0);
  }
  await page.getByRole('navigation',{name:'Workspace navigation'}).getByRole('link',{name:'Evidence',exact:true}).click();
  await expect(page.getByText('owner-one/repo',{exact:true})).toBeVisible();
  await page.getByLabel('Agent',{exact:true}).selectOption(second.id);
  await expect(page.getByRole('heading',{name:'No repository research runs yet'})).toBeVisible();
  await expect(page.getByText('owner-one/repo',{exact:true})).toHaveCount(0);
  await expect(page.getByText('Follow the work.',{exact:false})).toHaveCount(0);
});

test('credentials stay scoped to the selected agent and one-time secrets leave with it', async ({page}) => {
  const mutations = await fixture(page);
  await page.goto(origin+'/app/developers');
  await page.getByLabel('Credential name').fill('Local fixture');
  await page.getByRole('button',{name:'Issue credential',exact:false}).click();
  await expect(page.getByLabel('New API credential')).toHaveValue('ob_test_browser_fixture_not_a_real_key');
  await expect(page.locator('pre')).not.toContainText(['ob_test_browser_fixture_not_a_real_key']);
  await page.getByRole('button',{name:'I saved it',exact:false}).click();
  await page.getByRole('button',{name:'Revoke',exact:true}).click();
  await page.getByRole('button',{name:'Revoke',exact:true}).click();
  await expect(page.getByText('Revoked',{exact:true})).toBeVisible();
  expect(mutations).toEqual([`/api/agents/${first.id}/keys`,`/api/agents/${first.id}/keys/key-one`]);
  await page.getByLabel('Credential name').fill('Second fixture');
  await page.getByRole('button',{name:'Issue credential',exact:false}).click();
  await expect(page.getByLabel('New API credential')).toBeVisible();
  await page.getByLabel('Agent',{exact:true}).selectOption(second.id);
  await expect(page.getByLabel('New API credential')).toHaveCount(0);
  await page.getByRole('navigation',{name:'Developer sections'}).getByRole('link',{name:'API examples'}).click();
  await expect(page.getByLabel('Shell · Selected agent code')).toBeVisible();
  await expect(page.getByLabel('Shell · Selected agent code')).toContainText(second.id);
  await expect(page.getByLabel('Shell · Selected agent code')).not.toContainText(first.id);
});

for(const destination of ['/app/evidence','/app?service=13936142-3321-4de8-8e09-e57dcf7d1a82']) test(`login preserves ${destination}`, async ({page}) => {
  await fixture(page,false);
  await page.addInitScript(() => {
    const provider = {request: async ({method}: {method: string}) => method === 'eth_requestAccounts' ? ['0x1111111111111111111111111111111111111111'] : '0xfixture'};
    window.addEventListener('eip6963:requestProvider', () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail:{info:{uuid:'browser-fixture', name:'Fixture wallet'},provider}})));
  });
  await page.goto(origin+destination);
  await expect(page).toHaveURL(origin+'/login?next='+encodeURIComponent(destination));
  await page.getByRole('button',{name:'Fixture wallet',exact:false}).click();
  await expect(page).toHaveURL(origin+destination);
  await expect(page.getByRole('heading',{name:destination.includes('?')?'Your agents':'Your execution evidence',exact:false})).toBeVisible();
});


test('task views keep setup, execution, selling, and integration separate', async ({page}) => {
  await fixture(page);
  await page.goto(origin+'/app');
  await page.getByRole('button',{name:'Manage agent',exact:true}).first().click();
  await page.getByText('Repository research setup and runs',{exact:true}).click();
  await expect(page.getByRole('button',{name:'Pair a runner',exact:false})).toBeVisible();
  await page.getByRole('button',{name:'Pair a runner',exact:false}).click();
  await expect(page.getByLabel('One-time runner credential')).toBeVisible();
  await expect(page.getByLabel('One-time runner credential')).toHaveValue('ob_runner_browser_fixture_not_a_real_key');
  await expect(page.getByRole('button',{name:'1. Connect runner',exact:false})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('button',{name:'Queue testnet run',exact:false})).not.toBeVisible();
  await expect(page.getByLabel('Credential name')).toHaveCount(0);
  await page.getByRole('button',{name:'2. Authorize spending',exact:false}).click();
  await page.getByLabel('Allowed repositories').fill('fixture/repository');
  await page.getByRole('button',{name:'3. Run research',exact:false}).click();
  await expect(page.getByLabel('Repositories for this run')).toHaveValue('fixture/repository');
  await expect(page.getByRole('button',{name:'Queue testnet run',exact:false})).toBeDisabled();
  await page.getByRole('button',{name:'2. Authorize spending',exact:false}).click();
  await expect(page.getByLabel('Allowed repositories')).toHaveValue('fixture/repository');
  await page.goto(origin+'/app/marketplace');
  await expect(page.getByRole('heading',{name:'Your seller desk',exact:true})).not.toBeVisible();
  await page.getByRole('navigation',{name:'Marketplace sections'}).getByRole('link',{name:'Your seller desk'}).click();
  await expect(page.getByRole('heading',{name:'Your seller desk',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Repository verifiers',exact:false})).not.toBeVisible();
  await expect(page.getByRole('heading',{name:'New hosted verifier listing'})).not.toBeVisible();
  await page.getByRole('button',{name:'Publish a repository verifier',exact:true}).click();
  await expect(page.getByRole('heading',{name:'New hosted verifier listing'})).toBeVisible();
  await page.goto(origin+'/app/developers#runner');
  await expect(page.getByRole('heading',{name:'Runner prerequisites'})).toBeVisible();
  await expect(page.getByLabel('Credential name')).not.toBeVisible();
  await page.getByRole('navigation',{name:'Developer sections'}).getByRole('link',{name:'API examples'}).click();
  await expect(page.getByLabel('Shell · Selected agent code')).toBeVisible();
  await expect(page.getByRole('heading',{name:'Runner prerequisites'})).not.toBeVisible();
});

test('an empty workspace explains setup and keeps the runner guide accessible', async ({page}) => {
  await fixture(page);
  await page.route('**/api/agents', route => route.fulfill({json:{agents:[]}}));
  await page.goto(origin+'/app');
  await expect(page.getByRole('heading',{name:'Your first agent starts here.'})).toBeVisible();
  await page.getByRole('button',{name:'Create your first agent'}).click();
  await expect(page.getByLabel('Agent name')).toBeFocused();
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.goto(origin+'/app/evidence');
  await expect(page.getByRole('heading',{name:'No agents yet'})).toBeVisible();
  await page.goto(origin+'/app/developers#runner');
  await expect(page.getByRole('heading',{name:'Runner prerequisites'})).toBeVisible();
  await page.getByRole('navigation',{name:'Developer sections'}).getByRole('link',{name:'API credentials'}).click();
  await expect(page.getByRole('heading',{name:'Create an agent to get started'})).toBeVisible();
});


test('seller endpoint publishing and delivery-only recovery use distinct actions',async({page})=>{
  await fixture(page);
  const calls:{path:string;body:unknown}[]=[];
  await page.route('**/api/market/services',async route=>{
    if(route.request().method()==='POST'){calls.push({path:new URL(route.request().url()).pathname,body:route.request().postDataJSON()});return route.fulfill({json:{service:{id:'service-fixture'}}});}
    return route.fulfill({json:{services:[]}});
  });
  const orderId='33333333-3333-4333-8333-333333333333';
  let delivered=false;
  await page.route('**/api/market/purchases',route=>route.fulfill({json:{orders:[{id:orderId,jobId:'job',serviceId:'service',serviceName:'External provider',agentName:'First agent',amountAtomic:50000,status:delivered?'fulfilled':'paid',createdAt:'2026-09-10T00:00:00Z',chainConfirmed:true,transactionHash:`0x${'a'.repeat(64)}`} ]}}));
  await page.route(`**/api/market/orders/${orderId}/delivery`,route=>{calls.push({path:new URL(route.request().url()).pathname,body:route.request().postDataJSON()});delivered=true;return route.fulfill({json:{order:{id:orderId,status:'fulfilled'}}});});
  await page.goto(origin+'/app/marketplace#seller-heading');
  await page.getByRole('button',{name:'Publish a repository verifier',exact:true}).click();
  await page.getByLabel('Service execution').selectOption('external-repo-verifier');
  await page.getByLabel('Public HTTPS endpoint',{exact:false}).fill('https://provider.obolos.app/verify');
  await page.getByLabel('Publishing identity',{exact:false}).selectOption(first.id);
  await page.getByLabel('Name',{exact:true}).fill('External provider');
  await page.getByLabel('Description',{exact:true}).fill('Checks the paid report with my agent.');
  await page.getByRole('button',{name:'Publish service',exact:true}).click();
  expect(calls[0]).toMatchObject({path:'/api/market/services',body:{execution:'external-repo-verifier',providerEndpoint:'https://provider.obolos.app/verify',agentId:first.id}});
  await page.getByRole('navigation',{name:'Marketplace sections'}).getByRole('link',{name:'Your purchases'}).click();
  await expect(page.getByText('Paid · delivery pending',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Retry delivery only'}).click();
  await expect(page.getByText('Paid & delivered',{exact:true})).toBeVisible();
  expect(calls.map(call=>call.path)).toEqual(['/api/market/services',`/api/market/orders/${orderId}/delivery`]);
});
