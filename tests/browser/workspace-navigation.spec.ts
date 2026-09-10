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
    if(path === '/api/market/services') return json({services:[]});
    if(path === '/api/market/earnings') return json({orders:[],totalAtomic:'0'});
    if(path.endsWith('/keys') && method === 'GET') return json({keys:[]});
    if(path.endsWith('/keys') && method === 'POST') {
      mutations.push(path);
      return json({key:{id:'key-one',name:'Local fixture',prefix:'ob_test_fixture',createdAt:new Date().toISOString(),expiresAt:'2099-01-01T00:00:00Z',revokedAt:null},token:'ob_test_browser_fixture_not_a_real_key'});
    }
    if(path.endsWith('/keys/key-one') && method === 'DELETE') { mutations.push(path); return json({ok:true}); }
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
  await expect(page.getByRole('heading',{name:'No execution history yet'})).toBeVisible();
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
  await expect(page.getByLabel('Shell · Selected agent code')).toContainText(second.id);
  await expect(page.getByLabel('Shell · Selected agent code')).not.toContainText(first.id);
});

test('login returns to the private section originally requested', async ({page}) => {
  await fixture(page,false);
  await page.addInitScript(() => {
    const provider = {request: async ({method}: {method: string}) => method === 'eth_requestAccounts' ? ['0x1111111111111111111111111111111111111111'] : '0xfixture'};
    window.addEventListener('eip6963:requestProvider', () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail:{info:{uuid:'browser-fixture', name:'Fixture wallet'},provider}})));
  });
  await page.goto(origin+'/app/evidence');
  await expect(page).toHaveURL(origin+'/login?next=%2Fapp%2Fevidence');
  await page.getByRole('button',{name:'Fixture wallet',exact:false}).click();
  await expect(page).toHaveURL(origin+'/app/evidence');
  await expect(page.getByRole('heading',{name:'Your execution evidence'})).toBeVisible();
});
