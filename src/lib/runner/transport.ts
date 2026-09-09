import { z } from 'zod';
import type { BrokerHealth } from '../contracts';
import type { Gateway } from '../gateway';
import type { RunnerConfig } from './config';
import { executeJob } from './execution';
import type { RunnerJournal } from './journal';
import type { RunnerJob } from './types';
const providers=z.array(z.object({id:z.enum(['repo-standard','repo-economy']),name:z.string().max(100),description:z.string().max(500),network:z.literal('hedera:testnet'),asset:z.literal('HBAR'),unit:z.string().max(40),unitPriceAtomic:z.number().int().positive().max(100000000)})).min(1).max(10);
const signalFor=(ms:number,signal?:AbortSignal)=>signal?AbortSignal.any([signal,AbortSignal.timeout(ms)]):AbortSignal.timeout(ms);
export function createLocalGateway(config:RunnerConfig,fetcher:typeof fetch=fetch,signal?:AbortSignal):{gateway:Gateway;health:()=>Promise<void>}{
 const brokerUrl=config.brokerUrl,brokerToken=config.brokerToken,dataServiceUrl=config.dataServiceUrl;
 async function broker<T>(path:string,body?:unknown):Promise<T>{
  try{
   const response=await fetcher(`${brokerUrl}${path}`,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${brokerToken}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:signalFor(path==='/health'?45000:300000,signal),cache:'no-store',redirect:'error'});
   if(!response.ok)throw new Error('Broker request failed.');
   return await response.json() as T;
  }catch{throw new Error(body===undefined?'Local broker is unavailable or its credential was rejected.':'Local broker operation failed; payment may be uncertain. Reconcile locally; no retry was made.');}
 }
 return {
  health:async()=>{const result=await broker<BrokerHealth>('/health');if(result.ready!==true)throw new Error('Local broker is not ready. No job was claimed.');},
  gateway:{
   async discover(){
    const response=await fetcher(`${dataServiceUrl}/discovery`,{signal:signalFor(10000,signal),cache:'no-store',redirect:'error'});
    if(!response.ok)throw new Error('Pinned service discovery is unavailable.');
    return providers.parse(await response.json());
   },
   purchaseData:input=>broker('/data',input),
   async generateReport(evidence,runId){const result=await broker<{summary:string}>('/report',{evidence,runId});return z.string().min(1).max(12000).parse(result.summary);},
   verify:input=>broker('/verify',input),
  },
 };
}
export class RunnerClient {
 private local:ReturnType<typeof createLocalGateway>;
 private polling=false;
 constructor(private config:RunnerConfig,private journal:RunnerJournal,private fetcher:typeof fetch=fetch,private signal?:AbortSignal){this.local=createLocalGateway(config,fetcher,signal);}
 private async platform(path:string,body?:unknown){
  const response=await this.fetcher(`${this.config.pins.origin}${path}`,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${this.config.token}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:signalFor(30000,this.signal),cache:'no-store',redirect:'error'});
  if(!response.ok)throw new Error('Platform request failed. Check connectivity and runner pairing.');
  return response;
 }
 async flushResults(){
  for(const entry of this.journal.pending()){
   await this.platform(`/api/runner/jobs/${encodeURIComponent(entry.job.id)}/result`,{result:entry.run});
   await this.journal.acknowledge(entry.job.id);
  }
 }
 async pollOnce(){
  if(this.polling)throw new Error('Runner already has an active polling cycle.');
  this.polling=true;
  try{
   await this.flushResults();
   await this.local.health();
   const response=await this.platform('/api/runner/claim',{}),body=await response.json() as {job:RunnerJob|null};
   if(!body||!Object.hasOwn(body,'job'))throw new Error('Platform claim response is invalid.');
   if(body.job===null)return;
   await executeJob(body.job,{pins:this.config.pins,journal:this.journal,gateway:this.local.gateway,signal:this.signal,authorize:async()=>{
    try{const permission=await this.platform(`/api/runner/jobs/${encodeURIComponent(body.job!.id)}/authorization`);if((await permission.json()).authorized!==true)throw new Error('Denied');}
    catch{throw new Error('Current runner authorization could not be confirmed. The next capability was blocked before submission.');}
   }});
   await this.flushResults();
  }finally{this.polling=false;}
 }
}
