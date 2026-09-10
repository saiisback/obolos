import type {Run} from '../contracts';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { verificationServiceSchema } from '../market/contracts';
import { getVerificationService } from './marketplace';
import { verifyHostedSettlement } from './settlement-proof';
import { sql } from './db';
import { verifyAudit } from '../policy';
import { appOrigin, PlatformError } from './http';
import { requireOwnedAgent, runnerRequired, validateRunInput } from './agents';
import { mandateMessage, repositoryScope, validateSignedMandate, type MandateFields, type SignedMandate } from './execution-contracts';

type Row=Record<string, unknown>;
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
export function publicJob(row:Row) { return {id:row.id,agentId:row.agent_id,repos:row.repos,status:row.status,createdAt:row.created_at,updatedAt:row.updated_at,mandateId:row.mandate_id,runnerId:row.runner_id,result:row.result??null,receiptVerification:row.receipt_verification??(row.result?'runner-confirmed':null),receiptProofs:row.receipt_proofs??null}; }
function publicRunner(row:Row|undefined) {return row?{id:row.id,agentId:row.agent_id,prefix:row.prefix,createdAt:row.created_at,lastSeenAt:row.last_seen_at,revokedAt:row.revoked_at,online:!row.revoked_at&&!!row.last_seen_at&&Date.parse(String(row.last_seen_at))>Date.now()-120000}:null;}
function publicMandate(row:Row|undefined) {return row?{...(row.fields as MandateFields),message:row.message,signature:row.signature,approvedAt:row.approved_at,revokedAt:row.revoked_at,reservedRuns:row.reserved_runs,createdAt:row.created_at}:null;}
function signed(row:Row):SignedMandate {return {...(row.fields as MandateFields),message:row.message as string,signature:row.signature as string};}

