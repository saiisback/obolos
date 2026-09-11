import {createHash,timingSafeEqual,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {sql} from '../platform/db';
import {PlatformError,appOrigin} from '../platform/http';
import {economyClient,economyDeployment} from './chain';
import {canonicalJsonHash,serviceRequestSchema,validateServiceDefinition,validateServiceRequest,validateSchemaValue,verifyServiceSettlement,type ServiceDefinition} from './service-contract';
import {resourceCategories,type ResourceCategory} from './model';
import {providerSchemas,providerUnits} from './provider-work';

export const referenceSeller='0xd2137e6d65165400641aff0e34781d09a0215858';
const failure=(status:number,code:string,message:string)=>new PlatformError(status,code,message);
export function assertProviderAuthorization(header:string|null,secret=process.env.ECONOMY_PROVIDER_TOKEN){
 if(!secret||secret.length<32||!header?.startsWith('Bearer ')||!timingSafeEqual(createHash('sha256').update(header.slice(7)).digest(),createHash('sha256').update(secret).digest()))throw failure(401,'PROVIDER_AUTH_REQUIRED','Provider authentication required.');
}
export function validateProviderBinding(service:ServiceDefinition,category:ResourceCategory,origin:string,seller=referenceSeller){
 const d=economyDeployment();if(!d||service.chainId!==d.chainId||service.settlementAddress!==d.settlement||service.ledgerAddress!==d.ledger||service.seller!==seller||service.category!==category||service.quantity!=='1'||service.unit!==providerUnits[category]||service.endpoint!==`${origin}/api/economy/reference/${category}`||canonicalJsonHash(service.inputSchema)!==canonicalJsonHash(providerSchemas[category].input)||canonicalJsonHash(service.outputSchema)!==canonicalJsonHash(providerSchemas[category].output))throw failure(409,'PROVIDER_TERMS_MISMATCH','These immutable terms do not match this provider.');
}
export async function queuePaidProviderWork(categoryValue:string,value:unknown){
 const category=z.enum(resourceCategories).parse(categoryValue),request=serviceRequestSchema.parse(value),db=sql();
 const rows=await db`SELECT definition FROM economy_services WHERE service_hash=${request.serviceHash}`;
 if(!rows[0])throw failure(404,'SERVICE_NOT_FOUND','Publish the registered service first.');
 const service=validateServiceDefinition(rows[0].definition);validateProviderBinding(service,category,appOrigin());validateServiceRequest(service,request);
 const client=economyClient(),[chainId,receipt,finalized]=await Promise.all([client.getChainId(),client.getTransactionReceipt({hash:request.settlement.transactionHash}),client.getBlock({blockTag:'finalized'})]);
 if(finalized.number===null||receipt.blockNumber>finalized.number)throw failure(409,'PAYMENT_PENDING','Wait for payment finality.');
 verifyServiceSettlement(service,request,{chainId,status:receipt.status,transactionHash:receipt.transactionHash,logs:receipt.logs});
 const block=await client.getBlock({blockNumber:receipt.blockNumber});if(block.hash!==receipt.blockHash)throw failure(409,'PAYMENT_PENDING','Payment block is not canonical.');
 const hash=canonicalJsonHash(request);
 await db`INSERT INTO economy_provider_jobs(order_id,request_hash,request,definition,paid_at) VALUES(${request.orderId},${hash},${JSON.stringify(request)}::jsonb,${JSON.stringify(service)}::jsonb,${block.timestamp.toString()}) ON CONFLICT(order_id) DO NOTHING`;
 const [job]=await db`SELECT * FROM economy_provider_jobs WHERE order_id=${request.orderId}`;
 if(job.request_hash!==hash)throw failure(409,'ORDER_CONFLICT','This paid order has different immutable input.');
 if(job.state!=='completed')throw failure(503,job.state==='failed'?'PROVIDER_JOB_FAILED':'PROVIDER_JOB_PENDING',job.state==='failed'?'Provider execution requires reconciliation. Payment is preserved.':'Paid work is queued. Retry delivery with the same order; do not pay again.');
 validateSchemaValue(job.output,service.outputSchema);
 if(canonicalJsonHash(job.output)!==job.output_hash)throw failure(503,'INVALID_OUTPUT','Stored output failed its integrity check.');
 return {protocol:'obolos.service.v1',orderId:request.orderId,serviceHash:service.serviceHash,inputHash:request.inputHash,outputHash:job.output_hash,output:job.output};
}
const hex=z.string().regex(/^0x[a-f0-9]{64}$/);
export async function providerWorkAction(value:unknown){
 const action=z.discriminatedUnion('action',[
	  z.object({action:z.literal('claim'),claimId:z.uuid(),model:z.string().regex(/^gpt-5-nano(?:-[\d-]+)?$/)}).strict(),
	  z.object({action:z.literal('retry-read'),orderId:hex,token:z.uuid()}).strict(),
	  z.object({action:z.literal('complete'),orderId:hex,token:z.uuid(),output:z.unknown(),attestationHash:hex}).strict(),
  z.object({action:z.literal('failed'),orderId:hex,token:z.uuid()}).strict(),
 ]).parse(value),db=sql();
 if(action.action==='claim'){
  await db`INSERT INTO economy_provider_health(seller,model) VALUES(${referenceSeller},${action.model}) ON CONFLICT(seller) DO UPDATE SET model=EXCLUDED.model,checked_at=now()`;
  const existing=await db`SELECT order_id,request,definition,paid_at,lease_started_at,claim_token FROM economy_provider_jobs WHERE claim_token=${action.claimId}::uuid`;
  if(existing[0])return {job:existing[0]};
  const token=action.claimId;const [job]=await db`UPDATE economy_provider_jobs SET state='running',claim_token=${token}::uuid,lease_started_at=floor(extract(epoch from now()))::bigint,updated_at=now() WHERE order_id=(SELECT order_id FROM economy_provider_jobs WHERE state='queued' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) AND state='queued' RETURNING order_id,request,definition,paid_at,lease_started_at,claim_token`;
  return {job:job??null};
 }
	 const [job]=await db`SELECT * FROM economy_provider_jobs WHERE order_id=${action.orderId} AND claim_token=${action.token}::uuid`;
	 if(!job)throw failure(404,'JOB_NOT_FOUND','Claimed provider job not found.');
	 if(action.action==='retry-read'){
	  const service=validateServiceDefinition(job.definition),request=validateServiceRequest(service,job.request);
	  const allowed=['data','compute','verification'].includes(service.category)&&['failed','running'].includes(job.state)&&job.output===null&&job.output_hash===null&&job.attestation_hash===null&&job.request_hash===canonicalJsonHash(request);
	  if(!allowed)throw failure(409,'READ_RETRY_NOT_ALLOWED','Only failed read-only work without output or attestation can be retried.');
	  const [updated]=await db`UPDATE economy_provider_jobs SET state='running',updated_at=now() WHERE order_id=${action.orderId} AND claim_token=${action.token}::uuid AND state IN ('failed','running') AND output IS NULL AND output_hash IS NULL AND attestation_hash IS NULL AND definition->>'category' IN ('data','compute','verification') RETURNING state`;
	  if(!updated)throw failure(409,'JOB_STATE_CONFLICT','Provider job changed during retry reconciliation.');return {state:'running'};
	 }
	 if(action.action==='failed'){
  await db`UPDATE economy_provider_jobs SET state='failed',updated_at=now() WHERE order_id=${action.orderId} AND claim_token=${action.token}::uuid AND state='running'`;return {state:job.state==='completed'?'completed':'failed'};
 }
 const service=validateServiceDefinition(job.definition);validateSchemaValue(action.output,service.outputSchema);const outputHash=canonicalJsonHash(action.output);
 if(job.state==='completed'){if(job.output_hash!==outputHash||job.attestation_hash!==action.attestationHash)throw failure(409,'OUTPUT_CONFLICT','Completed provider output is immutable.');return {state:'completed'};}
 if(service.category==='storage'&&((action.output as {expiresAt:string}).expiresAt!==new Date((Number(job.lease_started_at)+3600)*1000).toISOString()||Number(job.lease_started_at)+3600<=Math.floor(Date.now()/1000)))throw failure(409,'STORAGE_EXPIRED','Storage lease is expired or differs from its real service start.');
 // A seller signature/transaction is required before the queue marks real delivery complete.
 const client=economyClient(),d=economyDeployment()!;
 const [receipt,finalized,chainId]=await Promise.all([client.getTransactionReceipt({hash:action.attestationHash as `0x${string}`}),client.getBlock({blockTag:'finalized'}),client.getChainId()]);
 const {decodeEventLog}=await import('viem');const {ledgerAbi}=await import('./chain');
 if(chainId!==d.chainId||receipt.status!=='success'||receipt.blockNumber>finalized.number||!receipt.logs.some(log=>{try{const e=decodeEventLog({abi:ledgerAbi,data:log.data,topics:log.topics});return log.address.toLowerCase()===d.ledger&&e.eventName==='DeliveryAttested'&&e.args.orderId===action.orderId&&e.args.seller.toLowerCase()===service.seller&&e.args.outputHash===outputHash;}catch{return false;}}))throw failure(409,'ATTESTATION_REQUIRED','A finalized seller delivery event for this output is required.');
 const canonical=await client.getBlock({blockNumber:receipt.blockNumber});if(!receipt.blockHash||canonical.hash!==receipt.blockHash)throw failure(409,'ATTESTATION_REQUIRED','Delivery attestation block is not canonical.');
 const updated=await db`UPDATE economy_provider_jobs SET state='completed',output=${JSON.stringify(action.output)}::jsonb,output_hash=${outputHash},attestation_hash=${action.attestationHash},updated_at=now() WHERE order_id=${action.orderId} AND claim_token=${action.token}::uuid AND state='running' RETURNING order_id`;
 if(!updated[0])throw failure(409,'JOB_STATE_CONFLICT','Provider job requires reconciliation.');return {state:'completed'};
}
