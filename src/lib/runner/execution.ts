import { z } from 'zod';
import { createRun, advanceRun } from '../engine';
import type { Gateway } from '../gateway';
import type { RepoEvidence } from '../contracts';
import { repositoryScope, validateSignedMandate } from '../platform/execution-contracts';
import { RunnerJournal, stopUncertain } from './journal';
import type { RunnerJob, RunnerPins } from './types';

export async function validateJob(job:RunnerJob,pins:RunnerPins){
 if(!job||!z.uuid().safeParse(job.id).success||job.agentId!==pins.agentId||!repositoryScope.safeParse(job.repos).success||!await validateSignedMandate(job.mandate,pins))throw new Error('Runner rejected the job identity or signed mandate.');
 if(job.repos.some(repo=>!job.mandate.repos.includes(repo)))throw new Error('Job repositories are outside the signed mandate.');
}
/** Defense in depth: this guard checks local pins and signed limits at every capability. */
export function createMandatedGateway(input:RunnerJob,inputPins:RunnerPins,base:Gateway,authorize?:()=>Promise<void>):Gateway {
 const job=structuredClone(input),pins={...inputPins},m=job.mandate;
 let dataStarted=false,reportStarted=false,verificationStarted=false;
 let purchased:RepoEvidence[]|undefined;
 async function allowed(paid=false){
  await validateJob(job,pins);
  if(paid&&authorize){await authorize();await validateJob(job,pins);}
 }
 function identity(runId:string,requestId:string,kind:'data'|'verify',expires:string){
  if(runId!==job.id||requestId!==`${job.id}:${kind}`||expires!==m.expiresAt)throw new Error('Capability identity does not match the signed job.');
 }
 return {
  async discover(){await allowed();return base.discover();},
  async purchaseData(request){
   await allowed(true);identity(request.runId,request.requestId,'data',request.mandateExpiresAt);
   if(dataStarted||JSON.stringify(request.repos)!==JSON.stringify(job.repos)||!m.allowedProviders.includes(request.providerId as 'repo-standard'|'repo-economy')||!Number.isSafeInteger(request.unitPriceAtomic)||request.unitPriceAtomic<=0||request.unitPriceAtomic>m.maxDataUnitPriceAtomic||request.maxAmountAtomic!==request.unitPriceAtomic*job.repos.length||request.maxAmountAtomic>m.dataBudgetAtomic)throw new Error('Data purchase exceeds or differs from the signed scope, or was already attempted.');
   dataStarted=true;
   const result=await base.purchaseData(request);purchased=structuredClone(result.evidence);return result;
  },
  async generateReport(evidence,runId){
   await allowed(true);
   if(runId!==job.id||!purchased||JSON.stringify(purchased)!==JSON.stringify(evidence)||reportStarted)throw new Error('Report capability does not match the purchased evidence or was already attempted.');
   reportStarted=true;return base.generateReport(evidence,runId);
  },
  async verify(request){
   await allowed(true);identity(request.runId,request.requestId,'verify',request.mandateExpiresAt);
   if(verificationStarted||!reportStarted||!purchased||JSON.stringify(request.report.evidence)!==JSON.stringify(purchased)||request.maxAmountAtomic!==50000||request.maxAmountAtomic>m.verificationBudgetAtomic)throw new Error('Verification exceeds or differs from the signed scope, or was already attempted.');
   verificationStarted=true;return base.verify(request);
  },
 };
}
export async function executeJob(input:RunnerJob,options:{pins:RunnerPins;journal:RunnerJournal;gateway:Gateway;signal?:AbortSignal;authorize?:()=>Promise<void>}){
 const job=structuredClone(input);
 // A duplicate may be an expired job whose completed result still needs delivery.
 if(options.journal.existing(job))return;
 await validateJob(job,options.pins);
 const run=createRun({repos:job.repos,mode:'live',mandate:{dataBudgetAtomic:job.mandate.dataBudgetAtomic,verificationBudgetAtomic:job.mandate.verificationBudgetAtomic,maxDataUnitPriceAtomic:job.mandate.maxDataUnitPriceAtomic,allowedProviders:job.mandate.allowedProviders,expiresAt:job.mandate.expiresAt}});
 run.id=job.id;
 await options.journal.start(job,run);
 const gateway=createMandatedGateway(job,options.pins,options.gateway,options.authorize);
 while(!['completed','failed','awaiting_approval'].includes(run.status)){
  if(options.signal?.aborted){await options.journal.finish(job.id,stopUncertain(run));return;}
  await advanceRun(run,gateway);
  await options.journal.checkpoint(job.id,run);
 }
 await options.journal.finish(job.id,run);
}