export async function getRunner(userId:string,agentId:string) {
 await requireOwnedAgent(userId,agentId);
 const rows=await sql()`SELECT id,agent_id,prefix,created_at,last_seen_at,revoked_at FROM platform_runners WHERE agent_id=${agentId} ORDER BY created_at DESC LIMIT 1`;
 return {runner:publicRunner(rows[0])};
}
export async function pairRunner(userId:string,agentId:string) {
 await requireOwnedAgent(userId,agentId);
 const db=sql(),token=`ob_runner_${randomBytes(32).toString('base64url')}`,id=randomUUID();
 const r=await db.transaction([
  db`SELECT id FROM platform_agents WHERE id=${agentId} AND user_id=${userId} FOR UPDATE`,
  db`UPDATE platform_runners SET revoked_at=now() WHERE agent_id=${agentId} AND revoked_at IS NULL`,
  db`INSERT INTO platform_runners(id,agent_id,token_hash,prefix) VALUES(${id},${agentId},${hash(token)},${token.slice(0,18)}) RETURNING id,agent_id,prefix,created_at,last_seen_at,revoked_at`,
 ],{isolationLevel:'ReadCommitted'});
 return {runner:publicRunner(r[2][0]),token};
}
export async function revokeRunner(userId:string,agentId:string) {
 await requireOwnedAgent(userId,agentId);const db=sql();
 await db.transaction([db`SELECT id FROM platform_agents WHERE id=${agentId} FOR UPDATE`,db`UPDATE platform_runners SET revoked_at=now() WHERE agent_id=${agentId} AND revoked_at IS NULL`,db`UPDATE platform_agents SET status='setup_required' WHERE id=${agentId}`],{isolationLevel:'ReadCommitted'});
}
export async function getMandate(userId:string,agentId:string) {
 await requireOwnedAgent(userId,agentId);
 const rows=await sql()`SELECT * FROM platform_mandates WHERE agent_id=${agentId} AND revoked_at IS NULL ORDER BY (approved_at IS NOT NULL) DESC,created_at DESC LIMIT 1`;
 return {mandate:publicMandate(rows[0])};
}
export async function prepareMandate(user:{id:string;address:string},agentId:string,body:unknown) {
 await requireOwnedAgent(user.id,agentId);
 const input=z.object({phase:z.literal('prepare'),repos:repositoryScope,maxDataUnitPriceAtomic:z.number().int().min(1).max(100000000),maxRuns:z.number().int().min(1).max(10),expiresAt:z.iso.datetime(),verificationServiceId:z.uuid().optional()}).strict().parse(body);
 const expiry=Date.parse(input.expiresAt);if(expiry<=Date.now()||expiry>Date.now()+86400000)throw new PlatformError(400,'INVALID_EXPIRY','Mandates must expire within the next 24 hours.');
 const db=sql(),agents=await db`SELECT data_budget_atomic,verification_budget_atomic FROM platform_agents WHERE id=${agentId} AND user_id=${user.id}`;
 if(agents[0] && (!agents[0].data_budget_atomic || !agents[0].verification_budget_atomic))throw new PlatformError(400,'INVALID_MANDATE','Create an agent with positive HBAR and USDC budgets before authorizing execution.');
 if(!agents[0])throw new PlatformError(404,'AGENT_NOT_FOUND','Agent not found.');
 const selectedService=input.verificationServiceId?await getVerificationService(input.verificationServiceId):undefined;
 if(selectedService&&selectedService.priceAtomic>Number(agents[0].verification_budget_atomic))throw new PlatformError(400,'VERIFICATION_BUDGET','The selected service exceeds this agent’s USDC allowance.');
 const fields:MandateFields={id:randomUUID(),agentId,owner:user.address,origin:appOrigin(),repos:input.repos,allowedProviders:['repo-standard','repo-economy'],dataBudgetAtomic:agents[0].data_budget_atomic,verificationBudgetAtomic:agents[0].verification_budget_atomic,maxDataUnitPriceAtomic:input.maxDataUnitPriceAtomic,maxRuns:input.maxRuns,expiresAt:input.expiresAt,...(selectedService?{verificationService:selectedService}:{})};
 const message=mandateMessage(fields);
 await db.transaction([db`SELECT id FROM platform_agents WHERE id=${agentId} FOR UPDATE`,db`UPDATE platform_mandates SET revoked_at=now() WHERE agent_id=${agentId} AND approved_at IS NULL AND revoked_at IS NULL`,db`INSERT INTO platform_mandates(id,agent_id,fields,message,max_runs,expires_at) VALUES(${fields.id},${agentId},${JSON.stringify(fields)}::jsonb,${message},${fields.maxRuns},${fields.expiresAt})`],{isolationLevel:'ReadCommitted'});
 return {mandate:fields,message};
}
export async function approveMandate(user:{id:string;address:string},agentId:string,body:unknown) {
 await requireOwnedAgent(user.id,agentId);
 const input=z.object({phase:z.literal('approve'),mandateId:z.uuid(),signature:z.string().regex(/^0x[0-9a-fA-F]{130}$/)}).strict().parse(body);
 const db=sql(),rows=await db`SELECT * FROM platform_mandates WHERE id=${input.mandateId} AND agent_id=${agentId} AND approved_at IS NULL AND revoked_at IS NULL`;
 if(!rows[0]||!await validateSignedMandate({...signed(rows[0]),signature:input.signature},{owner:user.address,agentId,origin:appOrigin()}))throw new PlatformError(400,'INVALID_MANDATE','The mandate is expired, consumed or the wallet signature is invalid.');
 const r=await db.transaction([
  db`SELECT id FROM platform_agents WHERE id=${agentId} FOR UPDATE`,
  db`UPDATE platform_mandates SET revoked_at=now() WHERE agent_id=${agentId} AND approved_at IS NOT NULL AND revoked_at IS NULL AND EXISTS(SELECT 1 FROM platform_mandates WHERE id=${input.mandateId} AND signature IS NULL AND revoked_at IS NULL AND expires_at>now())`,
  db`UPDATE platform_mandates SET signature=${input.signature},approved_at=now() WHERE id=${input.mandateId} AND agent_id=${agentId} AND signature IS NULL AND revoked_at IS NULL AND expires_at>now() RETURNING *`,
 ],{isolationLevel:'ReadCommitted'});
 if(!r[2][0])throw new PlatformError(409,'MANDATE_CONSUMED','This mandate is no longer available for approval.');
 return {mandate:publicMandate(r[2][0])};
}
export async function revokeMandate(userId:string,agentId:string) {
 await requireOwnedAgent(userId,agentId);const db=sql();
 await db.transaction([db`SELECT id FROM platform_agents WHERE id=${agentId} FOR UPDATE`,db`UPDATE platform_mandates SET revoked_at=now() WHERE agent_id=${agentId} AND revoked_at IS NULL`,db`UPDATE platform_jobs SET status='blocked',updated_at=now() WHERE agent_id=${agentId} AND status='queued'`,db`UPDATE platform_agents SET status='setup_required' WHERE id=${agentId}`],{isolationLevel:'ReadCommitted'});
}
export async function queueRun(agentId:string,body:unknown,key:string|null) {
 const input=validateRunInput(body,key),db=sql(),jobId=randomUUID(),repos=JSON.stringify(input.repos);
 const results=await db.transaction([
  db`SELECT id FROM platform_agents WHERE id=${agentId} FOR UPDATE`,
  db`WITH inserted AS (
    INSERT INTO platform_jobs(id,agent_id,idempotency_key,status,repos,mandate_id)
    SELECT ${jobId},${agentId},${input.idempotencyKey},'queued',${repos}::jsonb,m.id
    FROM platform_mandates m WHERE m.agent_id=${agentId} AND m.approved_at IS NOT NULL AND m.revoked_at IS NULL AND m.expires_at>now() AND m.reserved_runs<m.max_runs
      AND m.fields->'repos' @> ${repos}::jsonb
      AND EXISTS(SELECT 1 FROM platform_runners WHERE agent_id=${agentId} AND revoked_at IS NULL AND last_seen_at>now()-interval '2 minutes')
    ON CONFLICT(agent_id,idempotency_key) DO NOTHING RETURNING mandate_id
   ) UPDATE platform_mandates SET reserved_runs=reserved_runs+1 WHERE id IN(SELECT mandate_id FROM inserted)`,
  db`SELECT * FROM platform_jobs WHERE agent_id=${agentId} AND idempotency_key=${input.idempotencyKey}`,
 ],{isolationLevel:'ReadCommitted'});
 const job=results[2][0];
 if(job){if(JSON.stringify(job.repos)!==repos)throw new PlatformError(409,'IDEMPOTENCY_CONFLICT','This Idempotency-Key was already used with different repositories.');return {run:publicJob(job),replayed:job.id!==jobId};}
 const runners=await db`SELECT id FROM platform_runners WHERE agent_id=${agentId} AND revoked_at IS NULL AND last_seen_at>now()-interval '2 minutes'`;
 if(!runners[0])runnerRequired();
 throw new PlatformError(409,'MANDATE_REQUIRED','A current signed mandate with matching repositories and an available run allowance is required.');
}
export async function authenticateRunner(authorization:string|null) {
 const token=authorization?.match(/^Bearer (ob_runner_[A-Za-z0-9_-]{43})$/)?.[1];
 if(!token)throw new PlatformError(401,'INVALID_RUNNER','A valid runner credential is required.');
 const rows=await sql()`SELECT id,agent_id FROM platform_runners WHERE token_hash=${hash(token)} AND revoked_at IS NULL`;
 if(!rows[0])throw new PlatformError(401,'INVALID_RUNNER','Runner credential is invalid or revoked.');
 return {id:rows[0].id as string,agentId:rows[0].agent_id as string};
}
export async function claimJob(runner:{id:string;agentId:string}) {
 const db=sql();
 const r=await db.transaction([
  db`SELECT id FROM platform_agents WHERE id=${runner.agentId} FOR UPDATE`,
  db`UPDATE platform_runners SET last_seen_at=now() WHERE id=${runner.id} AND agent_id=${runner.agentId} AND revoked_at IS NULL RETURNING id`,
  db`UPDATE platform_jobs j SET status='blocked',updated_at=now() FROM platform_mandates m WHERE j.agent_id=${runner.agentId} AND j.mandate_id=m.id AND j.status='queued' AND (m.revoked_at IS NOT NULL OR m.expires_at<=now())`,
  db`WITH next_job AS (SELECT j.id FROM platform_jobs j JOIN platform_mandates m ON m.id=j.mandate_id WHERE j.agent_id=${runner.agentId} AND j.status='queued' AND m.revoked_at IS NULL AND m.approved_at IS NOT NULL AND m.expires_at>now() AND EXISTS(SELECT 1 FROM platform_runners WHERE id=${runner.id} AND agent_id=${runner.agentId} AND revoked_at IS NULL) ORDER BY j.created_at,j.id FOR UPDATE OF j SKIP LOCKED LIMIT 1)
   UPDATE platform_jobs SET status='running',runner_id=${runner.id},claimed_at=now(),updated_at=now() WHERE id IN(SELECT id FROM next_job) RETURNING id,agent_id,repos,mandate_id`,
  db`SELECT id,fields,message,signature FROM platform_mandates WHERE agent_id=${runner.agentId}`,
 ],{isolationLevel:'ReadCommitted'});
 if(!r[1][0])throw new PlatformError(401,'INVALID_RUNNER','Runner credential was revoked.');
 const job=r[3][0];if(!job)return {job:null};
 const mandate=r[4].find(m=>m.id===job.mandate_id);
 if(!mandate)throw new PlatformError(409,'MANDATE_REQUIRED','The claimed job mandate is unavailable.');
 return {job:{id:job.id,agentId:job.agent_id,repos:job.repos,mandate:signed(mandate)}};
}

