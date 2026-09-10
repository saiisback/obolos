/** Bounded release test. Identities/tokens/state live only under ignored data/.
 * prepare does not pay. execute permits at most the persisted one-run mandate;
 * a durable marker prevents a second execution after failure or interruption. */
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,chmod} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {privateKeyToAccount} from 'viem/accounts';
import {loadRunnerConfig} from '../src/lib/runner/config';
import {RunnerJournal} from '../src/lib/runner/journal';
import {RunnerClient} from '../src/lib/runner/transport';
async function main(){
const dir=resolve(process.env.OBOLOS_RELEASE_DIR||'data/market-release');
type State={origin:string;buyerKey:`0x${string}`;sellerKey:`0x${string}`;[k:string]:any};
const state:State=JSON.parse(await readFile(resolve(dir,'state.json'),'utf8'));
async function save(){await writeFile(resolve(dir,'state.json'),JSON.stringify(state),{mode:0o600});await chmod(resolve(dir,'state.json'),0o600);}
function client(role:'buyer'|'seller'){
 const account=privateKeyToAccount(role==='buyer'?state.buyerKey:state.sellerKey);
 const cookies=new Map<string,string>();
 async function request(path:string,body?:unknown,method=body===undefined?'GET':'POST',extra:Record<string,string>={}){
  const r=await fetch(`${state.origin}${path}`,{method,headers:{Origin:state.origin,'Content-Type':'application/json',Cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; '),...extra},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'error',signal:AbortSignal.timeout(120000)});
  for(const c of r.headers.getSetCookie()){const first=c.split(';')[0],n=first.indexOf('=');cookies.set(first.slice(0,n),first.slice(n+1));}
  const data=await r.json();if(!r.ok)throw Error(`${path} returned ${r.status}: ${data.code||'request failed'}`);return data;
 }
 async function login(){const challenge=await request('/api/auth/challenge',{address:account.address});await request('/api/auth/verify',{signature:await account.signMessage({message:challenge.message})});}
 return {account,request,login};
}
const buyer=client('buyer'),seller=client('seller');
async function signMandate(){const p=await buyer.request(`/api/agents/${state.agentId}/mandate`,{phase:'prepare',repos:['octocat/Hello-World'],maxDataUnitPriceAtomic:100000,maxRuns:1,expiresAt:new Date(Date.now()+3600000).toISOString(),verificationServiceId:state.serviceId});
 assert.equal(p.mandate.verificationService.recipient.toLowerCase(),seller.account.address.toLowerCase());assert.equal(p.mandate.verificationService.priceAtomic,50000);assert.equal(p.mandate.dataBudgetAtomic,100000);
 const a=await buyer.request(`/api/agents/${state.agentId}/mandate`,{phase:'approve',mandateId:p.mandate.id,signature:await buyer.account.signMessage({message:p.message})});state.mandate=a.mandate;await save();}
async function prepare(){
 await buyer.login();await seller.login();
 if(!state.serviceId){const s=await seller.request('/api/market/services',{name:'Obolos Metric Check',description:'Hosted testnet verification of repository stars, forks and issue claims against purchased evidence. Reference seller.',priceAtomic:50000});state.serviceId=s.service.id;await save();}
 if(!state.agentId){const a=await buyer.request('/api/agents',{name:'Marketplace release buyer',description:'One bounded testnet purchase from a separately signed-in seller.',dataBudgetAtomic:100000,verificationBudgetAtomic:50000});state.agentId=a.agent.id;await save();}
 if(!state.runnerToken){const r=await buyer.request(`/api/agents/${state.agentId}/runner`,{});state.runnerToken=r.token;state.runnerId=r.runner.id;await writeFile(resolve(dir,'runner.token'),r.token,{mode:0o600,flag:'wx'});await save();}
 if(!state.apiKey){const k=await buyer.request(`/api/agents/${state.agentId}/keys`,{name:'Bounded marketplace test'});state.apiKey=k.token;await save();}
 if(!state.mandate||Date.parse(state.mandate.expiresAt)<=Date.now())await signMandate();
 console.log(JSON.stringify({prepared:true,serviceId:state.serviceId,agentId:state.agentId,seller:seller.account.address,buyer:buyer.account.address,maxHBAR:'0.001',maxUSDC:'0.05'}));
}
async function inspect(){await buyer.login();await seller.login();const r=await buyer.request(`/api/agents/${state.agentId}/runs`);const earnings=await seller.request('/api/market/earnings');state.lastInspection={runs:r.runs,earnings};await save();console.log(JSON.stringify({runs:r.runs.map((x:any)=>({id:x.id,status:x.status,receiptVerification:x.receiptVerification,error:x.result?.error,receipts:x.result?.receipts,checks:x.result?.report?.checks})),sellerTotalAtomic:earnings.totalAtomic}));}
async function execute(){
 assert(state.agentId&&state.runnerToken&&state.mandate,'Prepare first');assert(Date.parse(state.mandate.expiresAt)>Date.now(),'Prepare a fresh unexecuted mandate');
 await mkdir(resolve(dir,'runner'),{recursive:true,mode:0o700});
 const config=await loadRunnerConfig({...process.env,RUNNER_PLATFORM_URL:state.origin,RUNNER_AGENT_ID:state.agentId,RUNNER_OWNER_ADDRESS:buyer.account.address,RUNNER_TOKEN_FILE:resolve(dir,'runner.token'),RUNNER_DATA_DIR:resolve(dir,'runner'),DATA_SERVICE_URL:`${state.origin}/x402`});
 const journal=await RunnerJournal.open(config.dataDir,config.pins.agentId),runner=new RunnerClient(config,journal);
 try{
  await buyer.login();const jobs=await buyer.request(`/api/agents/${state.agentId}/runs`);assert.equal(jobs.runs.length,0,'Existing job prohibits a fresh charge');
  await runner.pollOnce();
  state.idempotencyKey=state.idempotencyKey??`market-release-${randomUUID()}`;await save();
  // This file is never reset by the test. Uncertainty requires reconciliation.
  await writeFile(resolve(dir,'execution-intent.json'),JSON.stringify({agentId:state.agentId,mandateId:state.mandate.id,idempotencyKey:state.idempotencyKey,maxHbarAtomic:100000,maxUsdcAtomic:50000}),{mode:0o600,flag:'wx'});
  const job=await buyer.request(`/api/v1/agents/${state.agentId}/runs`,{repos:['octocat/Hello-World']},'POST',{Authorization:`Bearer ${state.apiKey}`,'Idempotency-Key':state.idempotencyKey});state.jobId=job.run.id;await save();
  console.log(JSON.stringify({queuedJob:state.jobId}));await runner.pollOnce();
 }finally{await journal.close();}
 await inspect();
 const result=state.lastInspection.runs.find((j:any)=>j.id===state.jobId);assert.equal(result.status,'succeeded');assert.equal(result.receiptVerification,'chain-confirmed');assert(state.lastInspection.earnings.orders.some((o:any)=>o.jobId===state.jobId&&o.amountAtomic===50000));assert(result.result.receipts.find((r:any)=>r.orderId&&r.recipient.toLowerCase()===seller.account.address.toLowerCase()));
 console.log('Paid marketplace release test passed.');
}
const mode=process.argv[2];
try{if(mode==='prepare')await prepare();else if(mode==='execute')await execute();else if(mode==='inspect')await inspect();else throw Error('Use prepare, execute, or inspect');}catch(e){console.error(e instanceof Error?e.message:'Marketplace smoke failed');process.exitCode=1;}

}
main().catch(()=>{console.error("Marketplace test setup unavailable; check its private fixture files.");process.exitCode=1;});
