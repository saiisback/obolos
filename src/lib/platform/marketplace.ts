import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {sql} from './db';
import {appOrigin,PlatformError} from './http';
import type {User} from './auth';
import {validateSignedMandate,type SignedMandate} from './execution-contracts';
import {addressSchema,marketReportSchema,type MarketService,type MarketServiceRevision,type VerificationService,type MarketOrder} from '../market/contracts';
import {reportDigest,verifyMetricReport} from '../market/verifier';
import {verifyMarketTransfer} from '../market/chain';
import {requestRemoteVerification,validateRemoteVerifierUrl} from '../market/remote-verifier';
import type {Report} from '../contracts';
type Row=Record<string,unknown>;
type Runner={id:string;agentId:string};
type OrderScope={runner?:Runner;userId?:string};
const editable=z.object({name:z.string().trim().min(1).max(80),description:z.string().trim().max(1000),priceAtomic:z.number().int().min(1000).max(1000000)}).strict();
function service(row:Row):MarketService {return {id:String(row.id),revision:Number(row.revision),name:String(row.name),description:String(row.description),recipient:String(row.recipient),priceAtomic:Number(row.price_atomic),endpoint:`${appOrigin()}/api/market/services/${row.id}`,active:Boolean(row.active),execution:row.execution==='external-repo-verifier'?'external-repo-verifier':'hosted-metric-verifier',...(row.provider_endpoint?{providerEndpoint:String(row.provider_endpoint)}:{}),createdAt:new Date(String(row.created_at)).toISOString(),...(row.agent_id?{agentId:String(row.agent_id),agentName:String(row.agent_name)}:{})};}
function hasPaymentProof(row:Row):boolean {
 const proof=row.proof as Record<string,unknown>|null;
 return Boolean(row.transaction_hash&&proof&&proof.transactionHash===row.transaction_hash&&proof.chainId===5042002&&['paid','fulfilled'].includes(String(row.status)));
}
export function publicMarketOrder(row:Row):MarketOrder {return {id:String(row.id),jobId:String(row.job_id),serviceId:String(row.service_id),revision:Number(row.revision),payer:String(row.payer),recipient:String(row.recipient),amountAtomic:Number(row.amount_atomic),reportDigest:String(row.report_digest),createdAt:new Date(String(row.created_at)).toISOString(),expiresAt:new Date(String(row.expires_at)).toISOString(),status:row.status as MarketOrder['status'],...(row.transaction_hash?{transactionHash:String(row.transaction_hash),chainConfirmed:hasPaymentProof(row)}:{}),...(row.result?{result:row.result as MarketOrder['result']}:{}),...(row.delivery_error?{deliveryError:String(row.delivery_error)}:{})};}
export async function getPublicMarketReceipt(id:string) {
 z.uuid().parse(id);const rows=await sql()`SELECT * FROM platform_market_orders WHERE id=${id} AND status IN ('paid','fulfilled')`;
 const row=rows[0];if(!row||!hasPaymentProof(row))throw new PlatformError(404,'RECEIPT_NOT_FOUND','A chain-confirmed payment receipt is not available for this order.');
 const proof=row.proof as Record<string,unknown>;
 return {protocol:'obolos.verifier.v1',id:String(row.id),serviceId:String(row.service_id),revision:Number(row.revision),recipient:String(row.recipient),amountAtomic:Number(row.amount_atomic),transactionHash:String(row.transaction_hash),reportDigest:String(row.report_digest),status:String(row.status),chainConfirmed:true,chainId:5042002,token:String(proof.token),timestamp:String(proof.timestamp),proofDigest:createHash('sha256').update(JSON.stringify(proof)).digest('hex')};
}
export async function listMarketServices(userId?:string) {const db=sql();const rows=userId?await db`SELECT * FROM platform_market_services WHERE user_id=${userId} ORDER BY created_at DESC LIMIT 100`:await db`SELECT * FROM platform_market_services WHERE active=true ORDER BY created_at DESC LIMIT 100`;return rows.map(service);}
export async function getVerificationService(id:string):Promise<VerificationService> {z.uuid().parse(id);const rows=await sql()`SELECT * FROM platform_market_services WHERE id=${id} AND active=true`;if(!rows[0])throw new PlatformError(404,'SERVICE_NOT_FOUND','This verification service is unavailable.');const listing=service(rows[0]);return {id:listing.id,revision:listing.revision,name:listing.name,recipient:listing.recipient,priceAtomic:listing.priceAtomic,endpoint:listing.endpoint,...(listing.execution==='external-repo-verifier'?{execution:listing.execution,providerEndpoint:listing.providerEndpoint!}:{})};}
export async function createMarketService(user:User,input:unknown) {
 const v=editable.extend({agentId:z.uuid().optional(),execution:z.enum(['hosted-metric-verifier','external-repo-verifier']).default('hosted-metric-verifier'),providerEndpoint:z.string().max(2048).optional()}).superRefine((v,ctx)=>{if((v.execution==='external-repo-verifier')!==Boolean(v.providerEndpoint))ctx.addIssue({code:'custom',message:'External services require a public provider endpoint; hosted services do not accept one.'});}).parse(input),db=sql();
 const providerEndpoint=v.providerEndpoint?validateRemoteVerifierUrl(v.providerEndpoint).href:null;
 const rows=v.agentId
  ?await db`INSERT INTO platform_market_services(id,user_id,name,description,recipient,price_atomic,agent_id,agent_name,execution,provider_endpoint)
    SELECT ${randomUUID()},${user.id},${v.name},${v.description},${user.address.toLowerCase()},${v.priceAtomic},a.id,a.name,${v.execution},${providerEndpoint}
    FROM platform_agents a WHERE a.id=${v.agentId} AND a.user_id=${user.id} RETURNING *`
  :await db`INSERT INTO platform_market_services(id,user_id,name,description,recipient,price_atomic,execution,provider_endpoint) VALUES(${randomUUID()},${user.id},${v.name},${v.description},${user.address.toLowerCase()},${v.priceAtomic},${v.execution},${providerEndpoint}) RETURNING *`;
 if(!rows[0])throw new PlatformError(404,'AGENT_NOT_FOUND','Agent not found.');
 return service(rows[0]);
}
export async function marketServiceHistory(id:string):Promise<MarketServiceRevision[]> {
 z.uuid().parse(id);const db=sql();
 const rows=await db`SELECT revision,name,price_atomic,active,recorded_at,source,execution,provider_endpoint FROM platform_market_service_revisions WHERE service_id=${id} ORDER BY revision DESC LIMIT 100`;
 if(!rows[0])throw new PlatformError(404,'SERVICE_NOT_FOUND','Service not found.');
 return rows.map(row=>({revision:Number(row.revision),name:String(row.name),priceAtomic:Number(row.price_atomic),active:Boolean(row.active),recordedAt:new Date(String(row.recorded_at)).toISOString(),source:row.source as MarketServiceRevision['source'],...(row.execution==='external-repo-verifier'?{execution:'external-repo-verifier' as const,providerEndpoint:String(row.provider_endpoint)}:{})}));
}
export async function updateMarketService(user:User,id:string,input:unknown) {
 z.uuid().parse(id);const v=editable.partial().extend({active:z.boolean().optional(),providerEndpoint:z.string().min(1).max(2048).optional()}).strict().refine(v=>Object.keys(v).length>0).parse(input);
 const providerEndpoint=v.providerEndpoint?validateRemoteVerifierUrl(v.providerEndpoint).href:null;
 const rows=await sql()`UPDATE platform_market_services SET name=COALESCE(${v.name??null},name),description=COALESCE(${v.description??null},description),price_atomic=COALESCE(${v.priceAtomic??null},price_atomic),active=COALESCE(${v.active??null},active),provider_endpoint=COALESCE(${providerEndpoint},provider_endpoint),revision=revision+1 WHERE id=${id} AND user_id=${user.id} AND (${providerEndpoint}::text IS NULL OR execution='external-repo-verifier') RETURNING *`;
 if(!rows[0])throw new PlatformError(404,'SERVICE_NOT_FOUND','Service not found or this execution type does not accept a provider endpoint.');return service(rows[0]);
}
export async function marketEarnings(userId:string) {const db=sql();const [rows,total]=await Promise.all([db`SELECT o.* FROM platform_market_orders o JOIN platform_market_services s ON s.id=o.service_id WHERE s.user_id=${userId} AND o.status IN ('paid','fulfilled') ORDER BY o.created_at DESC LIMIT 100`,db`SELECT COALESCE(SUM(o.amount_atomic),0)::text AS total FROM platform_market_orders o JOIN platform_market_services s ON s.id=o.service_id WHERE s.user_id=${userId} AND o.status IN ('paid','fulfilled')`]);return {orders:rows.map(publicMarketOrder),totalAtomic:String(total[0].total)};}
export async function getMarketOrder(id:string,scope:OrderScope) {z.uuid().parse(id);const db=sql();const rows=scope.runner?await db`SELECT o.* FROM platform_market_orders o JOIN platform_jobs j ON j.id=o.job_id WHERE o.id=${id} AND o.runner_id=${scope.runner.id} AND j.agent_id=${scope.runner.agentId} AND EXISTS(SELECT 1 FROM platform_runners WHERE id=${scope.runner.id} AND revoked_at IS NULL)`:await db`SELECT o.* FROM platform_market_orders o JOIN platform_jobs j ON j.id=o.job_id JOIN platform_agents a ON a.id=j.agent_id WHERE o.id=${id} AND a.user_id=${scope.userId??''}`;if(!rows[0])throw new PlatformError(404,'ORDER_NOT_FOUND','Order not found.');return rows[0];}
export async function createMarketOrder(runner:Runner,body:unknown) {
 const input=z.object({jobId:z.uuid(),payer:addressSchema,dataTransactionId:z.string().regex(/^0\.0\.\d+@\d+\.\d+$/),report:marketReportSchema}).strict().parse(body),db=sql(),digest=reportDigest(input.report);
 const old=await db`SELECT * FROM platform_market_orders WHERE job_id=${input.jobId} AND runner_id=${runner.id}`;
 if(old[0]){await getMarketOrder(String(old[0].id),{runner});if(old[0].report_digest!==digest||old[0].payer!==input.payer.toLowerCase()||old[0].data_transaction_id!==input.dataTransactionId)throw new PlatformError(409,'ORDER_CONFLICT','This job already has an order for a different report or payer.');return publicMarketOrder(old[0]);}
 const rows=await db`SELECT j.repos,m.fields,m.message,m.signature,u.address FROM platform_jobs j JOIN platform_mandates m ON m.id=j.mandate_id JOIN platform_agents a ON a.id=j.agent_id JOIN platform_users u ON u.id=a.user_id WHERE j.id=${input.jobId} AND j.agent_id=${runner.agentId} AND j.runner_id=${runner.id} AND j.status='running' AND m.approved_at IS NOT NULL AND m.revoked_at IS NULL AND m.expires_at>now() AND EXISTS(SELECT 1 FROM platform_runners WHERE id=${runner.id} AND revoked_at IS NULL)`;
 const job=rows[0];if(!job)throw new PlatformError(409,'JOB_UNAVAILABLE','An assigned running job with an active signed mandate is required.');
 const mandate={...(job.fields as SignedMandate),message:job.message,signature:job.signature} as SignedMandate;
 if(!await validateSignedMandate(mandate,{owner:String(job.address),agentId:runner.agentId,origin:appOrigin()})||!mandate.verificationService)throw new PlatformError(409,'MANDATE_REQUIRED','An active signed marketplace mandate is required.');
 const selected=await getVerificationService(mandate.verificationService.id);
 if(JSON.stringify(selected)!==JSON.stringify(mandate.verificationService)&&Object.keys(selected).some(k=>selected[k as keyof VerificationService]!==mandate.verificationService![k as keyof VerificationService]))throw new PlatformError(409,'SERVICE_CHANGED','Service changed; sign a new mandate before buying.');
 if(selected.priceAtomic>mandate.verificationBudgetAtomic||JSON.stringify(input.report.evidence.map(e=>e.repo))!==JSON.stringify(job.repos))throw new PlatformError(400,'INVALID_REPORT','Report scope or service price exceeds the signed job.');
 const purchased=await db`SELECT * FROM platform_service_payments WHERE state='settled' AND (transaction_id=${input.dataTransactionId} OR settlement->>'transaction'=${input.dataTransactionId})`;
 const paid=purchased[0];
 if(purchased.length!==1||!paid.evidence||!mandate.allowedProviders.includes(String(paid.provider_id))||JSON.stringify(paid.repos)!==JSON.stringify(job.repos)||reportDigest({...input.report,evidence:paid.evidence as Report['evidence']})!==digest||Number(paid.amount_atomic)>mandate.dataBudgetAtomic||Number(paid.amount_atomic)>mandate.maxDataUnitPriceAtomic*input.report.evidence.length)throw new PlatformError(409,'PAID_EVIDENCE_REQUIRED','This report must match an existing settled evidence purchase within its signed scope.');
 const expiresAt=new Date(Math.min(Date.now()+15*60000,Date.parse(mandate.expiresAt))).toISOString();
 let inserted:Row[];
 try {inserted=await db`INSERT INTO platform_market_orders(id,job_id,service_id,revision,runner_id,payer,recipient,amount_atomic,report_digest,report,service_snapshot,expires_at,data_transaction_id,data_source_id)
 SELECT ${randomUUID()},j.id,s.id,s.revision,${runner.id},${input.payer.toLowerCase()},s.recipient,s.price_atomic,${digest},${JSON.stringify(input.report)}::jsonb,${JSON.stringify(selected)}::jsonb,${expiresAt},${input.dataTransactionId},${String(paid.transaction_id)} FROM platform_jobs j JOIN platform_mandates m ON m.id=j.mandate_id JOIN platform_market_services s ON s.id=${selected.id} WHERE j.id=${input.jobId} AND j.runner_id=${runner.id} AND j.status='running' AND m.revoked_at IS NULL AND m.expires_at>now() AND s.active=true AND s.revision=${selected.revision} AND EXISTS(SELECT 1 FROM platform_runners WHERE id=${runner.id} AND revoked_at IS NULL) ON CONFLICT(job_id) DO NOTHING RETURNING *`;}catch(error){if((error as {code?:string}).code==='23505')throw new PlatformError(409,'EVIDENCE_REUSED','This evidence purchase already belongs to another verification order.');throw error;}
 if(!inserted[0]){const replay=await db`SELECT * FROM platform_market_orders WHERE job_id=${input.jobId} AND runner_id=${runner.id}`;if(replay[0]&&replay[0].report_digest===digest&&replay[0].payer===input.payer.toLowerCase()&&replay[0].data_transaction_id===input.dataTransactionId)return publicMarketOrder(replay[0]);throw new PlatformError(409,'ORDER_CONFLICT','The order or service changed.');}
 return publicMarketOrder(inserted[0]);
}
export async function confirmMarketOrder(runner:Runner,id:string,body:unknown) {
 const {transactionHash}=z.object({transactionHash:z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform(v=>v.toLowerCase())}).strict().parse(body);
 let row=await getMarketOrder(id,{runner});const db=sql();
 if(row.transaction_hash&&row.transaction_hash!==transactionHash)throw new PlatformError(409,'ORDER_CONFLICT','Order already paid by a different transaction.');
 if(row.status==='fulfilled')return publicMarketOrder(row);
 if(row.status==='quoted') {
  const proof=await verifyMarketTransfer(transactionHash as `0x${string}`,publicMarketOrder(row));
  try {
   const paid=await db`UPDATE platform_market_orders SET transaction_hash=${transactionHash},proof=${JSON.stringify(proof)}::jsonb,status='paid' WHERE id=${id} AND status='quoted' AND EXISTS(SELECT 1 FROM platform_runners WHERE id=${runner.id} AND revoked_at IS NULL) RETURNING *`;
   row=paid[0]??await getMarketOrder(id,{runner});
  }catch(error){if((error as {code?:string}).code==='23505')throw new PlatformError(409,'PAYMENT_REUSED','This transaction already belongs to another order.');throw error;}
 }
 if(row.transaction_hash!==transactionHash)throw new PlatformError(409,'ORDER_CONFLICT','Order changed while confirming payment.');
 if(row.status==='fulfilled')return publicMarketOrder(row);
 return deliverPaidMarketOrder(row,{runner});
}
export async function retryMarketDelivery(userId:string,id:string) {
 const row=await getMarketOrder(id,{userId});
 if(row.status==='fulfilled')return publicMarketOrder(row);
 if(row.status!=='paid'||!hasPaymentProof(row))throw new PlatformError(409,'PAID_ORDER_REQUIRED','Only an already paid order can retry delivery. No payment was initiated.');
 return deliverPaidMarketOrder(row,{userId});
}
async function deliverPaidMarketOrder(row:Row,scope:OrderScope) {
 const db=sql(),id=String(row.id),transactionHash=String(row.transaction_hash);
 // Each delivery uses the immutable paid snapshot and a fenced lease. A process
 // crash may cause a later retry; providers must deduplicate the stable order key.
 const token=randomUUID();
 const claimed=await db`UPDATE platform_market_orders SET delivery_token=${token},delivery_lease_until=now()+interval '90 seconds',delivery_attempts=delivery_attempts+1,delivery_error=NULL WHERE id=${id} AND status='paid' AND (delivery_lease_until IS NULL OR delivery_lease_until<now()) AND ((${scope.runner?.id??null}::uuid IS NOT NULL AND EXISTS(SELECT 1 FROM platform_runners WHERE id=${scope.runner?.id??null} AND revoked_at IS NULL)) OR (${scope.userId??null}::uuid IS NOT NULL AND EXISTS(SELECT 1 FROM platform_jobs j JOIN platform_agents a ON a.id=j.agent_id WHERE j.id=job_id AND a.user_id=${scope.userId??null}))) RETURNING *`;
 if(!claimed[0]){
  const current=await getMarketOrder(id,scope);
  if(current.status==='fulfilled'&&current.transaction_hash===transactionHash)return publicMarketOrder(current);
  throw new PlatformError(409,'DELIVERY_PENDING','Payment is confirmed and delivery is already in progress. Retry confirmation for this same order and transaction; do not pay again.');
 }
 row=claimed[0];
 try {
  const snapshot=row.service_snapshot as VerificationService;
  const result=snapshot&&'execution' in snapshot
   ?await requestRemoteVerification({endpoint:snapshot.providerEndpoint,report:row.report as Report,idempotencyKey:`obolos-order:${id}`,order:{id,serviceId:String(row.service_id),revision:Number(row.revision),recipient:String(row.recipient),amountAtomic:Number(row.amount_atomic),transactionHash,reportDigest:String(row.report_digest),receiptUrl:`${appOrigin()}/api/market/orders/${id}/receipt`}})
   :verifyMetricReport(row.report as Report,new Date(Number((row.proof as {timestamp:string}).timestamp)*1000));
  const completed=await db`UPDATE platform_market_orders SET result=${JSON.stringify(result)}::jsonb,status='fulfilled',delivery_token=NULL,delivery_lease_until=NULL,delivery_error=NULL WHERE id=${id} AND status='paid' AND delivery_token=${token} RETURNING *`;
  if(completed[0])return publicMarketOrder(completed[0]);
 }catch{
  const message='Payment confirmed, but provider delivery did not complete. Retry confirmation with this order and transaction to request delivery again; do not pay again.';
  await db`UPDATE platform_market_orders SET delivery_error=${message},delivery_token=NULL,delivery_lease_until=NULL WHERE id=${id} AND status='paid' AND delivery_token=${token}`;
  throw new PlatformError(502,'DELIVERY_FAILED',message);
 }
 const current=await getMarketOrder(id,scope);
 if(current.status==='fulfilled'&&current.transaction_hash===transactionHash)return publicMarketOrder(current);
 throw new PlatformError(409,'DELIVERY_PENDING','Payment remains confirmed. Another delivery attempt owns this order; do not pay again.');
}