const text=z.string().max(20000),short=z.string().max(1000),atomic=z.number().int().min(0).max(100000000);
const evidenceSchema=z.object({repo:short,description:text,stars:atomic,forks:atomic,openIssues:atomic,pushedAt:short,language:short,license:short,sourceUrl:short,fetchedAt:z.iso.datetime()});
const engineMandateSchema=z.object({dataBudgetAtomic:atomic,verificationBudgetAtomic:atomic,maxDataUnitPriceAtomic:atomic,allowedProviders:z.array(short).max(2),expiresAt:z.iso.datetime(),version:z.number().int().positive(),verificationService:verificationServiceSchema.optional()}).strict();
const resultSchema=z.object({
 id:z.uuid(),mode:z.literal('live'),title:short,repos:repositoryScope,status:z.enum(['completed','failed','awaiting_approval','paused']),stage:z.enum(['mandate','discovery','purchase','report','verification','complete']),createdAt:z.iso.datetime(),updatedAt:z.iso.datetime(),mandate:engineMandateSchema,
 providers:z.array(z.object({id:short,name:short,description:short,network:short,asset:z.enum(['HBAR','USDC']),unit:short,unitPriceAtomic:atomic})).max(20),selectedProvider:short.optional(),dataSpentAtomic:atomic,verificationSpentAtomic:atomic,evidence:z.array(evidenceSchema).max(3),
 receipts:z.array(z.object({id:short,requestId:short,mode:z.literal('live'),network:z.enum(['hedera:testnet','arc:testnet']),asset:z.enum(['HBAR','USDC']),amountAtomic:z.number().int().positive().max(100000000),units:z.number().int().min(1).max(3),provider:short,status:z.literal('settled'),timestamp:z.iso.datetime(),transactionId:short,explorerUrl:short.optional(),orderId:z.uuid().optional(),recipient:z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional()})).max(2),
 events:z.array(z.object({id:short,timestamp:z.iso.datetime(),actor:z.enum(['supervisor','planner','broker','worker','verifier']),kind:z.enum(['info','success','warning','blocked']),title:short,detail:text,previousHash:short,hash:short})).max(100),
 report:z.object({title:short,summary:text,recommendation:text,evidence:z.array(evidenceSchema).max(3),generatedBy:z.literal('model'),createdAt:z.iso.datetime(),checks:z.array(z.object({label:short,passed:z.boolean(),detail:text})).max(50),verified:z.boolean()}).optional(),
 approval:z.object({signerMode:z.enum(['usb','speculos']).optional(),nonce:short,message:text,expiresAt:z.iso.datetime(),proposedMandate:engineMandateSchema,reason:text}).optional(),shockApplied:z.boolean(),error:text.optional(),authorizations:z.array(z.never()).max(0).optional(),
}).strict();

