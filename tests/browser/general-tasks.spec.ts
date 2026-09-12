import {test, expect, type Page} from '@playwright/test';
import {encodeAbiParameters} from 'viem';
import {createServiceDefinition} from '../../src/lib/economy/service-contract';

// Isolated synthetic browser fixtures: every API request and wallet RPC is intercepted.
const origin = process.env.WORKSPACE_TEST_URL || 'http://127.0.0.1:3111';
const address = (n:string) => `0x${n.repeat(40)}` as `0x${string}`;
const hash = (n:string) => `0x${n.repeat(64)}` as `0x${string}`;
const agent = {id:'11111111-1111-4111-8111-111111111111', name:'Writing assistant', description:'Language tasks',status:'active',dataBudgetAtomic:0,verificationBudgetAtomic:100000,createdAt:'2026-09-13T00:00:00Z'};
const user = {id:'fixture-owner',address:address('1')};
const deployment = {chainId:5042002,settlement:address('2'),ledger:address('3')};
const service = createServiceDefinition({chainId:5042002,settlementAddress:deployment.settlement,ledgerAddress:deployment.ledger,seller:user.address,category:'inference',endpoint:'https://fixture.example/translate',unit:'inference-request',quantity:'1',unitPriceAtomic:'10000',inputSchema:{type:'object',properties:{prompt:{type:'string'}},required:['prompt'],additionalProperties:false},outputSchema:{type:'object',properties:{text:{type:'string'}},required:['text'],additionalProperties:false}});
const profile = {serviceHash:service.serviceHash,title:'Translate supplied text',description:'Translate text supplied in a prompt.',tags:['translation'],examples:[{prompt:'Translate hello to Spanish'}]};
const baseTask = {id:'22222222-2222-4222-8222-222222222222',agentId:agent.id,instruction:'Translate Hello into Spanish and count its words.',budgetAtomic:'100000',status:'queued',plan:null,planHash:null,approvedPlanHash:null,approvalExpiresAt:null,steps:[],error:null,createdAt:'2026-09-13T00:00:00Z',updatedAt:'2026-09-13T00:00:00Z'};
const plan = {version:1,summary:'Translate the text, then process the returned text.',totalAtomic:'20000',steps:[{serviceHash:service.serviceHash,definition:service,input:{prompt:'Translate Hello into Spanish'}},{serviceHash:service.serviceHash,definition:service,input:{prompt:{$from:0,path:['text']}}}]};
async function fixtures(page:Page, initial:Record<string,unknown>[] = []) {
  let tasks = initial;
  const requests: {path:string;method:string;body:Record<string,unknown>;key?:string}[] = [];
  await page.route('**/api/**', async route => {
    const req=route.request(), path=new URL(req.url()).pathname;
    const body=req.postDataJSON() as Record<string,unknown>;
    const json=(value:unknown,status=200)=>route.fulfill({json:value,status});
    if(req.method()!=='GET') requests.push({path,method:req.method(),body,key:req.headers()['idempotency-key']});
    if(path==='/api/account') return json({user,configured:true});
    if(path==='/api/agents') return json({agents:[agent]});
    if(path==='/api/economy/service-profiles') return json({profiles:[profile]});
    if(path==='/api/economy/services') return json(req.method()==='GET'?{services:[service]}:{service:body});
    if(path==='/api/economy') return json({snapshot:{deployment,policy:{reserveBps:300,reviewBps:200}}});
    if(path==='/api/economy/earnings') return json({indexedAt:'2026-09-13T00:00:00Z',totals:{grossAtomic:'10000',sellerAtomic:'9500',reserveAtomic:'300',reviewAtomic:'200',rebateAtomic:'0',orderCount:1},orders:[{orderId:hash('7'),serviceHash:service.serviceHash,title:profile.title,category:'inference',quantity:'1',unit:'inference-request',amountAtomic:'10000',sellerAtomic:'9500',reserveAtomic:'300',reviewAtomic:'200',rebateAtomic:'0',transactionHash:hash('8'),settledAt:'2026-09-13T00:00:00Z'}]});
    if(path==='/api/tasks') {if(req.method()==='POST') {tasks=[{...baseTask,...body}]; return json({task:tasks[0]},201);} return json({tasks});}
    if(path===`/api/tasks/${baseTask.id}`) {
      if(body.action==='cancel') {tasks=[{...tasks[0],status:'cancelled'}]; return json({task:tasks[0]});}
      if(body.action==='approve') {tasks=[{...tasks[0],status:'approved',approvedPlanHash:body.planHash}]; return json({task:tasks[0]});}
      if(body.action==='retry') {tasks=[{...tasks[0],status:'queued',error:null}]; return json({task:tasks[0]});}
    }
    if(path==='/api/economy/provider/status') return json({seller:user.address,status:'online',endpoints:[service.endpoint]});
    if(path.startsWith('/api/market/')) return json({services:[],orders:[],totalAtomic:'0'});
    if(path==='/api/economy/purchases') return json({orders:[],indexedAt:null});
    return json({error:`Unexpected isolated fixture request: ${path}`},404);
  });
  return {requests,setTasks:(values:Record<string,unknown>[])=>{tasks=values;}};
}
for(const width of [1280,390]) test(`general task request, immutable approval, and paid output at ${width}px`, async({page})=>{
  await page.setViewportSize({width,height:900});
  const state=await fixtures(page);
  await page.goto(origin+'/app');
  const tasks=page.getByRole('region',{name:'General tasks',exact:true});
  await tasks.getByLabel('Your task',{exact:true}).fill(baseTask.instruction);
  await tasks.getByRole('button',{name:'Create task',exact:true}).click();
  await expect(tasks.getByText('Waiting for runner',{exact:true})).toBeVisible();
  await expect(tasks.getByText('Waiting for your private task runner',{exact:false})).toBeVisible();
  expect(state.requests[0].body).toEqual({agentId:agent.id,instruction:baseTask.instruction,budgetAtomic:'100000'});
  expect(state.requests[0].key).toBeTruthy();
  state.setTasks([{...baseTask,status:'needs_approval',plan,planHash:hash('4')}]);
  await tasks.getByRole('button',{name:'Refresh tasks'}).click();
  await expect(tasks.getByText('0.02 test USDC total',{exact:true})).toBeVisible();
  await expect(tasks.locator('pre').filter({hasText:'"$from": 0'})).toBeVisible();
  await tasks.getByRole('button',{name:'Approve 0.02 test USDC',exact:true}).click();
  expect(state.requests[1]).toMatchObject({path:`/api/tasks/${baseTask.id}`,body:{action:'approve',planHash:hash('4')}});
  state.setTasks([{...baseTask,status:'completed',plan,planHash:hash('4'),steps:[{index:0,orderId:hash('5'),transactionHash:hash('6'),outputHash:hash('7'),output:{text:'Hola'}},{index:1,orderId:hash('8'),transactionHash:hash('9'),outputHash:hash('a'),output:{text:'1 word'}}]}]);
  await tasks.getByRole('button',{name:'Refresh tasks'}).click();
  await expect(tasks.getByText('Completed',{exact:true})).toBeVisible();
  await expect(tasks.getByRole('heading',{name:'Final output'})).toBeVisible();
  await expect(tasks.locator('pre').filter({hasText:/^Hola$/})).toBeVisible();
  await tasks.getByText('Service response',{exact:true}).first().click();
  await expect(tasks.locator('pre').filter({hasText:'"text": "Hola"'})).toBeVisible();
  await expect(tasks.getByRole('link',{name:'Payment receipt · step 2'})).toHaveAttribute('href',`https://testnet.arcscan.app/tx/${hash('9')}`);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.evaluate(() => {window.scrollTo(0, 0); const label=document.createElement('div'); label.textContent='TEST FIXTURE — NO LIVE TRANSACTIONS'; label.style.cssText='padding:10px;text-align:center;background:#fff0ce;color:#402c00;font:12px sans-serif'; document.body.prepend(label);});
  await page.screenshot({path:`test-results/general-tasks-${width}-fixture.png`,fullPage:true});
});
test('unsupported task retry retains its ID and approval rejection is visible',async({page})=>{
 const state=await fixtures(page,[{...baseTask,status:'blocked',error:'No registered service can book a flight.'}]);
 await page.goto(origin+'/app');
 await expect(page.getByText('No registered service can book a flight.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Retry this task'}).click();
 expect(state.requests[0]).toMatchObject({path:`/api/tasks/${baseTask.id}`,body:{action:'retry'}});
 state.setTasks([{...baseTask,status:'needs_approval',plan,planHash:hash('4')}]);
 await page.getByRole('button',{name:'Refresh tasks'}).click();
 await page.route(`**/api/tasks/${baseTask.id}`,route=>route.fulfill({status:409,json:{error:'The plan changed. Refresh and review it again.'}}));
 await page.getByRole('button',{name:'Approve 0.02 test USDC'}).click();
 await expect(page.getByRole('region',{name:'General tasks',exact:true}).getByRole('alert')).toContainText('The plan changed');
});
test('catalog profile starts a general task instruction',async({page})=>{
 await fixtures(page);
 await page.goto(origin+'/app/marketplace');
 await expect(page.getByRole('heading',{name:profile.title,exact:true})).toBeVisible();
 await page.getByRole('link',{name:'Use in a task'}).click();
 await expect(page.getByLabel('Your task',{exact:true})).toHaveValue(`Use the ${profile.title} service (${service.serviceHash}) to: `,{timeout:15000});
});
test('seller publishes custom schemas and retries profile save without another wallet registration',async({page})=>{
 const state=await fixtures(page);
 const empty=encodeAbiParameters([{type:'address'},{type:'uint8'},{type:'bytes32'},{type:'uint256'},{type:'uint256'},{type:'bytes32'}],[address('0'),0,hash('0'),0n,0n,hash('0')]);
 await page.addInitScript(({empty,owner,tx})=>{
  const win=window as Window & {ethereum?:unknown; fixtureSends?:number}; win.fixtureSends=0;
  win.ethereum={request:async({method}:{method:string})=>{if(method==='eth_requestAccounts')return [owner];if(method==='eth_chainId')return '0x4cef52';if(method==='eth_call')return empty;if(method==='eth_sendTransaction'){win.fixtureSends=(win.fixtureSends??0)+1;return tx;}throw Error(method);}};
 },{empty,owner:user.address,tx:hash('b')});
 let attempts=0; const profiles:unknown[]=[];
 await page.route('**/api/economy/services/*/profile',route=>{profiles.push(route.request().postDataJSON());return route.fulfill({status:++attempts===1?503:200,json:attempts===1?{error:'Profile store unavailable'}:{profile}});});
 await page.goto(origin+'/app/marketplace#seller-heading');
 const desk=page.getByRole('region',{name:'Digital service seller desk'});
 await expect(desk.getByRole('link',{name:'Seller payment receipt'})).toHaveAttribute('href',`https://testnet.arcscan.app/tx/${hash('8')}`);
 await expect(desk.getByText('0.0095 test USDC',{exact:true}).first()).toBeVisible();
 await desk.getByLabel('Service title',{exact:true}).fill('Translate supplied text');
 await desk.getByLabel('Service description',{exact:true}).fill(profile.description);
 await desk.getByLabel('Service endpoint',{exact:false}).fill(service.endpoint);
 await desk.getByLabel('Tags',{exact:false}).fill('translation');
 await desk.getByText('Input and output schemas',{exact:true}).click();
 await desk.getByLabel('Input schema JSON',{exact:true}).fill(JSON.stringify(service.inputSchema));
 await desk.getByLabel('Output schema JSON',{exact:true}).fill(JSON.stringify(service.outputSchema));
 await desk.getByLabel('Example inputs JSON',{exact:false}).fill(JSON.stringify(profile.examples));
 await desk.getByRole('button',{name:'Review service terms'}).click();
 await desk.getByRole('button',{name:'Register service in wallet'}).click();
 await desk.getByRole('button',{name:'Publish registered service'}).click();
 await expect(desk.getByRole('alert')).toContainText('Service terms are published');
 await desk.getByRole('button',{name:'Publish registered service'}).click();
 await expect(desk.getByText('Service published. Buyers can discover',{exact:false}).first()).toBeVisible();
 expect(state.requests.filter(req=>req.path==='/api/economy/services'&&req.method==='POST')).toHaveLength(1);
 expect(state.requests.find(req=>req.path==='/api/economy/services'&&req.method==='POST')?.body.inputSchema).toEqual(service.inputSchema);
 expect(profiles).toEqual([{title:profile.title,description:profile.description,tags:profile.tags,examples:profile.examples},{title:profile.title,description:profile.description,tags:profile.tags,examples:profile.examples}]);
 expect(await page.evaluate(()=>(window as Window & {fixtureSends?:number}).fixtureSends)).toBe(1);
 await page.setViewportSize({width:390,height:900});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.evaluate(() => {window.scrollTo(0, 0); const label=document.createElement('div'); label.textContent='TEST FIXTURE — NO LIVE TRANSACTIONS'; label.style.cssText='padding:10px;text-align:center;background:#fff0ce;color:#402c00;font:12px sans-serif'; document.body.prepend(label);});
  await page.screenshot({path:'test-results/general-seller-390-fixture.png',fullPage:true});
});

test('an approved task can be cancelled before the runner claims execution',async({page})=>{
 const state=await fixtures(page,[{...baseTask,status:'approved',plan,planHash:hash('4'),approvedPlanHash:hash('4')}]);
 await page.goto(origin+'/app');
 const tasks=page.getByRole('region',{name:'General tasks',exact:true});
 await expect(tasks.getByText('Approved · waiting for runner',{exact:true})).toBeVisible();
 await tasks.getByRole('button',{name:'Cancel task',exact:true}).click();
 expect(state.requests).toEqual([{path:`/api/tasks/${baseTask.id}`,method:'POST',body:{action:'cancel'},key:undefined}]);
 await expect(tasks.getByText('Cancelled',{exact:true})).toBeVisible();
 await expect(tasks.getByRole('button',{name:'Cancel task',exact:true})).toHaveCount(0);
});
