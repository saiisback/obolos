import {mkdir,open,rename} from 'node:fs/promises';
import {resolve} from 'node:path';
import {z} from 'zod';
import type {Receipt,VerificationPurchase} from '../contracts';
import {validateSignedMandate} from '../platform/execution-contracts';
import type {BrokerEnv} from './ledger';
import {purchaseCircleVerification} from './circle';
import {reportDigest} from '../market/verifier';

function origin(env:BrokerEnv){
 const url=new URL(env.MARKETPLACE_URL??'');
 if(url.pathname!=='/'||url.search||url.hash||url.username||url.password||(url.protocol!=='https:'&&!(url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname))))throw Error('Pin an HTTPS marketplace origin.');
 return url.origin;
}
/** A signed runner mandate alone cannot choose a new broker owner or HTTP host. */
export async function assertMarketAuthorization(input:VerificationPurchase,env:BrokerEnv){
 const m=input.market?.mandate,base=origin(env);
 if(!m?.verificationService||!env.MARKETPLACE_OWNER_ADDRESS||!z.uuid().safeParse(input.runId).success||input.requestId!==`${input.runId}:verify`||input.mandateExpiresAt!==m.expiresAt||input.maxAmountAtomic!==m.verificationService.priceAtomic||input.maxAmountAtomic>m.verificationBudgetAtomic||!/^ob_runner_[A-Za-z0-9_-]{43}$/.test(input.market?.runnerToken??''))throw Error('Marketplace capability differs from the authorized job.');
 if(!await validateSignedMandate(m,{owner:env.MARKETPLACE_OWNER_ADDRESS,origin:base,agentId:m.agentId})||input.report.evidence.some(e=>!m.repos.includes(e.repo)))throw Error('Marketplace owner signature or scope is invalid.');
 return m.verificationService;
}
async function checkpoint(env:BrokerEnv,runId:string,value:unknown){
 const dir=resolve(env.BROKER_DATA_DIR||'data/broker','market-orders');await mkdir(dir,{recursive:true,mode:0o700});
 const path=resolve(dir,`${runId}.json`),temp=`${path}.${process.pid}.tmp`,file=await open(temp,'w',0o600);
 try{await file.writeFile(JSON.stringify(value));await file.sync();}finally{await file.close();}
 await rename(temp,path);const directory=await open(dir,'r');try{await directory.sync();}finally{await directory.close();}
}
const orderSchema=z.object({id:z.uuid(),jobId:z.uuid(),serviceId:z.uuid(),revision:z.number().int().positive(),payer:z.string(),recipient:z.string(),amountAtomic:z.number().int().positive(),reportDigest:z.string(),expiresAt:z.string(),status:z.enum(['quoted','fulfilled']),transactionHash:z.string().optional(),result:z.object({checks:z.array(z.object({label:z.string().max(200),passed:z.boolean(),detail:z.string().max(1000)})).min(1).max(50)}).optional()});
export async function purchaseMarketplaceVerification(input:VerificationPurchase & {dataTransactionId:string},env:BrokerEnv,deps:{fetcher?:typeof fetch;pay?:typeof purchaseCircleVerification}={}){
 const service=await assertMarketAuthorization(input,env),base=origin(env),fetcher=deps.fetcher??fetch,pay=deps.pay??purchaseCircleVerification;
 const payer=env.CIRCLE_WALLET_ADDRESS;
 if(!payer||!/^0x[0-9a-fA-F]{40}$/.test(payer))throw Error('The Circle payer must be configured.');
 const authorization=`Bearer ${input.market!.runnerToken}`;
 async function post(path:string,body:unknown){
  const response=await fetcher(`${base}${path}`,{method:'POST',headers:{Authorization:authorization,'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(90000)});
  if(!response.ok)throw Error(`Marketplace request failed (${response.status}); reconcile the saved order.`);
  return orderSchema.parse((await response.json()).order);
 }
 const order=await post('/api/market/orders',{jobId:input.runId,payer,report:input.report,dataTransactionId:input.dataTransactionId});
 if(order.jobId!==input.runId||order.serviceId!==service.id||order.revision!==service.revision||order.payer.toLowerCase()!==payer.toLowerCase()||order.recipient.toLowerCase()!==service.recipient.toLowerCase()||order.amountAtomic!==service.priceAtomic||order.reportDigest!==reportDigest(input.report)||order.status!=='quoted'||Date.parse(order.expiresAt)<=Date.now()||Date.parse(order.expiresAt)>Date.parse(input.mandateExpiresAt))throw Error('Order terms changed or order already fulfilled; no transfer submitted.');
 const state:{order:typeof order;stage:string;receipt?:Receipt;submittedHash?:string}={order,stage:'quoted'};
 await checkpoint(env,input.runId,state);
 await assertMarketAuthorization(input,env);
 // Circle's immutable job/request idempotency namespace is unchanged. Only the
 // locally authorized v2 service can replace the legacy fixed recipient.
 state.stage='submitting';await checkpoint(env,input.runId,state);
 const receipt=await pay({runId:input.runId,requestId:input.requestId,amountAtomic:service.priceAtomic,mandateExpiresAt:order.expiresAt,onSubmitted:async hash=>{state.submittedHash=hash;state.stage='submitted';await checkpoint(env,input.runId,state);}}, {...env,ARC_VERIFIER_ADDRESS:service.recipient});
 state.receipt=receipt;state.stage='paid';await checkpoint(env,input.runId,state);
 // A delivery retry repeats only chain-proof verification, never the transfer.
 let result:Awaited<ReturnType<typeof post>>|undefined;
 for(let attempt=0;attempt<3;attempt++){
  try{result=await post(`/api/market/orders/${order.id}/confirm`,{transactionHash:receipt.transactionId});break;}
  catch{if(attempt===2)throw Error('Payment settled; seller result delivery is pending. Reconcile the saved order without paying again.');}
 }
 if(!result?.result||result.status!=='fulfilled'||result.id!==order.id||result.transactionHash?.toLowerCase()!==receipt.transactionId?.toLowerCase()||result.reportDigest!==order.reportDigest)throw Error('Paid service result does not match this order.');
 state.order=result;state.stage='fulfilled';await checkpoint(env,input.runId,state);
 return {receipt:{...receipt,orderId:order.id,recipient:service.recipient},checks:result.result.checks};
}