/** Only independently proven settlement can turn a verification-stage stop into
 * a known negative result. Missing delivery or explicit uncertainty stays uncertain. */
export function classifyRunnerStatus(r:Run,proofs?:unknown[]|null) {
 if(r.status==='completed')return 'succeeded';
 if(['awaiting_approval','paused'].includes(r.status))return 'blocked';
 if(/uncertain|pending|reconcil|timeout|unknown|in.flight/i.test(r.error??''))return 'uncertain';
 const confirmedNegative=r.status==='failed'&&r.stage==='verification'&&r.report?.verified===false&&r.report.checks.some(c=>!c.passed)&&
  ['hedera:testnet','arc:testnet'].every(network=>r.receipts.some(receipt=>receipt.network===network&&receipt.status==='settled'&&!!receipt.transactionId)&&proofs?.some(proof=>typeof proof==='object'&&proof!==null&&'network' in proof&&proof.network===network));
 return confirmedNegative?'failed':['purchase','verification'].includes(r.stage)?'uncertain':'failed';
}

export function validateRunnerResult(value:unknown,job:{id:string;repos:string[];mandate:SignedMandate}) {
 const r=resultSchema.parse(value),m=job.mandate;
 const invalid=()=>{throw new PlatformError(400,'INVALID_RESULT','Runner result does not match this job and its signed payment scope.');};
 if(r.id!==job.id||JSON.stringify(r.repos)!==JSON.stringify(job.repos)||r.mandate.version!==1||r.mandate.dataBudgetAtomic!==m.dataBudgetAtomic||r.mandate.verificationBudgetAtomic!==m.verificationBudgetAtomic||r.mandate.maxDataUnitPriceAtomic!==m.maxDataUnitPriceAtomic||r.mandate.expiresAt!==m.expiresAt||JSON.stringify(r.mandate.allowedProviders)!==JSON.stringify(m.allowedProviders)||r.shockApplied)invalid();
 if(JSON.stringify(r.mandate.verificationService)!==JSON.stringify(m.verificationService?verificationServiceSchema.parse(m.verificationService):undefined))invalid();
 if(!verifyAudit(r.events))invalid();
 if(r.selectedProvider&&!m.allowedProviders.includes(r.selectedProvider))invalid();
 if(r.evidence.some(e=>!job.repos.includes(e.repo)||e.sourceUrl!==`https://api.github.com/repos/${e.repo}`)||new Set(r.evidence.map(e=>e.repo)).size!==r.evidence.length)invalid();
 let data=0,verification=0;const requests=new Set<string>();
 for(const receipt of r.receipts){
  if(requests.has(receipt.requestId))invalid();requests.add(receipt.requestId);
  if(receipt.network==='hedera:testnet'){
   if(receipt.asset!=='HBAR'||receipt.requestId!==`${job.id}:data`||!m.allowedProviders.includes(receipt.provider)||receipt.provider!==r.selectedProvider||receipt.units!==job.repos.length||receipt.amountAtomic%receipt.units!==0||receipt.amountAtomic>m.maxDataUnitPriceAtomic*job.repos.length||!/^0\.0\.\d+@\d+\.\d+$/.test(receipt.transactionId))invalid();
   data+=receipt.amountAtomic;receipt.explorerUrl=`https://hashscan.io/testnet/transaction/${encodeURIComponent(receipt.transactionId)}`;
  }else{
   if(receipt.amountAtomic!==(m.verificationService?.priceAtomic??50000)||receipt.asset!=='USDC'||receipt.requestId!==`${job.id}:verify`||receipt.provider!=='arc-verifier'||receipt.units!==1||!/^0x[0-9a-fA-F]{64}$/.test(receipt.transactionId))invalid();
   if(m.verificationService&&(!receipt.orderId||receipt.recipient?.toLowerCase()!==m.verificationService.recipient.toLowerCase()))invalid();
   receipt.transactionId=receipt.transactionId.toLowerCase();
   verification+=receipt.amountAtomic;receipt.explorerUrl=`https://testnet.arcscan.app/tx/${receipt.transactionId}`;
  }
 }
 if(requests.has(`${job.id}:data`) ? r.evidence.length!==job.repos.length : r.evidence.length!==0)invalid();
 if(verification>0&&(!requests.has(`${job.id}:data`)||!r.report))invalid();
 if(data!==r.dataSpentAtomic||verification!==r.verificationSpentAtomic||data>m.dataBudgetAtomic||verification>m.verificationBudgetAtomic)invalid();
 if(r.report&&(JSON.stringify(r.report.evidence)!==JSON.stringify(r.evidence)||!requests.has(`${job.id}:data`)))invalid();
 if(r.status==='completed'&&(r.stage!=='complete'||r.receipts.length!==2||!r.report?.verified||!r.report.checks.length||r.report.checks.some(c=>!c.passed)||r.evidence.length!==job.repos.length))invalid();
 const status=classifyRunnerStatus(r);
 return {result:r,status};
}
export async function saveRunnerResult(runner:{id:string;agentId:string},jobId:string,body:unknown) {
 const input=z.object({result:z.unknown()}).strict().parse(body),db=sql();
 if(!z.uuid().safeParse(jobId).success)throw new PlatformError(404,'RUN_NOT_FOUND','Run not found.');
 const rows=await db`SELECT j.*,m.fields,m.message,m.signature FROM platform_jobs j JOIN platform_mandates m ON m.id=j.mandate_id WHERE j.id=${jobId} AND j.agent_id=${runner.agentId} AND j.runner_id=${runner.id}`;
 if(!rows[0])throw new PlatformError(404,'RUN_NOT_FOUND','Run not found.');
 const job=rows[0],validated=validateRunnerResult(input.result,{id:jobId,repos:job.repos,mandate:signed(job)}),serialized=JSON.stringify(validated.result);
 const proofs=await verifyHostedSettlement({id:jobId,created_at:job.created_at},validated.result, signed(job));
 const acceptedStatus=classifyRunnerStatus(validated.result,proofs);
 const claims=proofs?validated.result.receipts.map(receipt=>db`INSERT INTO platform_chain_receipts(network,transaction_id,job_id)
  SELECT ${receipt.network},${receipt.transactionId!},${jobId} FROM platform_jobs j
  WHERE j.id=${jobId} AND j.agent_id=${runner.agentId} AND j.runner_id=${runner.id} AND j.status='running' AND j.result IS NULL
  AND EXISTS(SELECT 1 FROM platform_runners WHERE id=${runner.id} AND agent_id=${runner.agentId} AND revoked_at IS NULL)`):[];
 const hashes=validated.result.receipts.map(receipt=>receipt.transactionId!);
 const verification=proofs&&proofs.length?'chain-confirmed':null;
 let r;
 try {r=await db.transaction([
  db`SELECT id FROM platform_agents WHERE id=${runner.agentId} FOR UPDATE`,
  ...claims,
  db`UPDATE platform_jobs SET receipt_verification=${verification},receipt_proofs=${proofs?JSON.stringify(proofs):null}::jsonb,result=${serialized}::jsonb,status=${acceptedStatus},updated_at=now() WHERE id=${jobId} AND agent_id=${runner.agentId} AND runner_id=${runner.id} AND status='running' AND result IS NULL AND NOT EXISTS(SELECT 1 FROM platform_chain_receipts WHERE transaction_id=ANY(${hashes}::text[]) AND job_id<>${jobId}) AND EXISTS(SELECT 1 FROM platform_runners WHERE id=${runner.id} AND agent_id=${runner.agentId} AND revoked_at IS NULL) RETURNING *`,
  db`SELECT * FROM platform_jobs WHERE id=${jobId} AND agent_id=${runner.agentId} AND runner_id=${runner.id}`,
 ],{isolationLevel:'ReadCommitted'});}catch(error){
  if((error as {code?:string}).code==='23505')throw new PlatformError(409,'PAYMENT_REUSED','A payment is already assigned to another result; all new claims were rolled back.');
  throw error;
 }
 const stored=r.at(-1)![0];
 if(!stored?.result)throw new PlatformError(409,'RESULT_CONFLICT','The runner was revoked or the job no longer accepts a result.');
 // Repeating the exact upload is safe; a different terminal outcome is never overwritten.
 if(JSON.stringify(stored.result)!==serialized&&JSON.stringify(resultSchema.parse(stored.result))!==JSON.stringify(resultSchema.parse(validated.result)))throw new PlatformError(409,'RESULT_CONFLICT','A different result is already recorded for this job.');
 return {run:publicJob(stored)};
}

