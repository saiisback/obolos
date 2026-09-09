import { chmod, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { loadRunnerConfig } from '../src/lib/runner/config';
import { createLocalGateway, RunnerClient } from '../src/lib/runner/transport';
import { RunnerJournal } from '../src/lib/runner/journal';
const dirs:string[]=[];
afterEach(async()=>{for(const dir of dirs.splice(0))await rm(dir,{recursive:true,force:true});});
async function settings(){const dir=await mkdtemp(join(tmpdir(),'obolos-runner-config-'));dirs.push(dir);const tokenFile=join(dir,'token');await writeFile(tokenFile,'runner_secret_abcdefghijklmnopqrstuvwxyz0123456789',{mode:0o600});return {RUNNER_PLATFORM_URL:'https://obolos.app',RUNNER_AGENT_ID:'a6b602e3-35f6-4f66-8c39-ec4970b78b92',RUNNER_OWNER_ADDRESS:`0x${'11'.repeat(20)}`,RUNNER_TOKEN_FILE:tokenFile,RUNNER_DATA_DIR:join(dir,'state'),BROKER_DATA_DIR:join(dir,'broker'),BROKER_URL:'http://127.0.0.1:4318',BROKER_TOKEN:'private_local_broker_token',DATA_SERVICE_URL:'https://obolos.app/x402'};}
it('rejects non-loopback brokers, insecure remote platforms, shared broker journals, and exposed token files',async()=>{
 const env=await settings();
 for(const changes of [{BROKER_URL:'https://remote.example'},{BROKER_URL:'http://127.0.0.1@remote.example'},{RUNNER_PLATFORM_URL:'http://obolos.app'},{RUNNER_DATA_DIR:env.BROKER_DATA_DIR}])await expect(loadRunnerConfig({...env,...changes})).rejects.toThrow();
 await chmod(env.RUNNER_TOKEN_FILE,0o644);await expect(loadRunnerConfig(env)).rejects.toThrow(/0600/);
 await chmod(env.RUNNER_TOKEN_FILE,0o600);const link=join(dirs.at(-1)!,'linked-token');await symlink(env.RUNNER_TOKEN_FILE,link);await expect(loadRunnerConfig({...env,RUNNER_TOKEN_FILE:link})).rejects.toThrow();
});
it('pins broker credentials and discovery URL independently from later environment changes',async()=>{
 const env=await settings(),config=await loadRunnerConfig(env),requests:{url:string;init?:RequestInit}[]=[];
 const fetcher:typeof fetch=async(input,init)=>{requests.push({url:String(input),init});return Response.json(String(input).endsWith('/discovery')?[{id:'repo-standard',name:'Signals',description:'Signals',network:'hedera:testnet',asset:'HBAR',unit:'repository',unitPriceAtomic:100000,endpoint:'https://untrusted.example/pay'}]:{ready:true});};
 const local=createLocalGateway(config,fetcher);
 env.BROKER_URL='https://evil.example';env.DATA_SERVICE_URL='https://evil.example';env.BROKER_TOKEN='replaced';
 const providers=await local.gateway.discover();await local.health();
 expect(requests.map(r=>r.url)).toEqual(['https://obolos.app/x402/discovery','http://127.0.0.1:4318/health']);
 expect(requests[0].init?.headers).toBeUndefined();expect(requests[1].init?.headers).toMatchObject({Authorization:'Bearer private_local_broker_token'});expect(requests.every(r=>r.init?.redirect==='error')).toBe(true);expect(providers[0].endpoint).toBeUndefined();
});
it('does not claim a job when broker credentials or readiness fail',async()=>{
 const config=await loadRunnerConfig(await settings()),j=await RunnerJournal.open(config.dataDir,config.pins.agentId),requests:string[]=[];
 const fetcher:typeof fetch=async(input)=>{requests.push(String(input));return Response.json({ready:false});};
 const client=new RunnerClient(config,j,fetcher);
 await expect(client.pollOnce()).rejects.toThrow(/ready/);expect(requests).toEqual(['http://127.0.0.1:4318/health']);await j.close();
});
it('uses runner token only for the pinned platform after authenticated local health',async()=>{
 const config=await loadRunnerConfig(await settings()),j=await RunnerJournal.open(config.dataDir,config.pins.agentId),requests:{url:string;init?:RequestInit}[]=[];
 const fetcher:typeof fetch=async(input,init)=>{requests.push({url:String(input),init});return Response.json(String(input).endsWith('/health')?{ready:true}:{job:null});};
 await new RunnerClient(config,j,fetcher).pollOnce();
 expect(requests.map(r=>r.url)).toEqual(['http://127.0.0.1:4318/health','https://obolos.app/api/runner/claim']);expect(requests[1].init?.headers).toMatchObject({Authorization:`Bearer ${config.token}`});expect(requests[1].init?.body).toBe('{}');await j.close();
});
it('retries only cached result delivery after a lost acknowledgment and checks authorization at every capability',async()=>{
 const {privateKeyToAccount}=await import('viem/accounts');
 const {mandateMessage}=await import('../src/lib/platform/execution-contracts');
 const {rehearsalGateway}=await import('../src/lib/gateway');
 const {randomUUID}=await import('node:crypto');
 const owner=privateKeyToAccount(`0x${'24'.repeat(32)}`),env=await settings();env.RUNNER_OWNER_ADDRESS=owner.address;
 const config=await loadRunnerConfig(env),j=await RunnerJournal.open(config.dataDir,config.pins.agentId);
 const fields={id:randomUUID(),...config.pins,repos:['vercel/next.js'],allowedProviders:['repo-standard' as const],dataBudgetAtomic:100000,verificationBudgetAtomic:50000,maxDataUnitPriceAtomic:100000,maxRuns:1,expiresAt:new Date(Date.now()+3600000).toISOString()};
 const message=mandateMessage(fields),work={id:randomUUID(),agentId:config.pins.agentId,repos:fields.repos,mandate:{...fields,message,signature:await owner.signMessage({message})}};
 let claims=0,paid=0,authorizations=0;const delivered:string[]=[];
 const fetcher:typeof fetch=async(input,init)=>{
  const url=String(input),body=init?.body?JSON.parse(String(init.body)):undefined;
  if(url.endsWith('/health'))return Response.json({ready:true});
  if(url.endsWith('/claim'))return Response.json({job:claims++===0?work:null});
  if(url.endsWith('/authorization')){expect(init?.method).toBe('GET');authorizations++;return Response.json({authorized:true});}
  if(url.endsWith('/discovery'))return Response.json(await rehearsalGateway.discover());
  if(url.endsWith('/data')){paid++;const result=await rehearsalGateway.purchaseData(body);return Response.json({...result,receipt:{...result.receipt,mode:'live',status:'settled',transactionId:'fixture-hedera'}});}
  if(url.endsWith('/report'))return Response.json({summary:await rehearsalGateway.generateReport(body.evidence,body.runId)});
  if(url.endsWith('/verify')){paid++;const result=await rehearsalGateway.verify(body);return Response.json({...result,receipt:{...result.receipt,mode:'live',status:'settled',transactionId:'fixture-arc'},checks:[{label:'Source',passed:true,detail:'Fixture matches'}]});}
  if(url.endsWith('/result')){delivered.push(String(init?.body));return Response.json({accepted:true},{status:delivered.length===1?503:200});}
  throw new Error('Unexpected URL');
 };
 const client=new RunnerClient(config,j,fetcher);
 await expect(client.pollOnce()).rejects.toThrow(/Platform/);
 expect(j.pending()[0].run.status).toBe('completed');expect(paid).toBe(2);expect(authorizations).toBe(3);
 await client.pollOnce();expect(paid).toBe(2);expect(delivered).toHaveLength(2);expect(delivered[0]).toBe(delivered[1]);expect(j.pending()).toEqual([]);await j.close();
});
