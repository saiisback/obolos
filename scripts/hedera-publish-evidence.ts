/** Public-proof publisher. It never decrypts Ring, signs or resubmits a payment. */
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import pg from 'pg';
import {z} from 'zod';
import {publicHederaEvidence,type PublicHederaEvidence} from '../src/lib/hedera/public-evidence';
import type {HederaAgentIdentity} from '../src/lib/hedera/identity';
import {buildProfilePayload,buildPaymentAuditPayload,verifyHcsAnchor,verifyAuditPayment,normalizeHcsTransactionId,type PaymentAuditInput} from '../src/lib/hedera/audit';
import {validateSchedulePlan,validateScheduledProof} from '../src/lib/hedera/commerce';
import {validateEvidence} from '../src/lib/integrations/hedera';
import {validateRepos} from '../src/lib/repository-service';
const account=z.string().regex(/^0\.0\.[1-9]\d*$/);
const txId=z.string().regex(/^0\.0\.[1-9]\d*@\d{10,}\.\d{1,9}(?:\?scheduled)?$/);
const positive=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const receiptSchema=z.object({requestId:z.string().min(1).max(200),mode:z.literal('live'),network:z.literal('hedera:testnet'),asset:z.literal('HBAR'),amountAtomic:positive,units:z.number().int().min(1).max(3),provider:z.enum(['repo-standard','repo-economy']),status:z.literal('settled'),timestamp:z.iso.datetime({offset:true}),transactionId:txId});
const a2aSchema=z.object({status:z.literal('completed'),offer:z.object({offerId:z.string().min(1).max(120),paymentRequestId:z.string().min(1).max(200),payer:account,payTo:account,providerId:z.enum(['repo-standard','repo-economy']),amountAtomic:positive,repos:z.array(z.string()).min(1).max(3)}),result:z.object({offerId:z.string(),payer:account,receipt:receiptSchema,evidence:z.unknown()})});
const tokenSchema=z.object({status:z.literal('settled'),transactionId:txId,input:z.object({requestId:z.string().min(1).max(200),repos:z.array(z.string()).min(1).max(3),terms:z.object({asset:account,payer:account,payTo:account,amountAtomic:positive})}),result:z.object({status:z.literal('settled'),requestId:z.string(),transactionId:txId,network:z.literal('hedera:testnet'),asset:account,payer:account,payTo:account,amountAtomic:positive,evidence:z.unknown()})});
export interface HederaPublicationPaths {identityServiceFile:string;identityBuyerFile?:string;a2aFile?:string;htsFile?:string;schedulesFile?:string;scheduledResultsFile?:string;auditFile?:string;auditPaymentFile?:string;replaceRelease?:boolean}
export interface PreparedHederaPublication {identityService:NonNullable<PublicHederaEvidence['identityService']>;identityBuyer?:NonNullable<PublicHederaEvidence['identityBuyer']>;release:NonNullable<PublicHederaEvidence['release']>}
async function localJson(filename:string):Promise<unknown> {const content=await readFile(path.resolve(filename),'utf8');if(Buffer.byteLength(content)>5*1024*1024)throw Error('Local evidence artifact is oversized.');return JSON.parse(content);}
async function mirrorJson(url:string):Promise<unknown> {const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Public mirror proof is unavailable.');return response.json();}
const mirror='https://testnet.mirrornode.hedera.com/api/v1';
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function verifiedIdentity(filename:string):Promise<NonNullable<PublicHederaEvidence['identityService']>> {
 const identity=publicHederaEvidence({identityService:await localJson(filename)}).identityService;
 if(!identity?.profileAnchor)throw Error('Identity must carry a confirmed profile anchor.');
 await verifyHcsAnchor(identity.profileAnchor,buildProfilePayload(identity),identity.submitKey);return identity;
}
function auditInput(identity:HederaAgentIdentity,input:{transactionId:string;asset:string;amountAtomic:number;payer:string;payTo:string;requestId:string;evidence:unknown}):PaymentAuditInput {
 return {uaid:identity.uaid,paymentTransactionId:input.transactionId,network:'hedera:2',asset:input.asset,amountAtomic:String(input.amountAtomic),payer:input.payer,payTo:input.payTo,requestId:input.requestId,evidenceDigest:digest(input.evidence)};
}
/** Verify all supplied artifacts first. Only explicit public schemas leave this function. */
export async function prepareHederaPublication(paths:HederaPublicationPaths):Promise<PreparedHederaPublication> {
 if(Boolean(paths.schedulesFile)!==Boolean(paths.scheduledResultsFile)||Boolean(paths.auditFile)!==Boolean(paths.auditPaymentFile))throw Error('Schedule and audit artifacts must be paired.');
 const identityService=await verifiedIdentity(paths.identityServiceFile),identityBuyer=paths.identityBuyerFile?await verifiedIdentity(paths.identityBuyerFile):undefined;
 const release:NonNullable<PublicHederaEvidence['release']>={checkedAt:new Date().toISOString()};
 const purchaseIdentity=identityBuyer??identityService;
 if(paths.a2aFile){
  const entry=a2aSchema.parse(await localJson(paths.a2aFile)),{offer,result}=entry,{receipt}=result,repos=validateRepos(offer.repos),evidence=validateEvidence(result.evidence,repos);
  if(result.offerId!==offer.offerId||result.payer!==offer.payer||receipt.requestId!==offer.paymentRequestId||receipt.provider!==offer.providerId||receipt.units!==repos.length||receipt.amountAtomic!==offer.amountAtomic)throw Error('A2A result differs from its completed accepted offer.');
  await verifyAuditPayment(auditInput(purchaseIdentity,{transactionId:receipt.transactionId,asset:'HBAR',amountAtomic:receipt.amountAtomic,payer:offer.payer,payTo:offer.payTo,requestId:receipt.requestId,evidence}));
  release.a2a={offerId:result.offerId,receipt};
 }
 if(paths.htsFile){
  const entry=tokenSchema.parse(await localJson(paths.htsFile)),{input,result}=entry,evidence=validateEvidence(result.evidence,validateRepos(input.repos));
  if(result.transactionId!==entry.transactionId||result.requestId!==input.requestId||result.asset!==input.terms.asset||result.payer!==input.terms.payer||result.payTo!==input.terms.payTo||result.amountAtomic!==input.terms.amountAtomic)throw Error('Token result differs from its recorded exact purchase terms.');
  await verifyAuditPayment(auditInput(purchaseIdentity,{...result,evidence}));
  release.hts={transactionId:result.transactionId,asset:result.asset,amountAtomic:result.amountAtomic,payer:result.payer,payTo:result.payTo};
 }
 if(paths.schedulesFile&&paths.scheduledResultsFile){
  const refs=z.object({plan:z.unknown(),schedules:z.array(z.object({round:z.number().int().min(0).max(9),scheduleId:account,transactionId:txId,scheduledTransactionId:txId})).min(1).max(10)}).parse(await localJson(paths.schedulesFile));
  const plan=validateSchedulePlan(refs.plan,0,true),results=z.array(z.object({round:z.number().int().min(0).max(9),scheduleId:account,scheduledTransactionId:txId,evidence:z.unknown(),proof:z.unknown()})).min(1).max(10).parse(await localJson(paths.scheduledResultsFile));
  if(results.length!==refs.schedules.length||refs.schedules.length!==plan.count||new Set(refs.schedules.map(s=>s.round)).size!==plan.count||new Set(refs.schedules.map(s=>s.scheduleId)).size!==plan.count||new Set(results.map(s=>s.scheduleId)).size!==plan.count)throw Error('Finite schedule publication requires every distinct planned delivery.');
  release.schedules=[];
  for(const ref of refs.schedules){
   const saved=results.find(r=>r.scheduleId===ref.scheduleId&&r.round===ref.round);
   if(!saved||ref.round>=plan.count||saved.scheduledTransactionId!==ref.scheduledTransactionId||!ref.scheduledTransactionId.endsWith('?scheduled'))throw Error('Scheduled delivery differs from its original transaction identity.');
   validateEvidence(saved.evidence,plan.repos);
   const schedule=await mirrorJson(`${mirror}/schedules/${ref.scheduleId}`) as {executed_timestamp?:string};
   const transfer=await mirrorJson(`${mirror}/transactions/${normalizeHcsTransactionId(ref.scheduledTransactionId)}?scheduled=true`);
   validateScheduledProof(schedule,transfer,plan,ref.round,ref.scheduleId);
   const amountAtomic=plan.unitPriceAtomic*plan.repos.length;
   await verifyAuditPayment(auditInput(purchaseIdentity,{transactionId:ref.scheduledTransactionId,asset:'HBAR',amountAtomic,payer:plan.payer,payTo:plan.payTo,requestId:plan.id+':'+ref.round,evidence:saved.evidence}));
   const proof={scheduleId:ref.scheduleId,consensusTimestamp:schedule.executed_timestamp!,payer:plan.payer,payTo:plan.payTo,amountAtomic,network:'hedera:testnet' as const,asset:'HBAR' as const,round:ref.round};
   // Compare server delivery proof with independently recovered consensus data, excluding unknown fields.
   const parsed=publicHederaEvidence({release:{checkedAt:release.checkedAt,schedules:[{scheduleId:ref.scheduleId,transactionId:ref.scheduledTransactionId,proof:saved.proof}]}}).release?.schedules?.[0]?.proof;
   if(!parsed||Object.entries(proof).some(([key,value])=>parsed[key as keyof typeof parsed]!==value))throw Error('Saved resource delivery proof differs from confirmed schedule.');
   release.schedules.push({scheduleId:ref.scheduleId,transactionId:ref.scheduledTransactionId,proof});
  }
 }
 if(paths.auditFile&&paths.auditPaymentFile){
  const saved=z.object({result:z.unknown()}).parse(await localJson(paths.auditFile)),payment=z.object({uaid:z.string(),paymentTransactionId:txId,network:z.literal('hedera:2'),asset:z.string(),amountAtomic:z.string(),payer:account,payTo:account,requestId:z.string(),evidenceDigest:z.string()}).parse(await localJson(paths.auditPaymentFile));
  const identity=[identityService,identityBuyer].find(id=>id?.uaid===payment.uaid);
  if(!identity)throw Error('Audit references an identity absent from this verified publication.');
  const anchor=publicHederaEvidence({release:{checkedAt:release.checkedAt,audit:saved.result}}).release?.audit;
  if(!anchor||anchor.topicId!==identity.topicId)throw Error('Audit topic differs from the verified restricted identity topic.');
  await verifyAuditPayment(payment);await verifyHcsAnchor(anchor,buildPaymentAuditPayload(payment),identity.submitKey);
  release.audit=anchor;
 }
 const sanitized=publicHederaEvidence({identityService,identityBuyer,release});
 if(!sanitized.identityService||!sanitized.release||identityBuyer&&!sanitized.identityBuyer)throw Error('Verified evidence does not fit the public API schema.');
 return {identityService:sanitized.identityService,...(sanitized.identityBuyer?{identityBuyer:sanitized.identityBuyer}:{}),release:sanitized.release};
}
export async function publishHederaEvidence(paths:HederaPublicationPaths):Promise<PreparedHederaPublication> {
 const prepared=await prepareHederaPublication(paths);
 if(!process.env.DATABASE_URL)throw Error('Database configuration required for publication.');
 const db=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:15000});await db.connect();
 try{
  await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(732980128)');
  const existing=await db.query("SELECT value FROM platform_hedera_config WHERE id='release' FOR UPDATE");
  let release=prepared.release;
  if(existing.rows[0]&&!paths.replaceRelease){
   const old=publicHederaEvidence({release:existing.rows[0].value}).release;
   if(!old)throw Error('Existing release is invalid; explicit replacement is required.');
   const merged=publicHederaEvidence({release:{...old,...release}}).release;if(!merged)throw Error('Merged evidence is invalid.');release=merged;
  }
  const rows:[string,unknown][]=[['identity-service',prepared.identityService],['release',release]];
  if(prepared.identityBuyer)rows.push(['identity-buyer',prepared.identityBuyer]);
  for(const [id,value] of rows)await db.query('INSERT INTO platform_hedera_config(id,value) VALUES($1,$2::jsonb) ON CONFLICT(id) DO UPDATE SET value=excluded.value,updated_at=now()',[id,JSON.stringify(value)]);
  await db.query('COMMIT');return {...prepared,release};
 }catch(error){await db.query('ROLLBACK');throw error;}finally{await db.end();}
}
async function main(){
 const [mode,manifestFile]=process.argv.slice(2);if((mode!=='verify'&&mode!=='publish')||!manifestFile)throw Error('Use verify or publish with a local manifest.');
 const manifest=z.object({identityServiceFile:z.string(),identityBuyerFile:z.string().optional(),a2aFile:z.string().optional(),htsFile:z.string().optional(),schedulesFile:z.string().optional(),scheduledResultsFile:z.string().optional(),auditFile:z.string().optional(),auditPaymentFile:z.string().optional(),replaceRelease:z.boolean().optional()}).strict().parse(await localJson(manifestFile));
 const resolved={...manifest};for(const key of Object.keys(manifest) as (keyof typeof manifest)[]){const value=manifest[key];if(typeof value==='string')(resolved as Record<string,unknown>)[key]=path.resolve(path.dirname(path.resolve(manifestFile)),value);}
 const proof=mode==='verify'?await prepareHederaPublication(resolved):await publishHederaEvidence(resolved);
 console.log(JSON.stringify({mode,...proof}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(()=>{console.error('Public evidence publication stopped: a source or independently verified proof is unavailable. No payment was initiated.');process.exitCode=1;});