export async function authorizeRunnerJob(runner:{id:string;agentId:string},jobId:string) {
 if(!z.uuid().safeParse(jobId).success)throw new PlatformError(404,'RUN_NOT_FOUND','Run not found.');
 const rows=await sql()`SELECT j.id FROM platform_jobs j
  JOIN platform_runners r ON r.id=j.runner_id JOIN platform_mandates m ON m.id=j.mandate_id
  WHERE j.id=${jobId} AND j.agent_id=${runner.agentId} AND j.runner_id=${runner.id} AND j.status='running'
   AND r.agent_id=j.agent_id AND m.agent_id=j.agent_id AND r.revoked_at IS NULL AND m.revoked_at IS NULL AND m.approved_at IS NOT NULL AND m.expires_at>clock_timestamp()
   AND (m.fields->'verificationService' IS NULL OR EXISTS(SELECT 1 FROM platform_market_services s WHERE s.id::text=m.fields->'verificationService'->>'id' AND s.active=true AND s.revision=(m.fields->'verificationService'->>'revision')::integer AND s.price_atomic=(m.fields->'verificationService'->>'priceAtomic')::integer AND s.recipient=lower(m.fields->'verificationService'->>'recipient')))`;
 if(!rows[0])throw new PlatformError(403,'EXECUTION_NOT_AUTHORIZED','This job is no longer authorized. Stop execution and reconcile any work already started.');
 return {authorized:true};
}
