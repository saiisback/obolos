import {test,expect} from '@playwright/test';
import {keccak256,toHex} from 'viem';
import {calculateMeasurements} from '../../src/lib/economy/measurements';
import {calculateEconomyMetrics} from '../../src/lib/economy/metrics';
import {resourceCategories,type EconomicSettlement} from '../../src/lib/economy/model';
// Isolated UI fixtures. Every API call is intercepted; no wallet or payment is invoked.
const h=(s:string)=>keccak256(toHex(s)),a=(s:string)=>'0x'+s.repeat(40),asOf=1789128000,today=Math.floor(asOf/86400)*86400;
const orders:EconomicSettlement[]=resourceCategories.map((category,i)=>({orderId:h(category),agentId:h('agent'),seller:a('2'),asset:'USDC',category,unit:'unit',quantity:1n,principalAtomic:1000n,sellerAtomic:950n,timestamp:today+60+i,delivered:true,buyerAcknowledged:true,sameOwner:false,verifiedFinalOutputAtomic:null,verifiedIntermediateInputAtomic:null,verifiedResourceCostAtomic:null,valuationReference:null,observedRevenueAtomic:950n}));
const services=resourceCategories.map((category,i)=>({serviceHash:h('service'+category),seller:a('2'),category,unitHash:h('unit'),quantity:'1',unitPrice:'1000',endpointHash:h(category+'endpoint'),registeredAt:today+10+i,transactionHash:h(category+'register')}));
const measurements=calculateMeasurements({settlements:orders.map(o=>({...o,deliveredAt:o.timestamp+1,acknowledgedAt:o.timestamp+2})),services,agents:[{agentId:h('agent'),executor:a('3'),active:true}],balances:[{address:a('3'),balanceAtomic:1000000n}],asOf,blockNumber:'100',blockHash:h('block'),fromTimestamp:today-100});
const metricWindow={start:today-86400,end:today,asset:'USDC' as const,activeAgentIds:[],capitalAtomic:null,previousArpi:null};
const deployment={chainId:5042002,policy:a('4'),settlement:a('5'),ledger:a('6'),controller:a('7'),approver:a('8'),reserve:a('9'),reviewPool:a('a')};
const snapshot=JSON.parse(JSON.stringify({measurements,currentAccounting:calculateEconomyMetrics(orders,[],{...metricWindow,start:today,end:asOf+1}),currentAccountingCoverage:{eligibleOrderCount:5,currentRevenueOrderCount:5,currentInputAccountCount:0,currentCostAccountCount:0,currentValuedOutputCount:0},metrics:calculateEconomyMetrics([],[],metricWindow),deployment,blockNumber:'100',chainTimestamp:asOf,indexedAt:new Date(asOf*1000).toISOString(),caughtUp:true,policy:{enabled:true,reserveBps:300,reviewBps:200,policyVersion:'1',feeVersion:'1',categories:[]},services:[],orders:[],reputation:[],observations:[],policyHistory:[]},(_k,v)=>typeof v==='bigint'?v.toString():v));
for(const width of [1280,390])test(`measured economy separates today's data and source coverage at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;return route.fulfill({json:path==='/api/account'?{user:{id:'fixture',address:a('2')},configured:true}:path==='/api/economy'?{status:'indexed',snapshot}:path==='/api/economy/accounting'?{seller:a('2'),deployment,sales:[]}:path==='/api/economy/services'?{services:[]}:{agents:[]}});});
 await page.goto((process.env.WORKSPACE_TEST_URL||'http://127.0.0.1:3100')+'/app/economy');
 await expect(page.getByRole('heading',{name:'Measured economy',exact:true})).toBeVisible();
 const activity=page.getByRole('region',{name:'Measured economy activity',exact:true});await expect(activity.getByRole('row').filter({hasText:'Gross payments'})).toContainText('0.005 USDC');
 await expect(page.getByRole('region',{name:'Measured resource prices',exact:true})).toContainText('100');await expect(page.getByText('Collecting daily history',{exact:true})).toBeVisible();
 await page.getByLabel('Activity period').selectOption('lifetime');await expect(page.getByLabel('Activity period')).toHaveValue('lifetime');
 await expect(page.getByRole('region',{name:'Production accounting metrics'})).toContainText('Input accounting pending');
 await page.getByText('Previous closed UTC day',{exact:true}).click();await expect(page.getByText("Today's transactions are outside this window.",{exact:false})).toBeVisible();await expect(page.getByRole('region',{name:'Closed-day economics'})).toContainText('Productivity');
 await page.getByText('Record production inputs and costs',{exact:true}).click();await page.getByRole('button',{name:'Load my sales'}).click();await expect(page.getByText('No delivered sales need accounting for this wallet.')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.screenshot({path:`test-results/measured-economy-${width}.png`,fullPage:true});
});
test('producer accounting signs an explicit complete report without sending a transaction',async({page})=>{
 const posted:unknown[]=[];
 await page.addInitScript(({owner})=>{const state=window as Window&{ethereum?:unknown;walletCalls?:string[]};state.walletCalls=[];state.ethereum={request:async({method}:{method:string})=>{state.walletCalls!.push(method);if(method==='eth_requestAccounts')return[owner];if(method==='personal_sign')return'0x'+'11'.repeat(65);throw Error('Unexpected wallet action');}};},{owner:a('2')});
 await page.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;if(path==='/api/economy/accounting'&&route.request().method()==='POST'){posted.push(route.request().postDataJSON());return route.fulfill({json:{evidenceHash:h('account')}});}return route.fulfill({json:path==='/api/account'?{user:{id:'fixture',address:a('2')},configured:true}:path==='/api/economy'?{status:'indexed',snapshot}:path==='/api/economy/accounting'?{seller:a('2'),deployment,sales:[{orderId:h('sale'),transactionHash:h('payment'),outputHash:h('output'),category:'compute',amountAtomic:'1000',accounted:posted.length>0}]}:path==='/api/economy/services'?{services:[]}:{agents:[]}});});
 await page.goto((process.env.WORKSPACE_TEST_URL||'http://127.0.0.1:3100')+'/app/economy');await page.getByText('Record production inputs and costs',{exact:true}).click();await page.getByRole('button',{name:'Load my sales'}).click();
 await page.getByLabel('Other intermediate inputs (USDC)',{exact:true}).fill('0.0001');await page.getByLabel('Gas cost (USDC)',{exact:true}).fill('0.00002');await page.getByLabel('Inference cost not included above (USDC)').fill('0');await page.getByLabel('Other resources not included above (USDC)').fill('0.00003');await page.getByLabel('Public cost evidence URL').fill('https://example.com/fixture-costs');await page.getByLabel('Evidence content hash (0x SHA-256)').fill(h('costs'));await page.getByLabel('All intermediate inputs are included',{exact:true}).check();await page.getByLabel('All consumed resources are included',{exact:false}).check();
 await page.getByRole('button',{name:'Sign and save production account'}).click();await expect(page.getByRole('status')).toContainText('Production account saved');expect(posted).toHaveLength(1);expect(posted[0]).toMatchObject({payload:{externalIntermediateAtomic:'100',gasAtomic:'20',inferenceAtomic:'0',otherResourceAtomic:'30',allResourcesIncluded:true,allIntermediateInputsIncluded:true}});expect(await page.evaluate(()=>(window as Window&{walletCalls?:string[]}).walletCalls)).toEqual(['eth_requestAccounts','personal_sign']);
});

test('closed-day assessed productivity and velocity remain visible beside pending current-day metrics',async({page})=>{
 const closed={...snapshot,metrics:{...snapshot.metrics,gapAtomic:'750',surplusAtomic:'650',productivityBps:'25000',moneyVelocityBps:'12500'}};
 await page.route('**/api/**',route=>route.fulfill({json:new URL(route.request().url()).pathname==='/api/account'?{user:{id:'fixture',address:a('2')},configured:true}:new URL(route.request().url()).pathname==='/api/economy'?{status:'indexed',snapshot:closed}:{agents:[],services:[]}}));
 await page.goto((process.env.WORKSPACE_TEST_URL||'http://127.0.0.1:3100')+'/app/economy');await expect(page.getByRole('region',{name:'Production accounting metrics',exact:true})).toContainText('After UTC close and output assessment');
 await page.getByText('Previous closed UTC day',{exact:true}).click();const region=page.getByRole('region',{name:'Closed-day economics'});await expect(region.getByRole('row').filter({hasText:'Productivity'})).toContainText('250%');await expect(region.getByRole('row').filter({hasText:'Money velocity'})).toContainText('1.25×');await expect(region.getByRole('row').filter({hasText:'Gross Agent Product'})).toContainText('0.00075 USDC');
});

test('stale finalized snapshots are labeled stale, and refresh failure keeps measured values',async({page})=>{
 await page.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;if(path==='/api/economy'&&route.request().method()==='POST')return route.fulfill({status:503,json:{error:'RPC temporarily unavailable'}});return route.fulfill({json:path==='/api/account'?{user:{id:'fixture',address:a('2')},configured:true}:path==='/api/economy'?{status:'indexed',snapshot,freshness:{status:'stale',caughtUp:true,indexAgeSeconds:900,chainAgeSeconds:900}}:{agents:[],services:[]}});});
 await page.goto((process.env.WORKSPACE_TEST_URL||'http://127.0.0.1:3100')+'/app/economy');await expect(page.getByText('Data stale',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Refresh data',exact:true}).click();await expect(page.locator('main').getByRole('alert')).toContainText('RPC temporarily unavailable');await expect(page.getByRole('region',{name:'Measured economy activity',exact:true})).toContainText('0.005 USDC');
});

test('a new UTC day explains empty totals and switches to existing lifetime activity',async({page})=>{
 const rollover=structuredClone(snapshot);rollover.measurements.today={...rollover.measurements.today,settlementCount:0,deliveredCount:0,acknowledgedCount:0,grossPaymentsAtomic:'0',sellerRevenueAtomic:'0',refundAtomic:'0'};
 await page.route('**/api/**',route=>route.fulfill({json:new URL(route.request().url()).pathname==='/api/account'?{user:{id:'fixture',address:a('2')},configured:true}:new URL(route.request().url()).pathname==='/api/economy'?{status:'indexed',snapshot:rollover}:{agents:[],services:[]}}));
 await page.goto((process.env.WORKSPACE_TEST_URL||'http://127.0.0.1:3100')+'/app/economy');await page.getByRole('button',{name:'See all 5 earlier payments'}).click();await expect(page.getByLabel('Activity period')).toHaveValue('lifetime');await expect(page.getByRole('region',{name:'Measured economy activity',exact:true})).toContainText('0.005 USDC');
});

test('slow refresh serializes polling and retains the latest update',async({page})=>{
 await page.clock.install();let release:()=>void=()=>{};let calls=0;const gate=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/**',async route=>{const path=new URL(route.request().url()).pathname;if(path==='/api/economy'){calls++;if(route.request().method()==='POST'){await gate;return route.fulfill({json:{status:'indexed',snapshot:{...snapshot,blockNumber:'102'},freshness:{status:'fresh'}}});}return route.fulfill({json:{status:'indexed',snapshot,freshness:{status:'fresh'}}});}return route.fulfill({json:path==='/api/account'?{user:{id:'fixture',address:a('2')},configured:true}:{agents:[],services:[]}});});
 await page.goto((process.env.WORKSPACE_TEST_URL||'http://127.0.0.1:3100')+'/app/economy');await expect(page.getByRole('heading',{name:'Measured economy',exact:true})).toBeVisible();const before=calls;await page.getByRole('button',{name:'Refresh data',exact:true}).click();await expect.poll(()=>calls).toBe(before+1);await page.clock.fastForward(60000);expect(calls).toBe(before+1);release();await expect(page.getByRole('link',{name:'102 (opens explorer in a new tab)',exact:true})).toBeVisible();
});

test('missing basket component and unavailable balances stay readable without invented values',async({page})=>{
 const partial=structuredClone(snapshot);partial.measurements.prices.components=[];partial.measurements.capital.totalAtomic=null;partial.measurements.capital.todayTurnoverBps=null;partial.measurements.activity.utilizationBps=null;
 await page.route('**/api/**',route=>route.fulfill({json:new URL(route.request().url()).pathname==='/api/account'?{user:{id:'fixture',address:a('2')},configured:true}:new URL(route.request().url()).pathname==='/api/economy'?{status:'indexed',snapshot:partial}:{agents:[],services:[]}}));
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await page.goto((process.env.WORKSPACE_TEST_URL||'http://127.0.0.1:3100')+'/app/economy');await expect(page.getByRole('region',{name:'Resource basket and purchasing power',exact:true})).toContainText('Awaiting measurement');await expect(page.locator('main')).not.toContainText('NaN');expect(errors).toEqual([]);
});

test('the public economy shortcut reaches the authenticated workspace',async({page})=>{
 await page.route('**/api/**',route=>route.fulfill({json:new URL(route.request().url()).pathname==='/api/account'?{user:{id:'fixture',address:a('2')},configured:true}:new URL(route.request().url()).pathname==='/api/economy'?{status:'indexed',snapshot}:{agents:[],services:[]}}));
 await page.goto((process.env.WORKSPACE_TEST_URL||'http://127.0.0.1:3100')+'/economy');await expect(page).toHaveURL(/\/app\/economy$/);await expect(page.getByRole('heading',{name:'Measured economy',exact:true})).toBeVisible();
});
