import { randomUUID } from 'node:crypto';
import { verifyMessage } from 'viem';
import { z } from 'zod';
import { verificationServiceSchema } from './market/contracts';
import type { AuditEvent, Mandate, Receipt, Run, Provider } from './contracts';
import { appendAudit,assessQuote } from './policy';
import { checkReport,DEFAULT_PROVIDERS,type Gateway } from './gateway';

const atomic=z.number().int().positive().max(100000000);
const inputSchema=z.object({
 repos:z.array(z.string().trim().regex(/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/)).min(1).max(3).refine(x=>new Set(x.map(s=>s.toLowerCase())).size===x.length,'Use distinct repositories.'),
 mode:z.enum(['rehearsal','live']),
 mandate:z.object({dataBudgetAtomic:atomic,maxDataUnitPriceAtomic:atomic,verificationBudgetAtomic:atomic,allowedProviders:z.array(z.enum(['repo-standard','repo-economy'])).min(1),expiresAt:z.iso.datetime(),verificationService:verificationServiceSchema.optional()}).partial().optional()
});
export function createRun(raw:unknown):Run{
 const input=inputSchema.parse(raw),now=new Date().toISOString();
 const mandate:Mandate={dataBudgetAtomic:2000000,maxDataUnitPriceAtomic:150000,verificationBudgetAtomic:100000,allowedProviders:['repo-standard','repo-economy'],expiresAt:new Date(Date.now()+3600000).toISOString(),...input.mandate,version:1};
 if(Date.parse(mandate.expiresAt)<=Date.now()||Date.parse(mandate.expiresAt)>Date.now()+86400000)throw new Error('Mandate expiry must be within the next 24 hours.');
 const run:Run={id:randomUUID(),mode:input.mode,title:`Compare ${input.repos.map(r=>r.split('/')[1]).join(', ')}`,repos:input.repos,status:'ready',stage:'mandate',createdAt:now,updatedAt:now,mandate,providers:structuredClone(DEFAULT_PROVIDERS),dataSpentAtomic:0,verificationSpentAtomic:0,evidence:[],receipts:[],events:[],shockApplied:false};
 log(run,'supervisor','info','Mandate created',`${input.mode==='rehearsal'?'Rehearsal only. ':''}Up to ${mandate.dataBudgetAtomic/1e8} HBAR for evidence and ${mandate.verificationBudgetAtomic/1e6} USDC for verification. Expires ${mandate.expiresAt}.`);
 return run;
}
function log(run:Run,actor:AuditEvent['actor'],kind:AuditEvent['kind'],title:string,detail:string){run.events=appendAudit(run.events,actor,kind,title,detail);run.updatedAt=new Date().toISOString();}
function requestApproval(run:Run,p:Provider,reason:string){
 const proposed:Mandate={...run.mandate,version:run.mandate.version+1,maxDataUnitPriceAtomic:Math.max(run.mandate.maxDataUnitPriceAtomic,p.unitPriceAtomic),dataBudgetAtomic:Math.max(run.mandate.dataBudgetAtomic,run.dataSpentAtomic+p.unitPriceAtomic*run.repos.length),expiresAt:new Date(Date.now()+3600000).toISOString()};
 const nonce=randomUUID(),expiresAt=new Date(Date.now()+300000).toISOString();
 const signerMode=process.env.LEDGER_SIGNER_MODE==='speculos'?'speculos':'usb';
 const message=['Obolos mandate authorization','Purpose: approve spending limits only; this does not sign a token transfer.',`Run: ${run.id}`,`Mode: ${run.mode}`,...(run.mode==='live'&&signerMode==='speculos'?['Signer: Speculos emulator (development only; not physical hardware)']:[]),`Nonce: ${nonce}`,`Approval expires: ${expiresAt}`,`Previous mandate version: ${run.mandate.version}`,`New mandate: ${JSON.stringify(proposed)}`].join('\n');
 run.approval={nonce,message,expiresAt,proposedMandate:proposed,reason,...(run.mode==='live'?{signerMode}:{})};run.status='awaiting_approval';
 log(run,'planner','blocked','Human approval required',reason);
}
function validateReceipt(run:Run,r:Receipt,requestId:string,network:Receipt['network'],amount:number){
 if(r.mode!==run.mode||r.requestId!==requestId||r.network!==network||r.asset!==(network==='hedera:testnet'?'HBAR':'USDC')||r.amountAtomic!==amount)throw new Error('Receipt does not match the authorized payment.');
 if(run.mode==='live'&&(r.status!=='settled'||!r.transactionId))throw new Error('No confirmed live settlement was returned.');
 if(run.mode==='rehearsal'&&(r.status!=='simulated'||r.transactionId))throw new Error('Rehearsal receipts must be explicitly simulated.');
}
export async function advanceRun(run:Run,gateway:Gateway):Promise<Run>{
 if(['completed','failed','paused','awaiting_approval'].includes(run.status))return run;
 run.status='running';
 try{
  if(Date.parse(run.mandate.expiresAt)<=Date.now())throw new Error('Mandate expired. Start a new job with a fresh allowance.');
  if(run.stage==='mandate'){
   log(run,'broker','success','Mandate accepted','Only named services can receive requests. Wallet and provider credentials remain outside the agent.');run.stage='discovery';
  }else if(run.stage==='discovery'){
   const providers=await gateway.discover();
   run.providers=run.mode==='rehearsal'&&run.shockApplied?shocked(providers):providers;
   const eligible=run.providers.filter(p=>run.mandate.allowedProviders.includes(p.id)).sort((a,b)=>a.unitPriceAtomic-b.unitPriceAtomic);
   if(!eligible.length)throw new Error('No discoverable provider is on the allowlist.');
   run.selectedProvider=eligible[0].id;run.stage='purchase';
   log(run,'planner','success','Services discovered',`Selected ${eligible[0].name} at ${eligible[0].unitPriceAtomic/1e8} HBAR per repository from ${eligible.length} approved quotes.`);
  }else if(run.stage==='purchase'){
   // Refresh live quotes immediately before authorizing the irreversible operation.
   if(run.mode==='live')run.providers=await gateway.discover();
   const eligible=run.providers.filter(p=>run.mandate.allowedProviders.includes(p.id)).sort((a,b)=>a.unitPriceAtomic-b.unitPriceAtomic);
   const approved=eligible.find(p=>assessQuote(run.mandate,p,run.repos.length,run.dataSpentAtomic).allowed);
   if(!approved){if(!eligible.length)throw new Error('No approved provider is available.');requestApproval(run,eligible[0],assessQuote(run.mandate,eligible[0],run.repos.length,run.dataSpentAtomic).reason);return run;}
   if(run.selectedProvider!==approved.id)log(run,'planner','warning','Provider rerouted',`Selected ${approved.name} because its current quote fits the mandate.`);
   run.selectedProvider=approved.id;
   const requestId=`${run.id}:data`,amount=approved.unitPriceAtomic*run.repos.length;
   log(run,'broker','info','Payment authorized',`Request ${requestId}: ${amount} tinybar for ${run.repos.length} repository units. A failed or uncertain transfer is never automatically repeated.`);
   const result=await gateway.purchaseData({runId:run.id,requestId,repos:run.repos,providerId:approved.id,maxAmountAtomic:amount,unitPriceAtomic:approved.unitPriceAtomic,mandateExpiresAt:run.mandate.expiresAt});
   validateReceipt(run,result.receipt,requestId,'hedera:testnet',amount);
   if(result.evidence.length!==run.repos.length||result.evidence.some(e=>!run.repos.includes(e.repo))||new Set(result.evidence.map(e=>e.repo)).size!==run.repos.length)throw new Error('Purchased evidence does not cover the requested repositories.');
   run.evidence=result.evidence;run.receipts.push(result.receipt);run.dataSpentAtomic+=amount;run.stage='report';
   log(run,'broker','success',run.mode==='live'?'Hedera payment settled':'Hedera payment rehearsed',`${amount/1e8} HBAR purchased ${run.evidence.length} source records. ${run.mode==='rehearsal'?'No funds moved.':result.receipt.transactionId}`);
  }else if(run.stage==='report'){
   const summary=await gateway.generateReport(run.evidence,run.id);
   run.report={title:run.title,summary,recommendation:'Use these observations as a starting point. Validate framework suitability against your project requirements; popularity is not a quality guarantee.',evidence:run.evidence,generatedBy:run.mode==='rehearsal'?'template':'model',createdAt:new Date().toISOString(),checks:[],verified:false};run.stage='verification';
   log(run,'worker','success','Report drafted',`${run.mode==='rehearsal'?'Template rehearsal':'Model-generated analysis'} grounded in ${run.evidence.length} purchased records. Source-integrity and structural checks are still pending.`);
  }else if(run.stage==='verification'){
   const amount=run.mandate.verificationService?.priceAtomic??50000;
   if(run.verificationSpentAtomic+amount>run.mandate.verificationBudgetAtomic)throw new Error('Verification would exceed the USDC allowance. No payment was made.');
   if(!run.report)throw new Error('No report is ready to verify.');
   const requestId=`${run.id}:verify`,result=await gateway.verify({runId:run.id,requestId,maxAmountAtomic:amount,report:run.report,mandateExpiresAt:run.mandate.expiresAt});
   validateReceipt(run,result.receipt,requestId,'arc:testnet',amount);
   run.receipts.push(result.receipt);run.verificationSpentAtomic+=amount;
   if(run.mode==='live'&&(!Array.isArray(result.checks)||!result.checks.length))throw new Error('The paid verifier did not return its evidence checks.');
   run.report.checks=[...checkReport(run.report),...(result.checks??[])];run.report.verified=run.report.checks.every(c=>c.passed);
   if(!run.report.verified)throw new Error('The paid verification found invalid evidence. Review the recorded receipt and failed checks.');
   run.stage='complete';run.status='completed';
   log(run,'verifier','success','Evidence checked · job complete',`${run.report.checks.length} structural/source checks passed. Narrative judgment is not independently certified. ${run.mode==='live'?'Arc USDC settlement confirmed.':'Arc payment simulated; no funds moved.'}`);
  }
 }catch(error){run.status='failed';run.error=error instanceof Error?error.message:'The operation failed.';log(run,'broker','blocked','Run stopped',run.error);}
 return run;
}
function shocked(providers:Provider[]){return providers.map((p,i)=>({...p,unitPriceAtomic:400000+i*50000}));}
export function applyShock(run:Run,liveQuotes?:Provider[]){
 if(!['mandate','discovery','purchase'].includes(run.stage)||['completed','failed','awaiting_approval'].includes(run.status))throw new Error('Apply the price change before the data purchase.');
 if(run.mode==='live'&&!liveQuotes?.length)throw new Error('Live price changes require refreshed provider quotes.');
 run.providers=run.mode==='live'?liveQuotes!:shocked(run.providers);run.shockApplied=true;
 log(run,'supervisor','warning','Provider price increased',`Quotes increased to ${run.providers.map(p=>`${p.unitPriceAtomic/1e8} HBAR/repository`).join(' and ')}. The planner must evaluate the new prices before paying.`);return run;
}
export async function approveRun(run:Run,input:{signature?:string}){
 const a=run.approval;
 if(!a||run.status!=='awaiting_approval')throw new Error('There is no pending approval.');
 if(Date.parse(a.expiresAt)<=Date.now())throw new Error('Approval expired. Reject this request and start a new job.');
 if(a.proposedMandate.version!==run.mandate.version+1)throw new Error('The approval does not match the current mandate.');
 if(run.mode==='live'){
  const configuredMode=process.env.LEDGER_SIGNER_MODE||'usb';
  if(!['usb','speculos'].includes(configuredMode)||(a.signerMode||'usb')!==configuredMode)throw new Error('Controller signer mode changed; request a new approval.');
  const address=process.env.LEDGER_CONTROLLER_ADDRESS;
  if(!address||!/^0x[0-9a-fA-F]{40}$/.test(address)||!input.signature||!/^0x[0-9a-fA-F]{130}$/.test(input.signature))throw new Error('A valid Ledger controller signature is required.');
  if(!await verifyMessage({address:address as `0x${string}`,message:a.message,signature:input.signature as `0x${string}`}))throw new Error('Signature does not match the configured Ledger controller.');
 }
 run.authorizations??=[];
 run.authorizations.push({mode:run.mode,nonce:a.nonce,message:a.message,verifiedAt:new Date().toISOString(),previousMandate:structuredClone(run.mandate),approvedMandate:structuredClone(a.proposedMandate),...(run.mode==='live'?{signer:process.env.LEDGER_CONTROLLER_ADDRESS,signature:input.signature,signerMode:a.signerMode||'usb'}:{})});
 run.mandate=a.proposedMandate;run.approval=undefined;run.status='running';
 log(run,'supervisor','success',run.mode==='rehearsal'?'Rehearsal allowance approved':'Controller signature verified',`Mandate version ${run.mandate.version}; nonce ${a.nonce} consumed. ${run.mode==='rehearsal'?'This was a simulated approval, not a Ledger signature.':a.signerMode==='speculos'?'Speculos emulator signature verified; not physical hardware evidence.':'Hardware provenance depends on provisioning the pinned address from the Ledger device.'}`);return run;
}
export function pauseRun(run:Run){
 if(['failed','completed','awaiting_approval'].includes(run.status))throw new Error('This run cannot be paused or resumed in its current state.');
 run.status=run.status==='paused'?'running':'paused';log(run,'supervisor','warning',run.status==='paused'?'Run paused':'Run resumed','The next payment step follows the updated run state. Settled transfers are not reversed.');return run;
}
