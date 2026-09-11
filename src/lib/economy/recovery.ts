import {decodeEventLog,parseAbi,type Hex} from 'viem';
import {z} from 'zod';
import pg from 'pg';
import type {User} from '../platform/auth';
import {PlatformError} from '../platform/http';
import {economyClient,economyDeployment} from './chain';
import {serviceRequestSchema,canonicalJsonHash} from './service-contract';
import {readControllerBindings,sameKnownController} from './ownership';
const hex=z.string().regex(/^0x[a-f0-9]{64}$/),atomic=z.string().max(78).regex(/^[1-9]\d*$/);
const transferAbi=parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)']);
const token='0x3600000000000000000000000000000000000000';
const fail=(code:string,message:string,status=409)=>new PlatformError(status,code,message);
type Receipt={status:string;transactionHash:string;logs:readonly {address:string;logIndex:number|null;topics:readonly Hex[];data:Hex}[]};
export function verifyRefundTransfer(receipt:Receipt,input:{transactionHash:string;logIndex:number;seller:string;payer:string;amountAtomic:string}){
 if(receipt.status!=='success'||receipt.transactionHash.toLowerCase()!==input.transactionHash)throw fail('INVALID_REFUND','Refund transaction did not succeed.');
 const log=receipt.logs.find(l=>l.logIndex===input.logIndex&&l.address.toLowerCase()===token);
 if(!log)throw fail('INVALID_REFUND','Canonical USDC refund transfer is absent.');
 try{const decoded=decodeEventLog({abi:transferAbi,topics:log.topics as [Hex,...Hex[]],data:log.data});if(decoded.args.from.toLowerCase()!==input.seller.toLowerCase()||decoded.args.to.toLowerCase()!==input.payer.toLowerCase()||decoded.args.value!==BigInt(input.amountAtomic))throw Error();}
 catch{throw fail('INVALID_REFUND','Refund payer, recipient or amount differs from this order.');}return input.amountAtomic;
}
export async function recoveryDatabase<T>(work:(db:pg.Client)=>Promise<T>):Promise<T>{
 if(!process.env.DATABASE_URL)throw fail('DATABASE_REQUIRED','Database is unavailable.',503);const db=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000,query_timeout:20000});await db.connect();try{return await work(db);}finally{await db.end();}
}
export async function retireService(db:pg.Client,user:User,serviceHash:string,value:unknown){
 const hash=hex.parse(serviceHash),{reason}=z.object({reason:z.string().trim().min(1).max(1000)}).strict().parse(value);
 const service=(await db.query('SELECT user_id,definition FROM economy_services WHERE service_hash=$1',[hash])).rows[0];
 if(!service||service.user_id!==user.id||service.definition.seller!==user.address.toLowerCase())throw fail('SERVICE_NOT_FOUND','Owned service not found.',404);
 await db.query('INSERT INTO economy_service_retirements(service_hash,user_id,reason) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[hash,user.id,reason]);return {serviceHash:hash,retired:true,paidDeliveryAvailable:true};
}
export async function recoveryAction(db:pg.Client,user:User,orderId:string,value:unknown,client=economyClient()){
 const id=hex.parse(orderId),action=z.discriminatedUnion('action',[
  z.object({action:z.literal('dispute'),reason:z.string().trim().min(1).max(2000)}).strict(),
  z.object({action:z.literal('refund'),transactionHash:hex,logIndex:z.number().int().nonnegative(),amountAtomic:atomic}).strict(),
  z.object({action:z.literal('review'),outputHash:hex,verdict:z.enum(['passed','failed']),evidenceReference:z.string().url().max(1000).refine(s=>s.startsWith('https://')),evidenceHash:hex}).strict(),
 ]).parse(value);
 await db.query('BEGIN');try{
  const row=(await db.query('SELECT o.*,u.address AS owner_address FROM economy_orders o JOIN platform_users u ON u.id=o.user_id WHERE order_id=$1 FOR UPDATE OF o',[id])).rows[0];
  if(!row)throw fail('ORDER_NOT_FOUND','Order not found.',404);
  const request=serviceRequestSchema.parse(row.request),seller=String(row.definition.seller).toLowerCase(),address=user.address.toLowerCase();
  if(action.action==='dispute'){
   if(row.user_id!==user.id)throw fail('ORDER_NOT_FOUND','Owned order not found.',404);
   await db.query('INSERT INTO economy_disputes(order_id,user_id,reason) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[id,user.id,action.reason]);
  }else if(action.action==='refund'){
   if(address!==seller)throw fail('SELLER_REQUIRED','Only the seller can attribute its refund transfer.',403);
   const existing=(await db.query('SELECT order_id,amount_atomic FROM economy_refunds WHERE chain_id=5042002 AND transaction_hash=$1 AND log_index=$2',[action.transactionHash,action.logIndex])).rows[0];
   if(existing){if(existing.order_id!==id||String(existing.amount_atomic)!==action.amountAtomic)throw fail('REFUND_REUSED','Transfer already belongs to another refund.');await db.query('COMMIT');return {orderId:id,action:'refund',replayed:true};}
   const [chainId,receipt,finalized,paid]=await Promise.all([client.getChainId(),client.getTransactionReceipt({hash:action.transactionHash as Hex}),client.getBlock({blockTag:'finalized'}),client.getTransactionReceipt({hash:request.settlement.transactionHash})]);
   if(chainId!==economyDeployment()!.chainId||receipt.blockNumber>finalized.number||(receipt.blockNumber<paid.blockNumber||(receipt.blockNumber===paid.blockNumber&&receipt.transactionIndex<=paid.transactionIndex)))throw fail('INVALID_REFUND','Refund must finalize after the original payment.');
   const canonical=await client.getBlock({blockNumber:receipt.blockNumber});if(!receipt.blockHash||canonical.hash!==receipt.blockHash)throw fail('INVALID_REFUND','Refund block is not canonical.');
   verifyRefundTransfer(receipt,{...action,seller,payer:request.payer});
   const total=(await db.query('SELECT COALESCE(sum(amount_atomic),0)::text AS amount FROM economy_refunds WHERE order_id=$1',[id])).rows[0].amount;
   if(BigInt(total)+BigInt(action.amountAtomic)>BigInt(request.amountAtomic))throw fail('REFUND_EXCEEDS_PAYMENT','Refund allocation exceeds the original principal.');
   await db.query('INSERT INTO economy_refunds(chain_id,transaction_hash,log_index,order_id,seller,payer,amount_atomic) VALUES(5042002,$1,$2,$3,$4,$5,$6)',[action.transactionHash,action.logIndex,id,seller,request.payer,action.amountAtomic]);
  }else{
   const reviewers=(process.env.ECONOMY_REVIEW_SIGNERS||'').toLowerCase().split(',').map(s=>s.trim()).filter(Boolean);
   if(!reviewers.includes(address)||[seller,request.payer,row.owner_address.toLowerCase()].includes(address))throw fail('INDEPENDENT_REVIEWER_REQUIRED','An explicitly trusted reviewer independent of this order is required.',403);
   if(await client.getChainId()!==economyDeployment()!.chainId)throw fail('WRONG_CHAIN','Review ownership must be read from the configured chain.');
   const finalized=await client.getBlock({blockTag:'finalized'});const bindings=await readControllerBindings(client,economyDeployment()!,[address,seller,request.payer,row.owner_address],finalized.number);
   if([seller,request.payer,row.owner_address].some(a=>sameKnownController(a,address,bindings)))throw fail('INDEPENDENT_REVIEWER_REQUIRED','Reviewer shares a known controller with this order.',403);
   if(row.state!=='fulfilled'||row.output_hash!==action.outputHash||canonicalJsonHash(row.output)!==action.outputHash)throw fail('DELIVERY_REQUIRED','Review must bind the actual delivered output.');
   const existing=(await db.query('SELECT * FROM economy_reviews WHERE order_id=$1 AND reviewer=$2',[id,address])).rows[0];
   if(existing){if(existing.output_hash!==action.outputHash||existing.verdict!==action.verdict||existing.evidence_hash!==action.evidenceHash||existing.evidence_reference!==action.evidenceReference)throw fail('REVIEW_IMMUTABLE','Existing review cannot be changed.');}
   else await db.query('INSERT INTO economy_reviews(order_id,reviewer,output_hash,verdict,evidence_reference,evidence_hash) VALUES($1,$2,$3,$4,$5,$6)',[id,address,action.outputHash,action.verdict,action.evidenceReference,action.evidenceHash]);
  }
  await db.query('COMMIT');return {orderId:id,action:action.action,recorded:true};
 }catch(error){await db.query('ROLLBACK');if((error as {code?:string}).code==='23505')throw fail('REFUND_REUSED','Transfer has already been attributed.');throw error;}
}
export async function getRecovery(db:pg.Client,user:User,orderId:string){
 const id=hex.parse(orderId),row=(await db.query('SELECT o.user_id,o.definition FROM economy_orders o WHERE order_id=$1',[id])).rows[0];
 if(!row||(row.user_id!==user.id&&row.definition.seller!==user.address.toLowerCase()))throw fail('ORDER_NOT_FOUND','Order not found.',404);
 const disputes=await db.query('SELECT reason,created_at FROM economy_disputes WHERE order_id=$1',[id]);const refunds=await db.query('SELECT transaction_hash,log_index,amount_atomic::text,created_at FROM economy_refunds WHERE order_id=$1',[id]);const reviews=await db.query('SELECT reviewer,output_hash,verdict,evidence_reference,evidence_hash,created_at FROM economy_reviews WHERE order_id=$1',[id]);
 return {orderId:id,canDispute:row.user_id===user.id,canRefund:row.definition.seller===user.address.toLowerCase(),disputes:disputes.rows,refunds:refunds.rows,reviews:reviews.rows,refundPolicy:'Seller-funded voluntary refunds. Original settlement is not escrow.'};
}
