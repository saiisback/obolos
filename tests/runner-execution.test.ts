import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import { mandateMessage, type MandateFields } from '../src/lib/platform/execution-contracts';
import { createRun } from '../src/lib/engine';
import { rehearsalGateway, type Gateway } from '../src/lib/gateway';
import { RunnerJournal } from '../src/lib/runner/journal';
import { executeJob, createMandatedGateway } from '../src/lib/runner/execution';
import type { RunnerJob } from '../src/lib/runner/types';
const account=privateKeyToAccount(`0x${'42'.repeat(32)}`);
const pins={origin:'https://obolos.app',agentId:'3eadfd9b-8de6-41b8-8a25-2b8a372c6ab9',owner:account.address};
const dirs:string[]=[];
afterEach(async()=>{for(const dir of dirs.splice(0))await rm(dir,{recursive:true,force:true});});
async function job(overrides:Partial<MandateFields>={}):Promise<RunnerJob>{
 const m:MandateFields={id:randomUUID(),...pins, repos:['vercel/next.js'],allowedProviders:['repo-standard'],dataBudgetAtomic:100000,verificationBudgetAtomic:50000,maxDataUnitPriceAtomic:100000,maxRuns:1,expiresAt:new Date(Date.now()+3600000).toISOString(),...overrides};
 const message=mandateMessage(m);return {id:randomUUID(),agentId:pins.agentId,repos:['vercel/next.js'],mandate:{...m,message,signature:await account.signMessage({message})}};
}
async function journal(){const dir=await mkdtemp(join(tmpdir(),'obolos-execution-'));dirs.push(dir);return RunnerJournal.open(dir,pins.agentId);}
function liveFake(calls:string[]):Gateway{return {
 ...rehearsalGateway,
 async purchaseData(input){calls.push(input.requestId);const result=await rehearsalGateway.purchaseData(input);return {...result,receipt:{...result.receipt,mode:'live',status:'settled',transactionId:'hedera-fixture'}};},
 async verify(input){calls.push(input.requestId);const result=await rehearsalGateway.verify(input);return {...result,receipt:{...result.receipt,mode:'live',status:'settled',transactionId:'arc-fixture'},checks:[{label:'Source comparison',passed:true,detail:'Fixture source matches.'}]};},
};}
it('executes signed caps under the stable job ID and persists both original receipts',async()=>{
 const j=await journal(),work=await job(),calls:string[]=[];
 await executeJob(work,{pins,journal:j,gateway:liveFake(calls)});
 expect(calls).toEqual([`${work.id}:data`,`${work.id}:verify`]);
 const result=j.pending()[0].run;
 expect(result.status).toBe('completed');expect(result.mandate.dataBudgetAtomic).toBe(100000);
 expect(result.receipts.map(r=>r.transactionId)).toEqual(['hedera-fixture','arc-fixture']);
 await executeJob(work,{pins,journal:j,gateway:liveFake(calls)});
 expect(calls).toHaveLength(2);await j.close();
});
it('rejects server-substituted owner, agent, repository, and signed-cap tampering before any capability',async()=>{
 for(const mutate of [(w:RunnerJob)=>{w.mandate.owner=`0x${'11'.repeat(20)}`;},(w:RunnerJob)=>{w.agentId=randomUUID();},(w:RunnerJob)=>{w.repos=['sveltejs/kit'];},(w:RunnerJob)=>{w.mandate.dataBudgetAtomic=1000000;}]){
  const j=await journal(),work=await job(),calls:string[]=[];mutate(work);
  await expect(executeJob(work,{pins,journal:j,gateway:liveFake(calls)})).rejects.toThrow();
  expect(calls).toEqual([]);expect(j.pending()).toEqual([]);await j.close();
 }
});
it('stops on changed quotes with the signed mandate unchanged and no automatic approval',async()=>{
 const j=await journal(),work=await job(),calls:string[]=[];
 const gateway={...liveFake(calls),discover:async()=>[{id:'repo-standard',name:'Changed quote',description:'Changed',network:'hedera:testnet',asset:'HBAR' as const,unit:'repository',unitPriceAtomic:100001}]};
 await executeJob(work,{pins,journal:j,gateway});
 const result=j.pending()[0].run;
 expect(result.status).toBe('awaiting_approval');expect(result.mandate.maxDataUnitPriceAtomic).toBe(100000);expect(result.authorizations).toBeUndefined();expect(calls).toEqual([]);await j.close();
});
it('the gateway independently blocks a forged payment, duplicate payment, and expiry before the next paid capability',async()=>{
 const work=await job(),calls:string[]=[],gateway=createMandatedGateway(work,pins,liveFake(calls));
 const input={runId:work.id,requestId:`${work.id}:data`,repos:work.repos,providerId:'repo-standard',maxAmountAtomic:100000,unitPriceAtomic:100000,mandateExpiresAt:work.mandate.expiresAt};
 await expect(gateway.purchaseData({...input,maxAmountAtomic:100001,unitPriceAtomic:100001})).rejects.toThrow();
 await expect(gateway.purchaseData({...input,repos:['sveltejs/kit']})).rejects.toThrow();
 await gateway.purchaseData(input);
 await expect(gateway.purchaseData(input)).rejects.toThrow();expect(calls).toHaveLength(1);
 const expired=await job({expiresAt:new Date(Date.now()-1000).toISOString()});
 await expect(createMandatedGateway(expired,pins,liveFake(calls)).generateReport([],expired.id)).rejects.toThrow();expect(calls).toHaveLength(1);
});
it('a restart uploads a failed result preserving receipts without resending a prior payment',async()=>{
 const j=await journal(),work=await job(),calls:string[]=[];
 const run=createRun({repos:work.repos,mode:'live',mandate:work.mandate});run.id=work.id;
 await j.start(work,run);
 const paid=await liveFake(calls).purchaseData({runId:work.id,requestId:`${work.id}:data`,repos:work.repos,providerId:'repo-standard',maxAmountAtomic:100000,unitPriceAtomic:100000,mandateExpiresAt:work.mandate.expiresAt});
 run.receipts.push(paid.receipt);run.stage='report';await j.checkpoint(work.id,run);await j.close();
 const reopened=await RunnerJournal.open(dirs.at(-1)!,pins.agentId);
 await executeJob(work,{pins,journal:reopened,gateway:liveFake(calls)});
 expect(calls).toHaveLength(1);expect(reopened.pending()[0].run.status).toBe('failed');expect(reopened.pending()[0].run.receipts[0].transactionId).toBe('hedera-fixture');await reopened.close();
});
it('checks current control-plane authorization before each paid capability and preserves prior receipts after revocation',async()=>{
 const j=await journal(),work=await job(),calls:string[]=[];let authorizations=0;
 await executeJob(work,{pins,journal:j,gateway:liveFake(calls),authorize:async()=>{authorizations++;if(authorizations===3)throw new Error('Runner authorization revoked.');}});
 expect(authorizations).toBe(3);expect(calls).toEqual([`${work.id}:data`]);
 const result=j.pending()[0].run;expect(result.status).toBe('failed');expect(result.error).toMatch(/revoked/);expect(result.receipts[0].transactionId).toBe('hedera-fixture');await j.close();
});
