import type pg from 'pg';
import type {EconomyDeployment} from './chain';
import {sameKnownController} from './ownership';

type Context={order_id:string;owner_address:string;payer:string;seller:string;payment_transaction_hash:string;delivered_output_hash:string|null};
type Review=Context&{reviewer:string;output_hash:string;verdict:'passed'|'failed';evidence_reference:string;evidence_hash:string;created_at:string};
type Dispute=Context&{created_at:string};
type Refund=Context&{chain_id:number;transaction_hash:string;log_index:number;amount_atomic:string;created_at:string};
export type RecoveryEvidence={reviews:Review[];disputes:Dispute[];refunds:Refund[]};
export type RecoveryOrder={orderId:string;seller:string;payer:string;owner:string;transactionHash:string;outputHash:string|null;delivered:boolean;buyerAcknowledged:boolean;sameOwner:boolean};
export function reviewTrust(){return [...new Set((process.env.ECONOMY_REVIEW_SIGNERS??'').toLowerCase().split(',').map(s=>s.trim()).filter(s=>/^0x[0-9a-f]{40}$/.test(s)))].sort();}
/** Recovery tables bind immutable orders. Join exact deployment fields; never use order ID alone across deployments. */
export async function readRecoveryEvidence(db:pg.Client,deployment:EconomyDeployment):Promise<RecoveryEvidence>{
 const context="o.order_id,u.address AS owner_address,o.request->>'payer' AS payer,o.definition->>'seller' AS seller,o.transaction_hash AS payment_transaction_hash,o.output_hash AS delivered_output_hash";
 const join="JOIN economy_orders o ON o.order_id=r.order_id JOIN platform_users u ON u.id=o.user_id WHERE o.request->'settlement'->>'chainId'=$1 AND lower(o.request->'settlement'->>'address')=$2 AND lower(o.request->'settlement'->>'ledgerAddress')=$3";
 const params=[String(deployment.chainId),deployment.settlement.toLowerCase(),deployment.ledger.toLowerCase()];
 const reviews=(await db.query<Review>(`SELECT ${context},r.reviewer,r.output_hash,r.verdict,r.evidence_reference,r.evidence_hash,r.created_at FROM economy_reviews r ${join} ORDER BY r.order_id,r.reviewer`,params)).rows;
 const disputes=(await db.query<Dispute>(`SELECT ${context},r.created_at FROM economy_disputes r ${join} ORDER BY r.order_id`,params)).rows;
 const refunds=(await db.query<Refund>(`SELECT ${context},r.chain_id,r.transaction_hash,r.log_index,r.amount_atomic::text,r.created_at FROM economy_refunds r ${join} AND r.chain_id=$4 AND lower(r.seller)=lower(o.definition->>'seller') AND lower(r.payer)=lower(o.request->>'payer') ORDER BY r.chain_id,r.transaction_hash,r.log_index`,[...params,deployment.chainId])).rows;
 return {reviews,disputes,refunds};
}
export function projectRecovery(orders:RecoveryOrder[],evidence:RecoveryEvidence,bindings:ReadonlyMap<string,string>,trustedReviewers:string[]){
 const byOrder=new Map(orders.map(o=>[o.orderId,o])),trust=new Set(trustedReviewers.map(a=>a.toLowerCase()));
 const matches=(record:Context)=>{const o=byOrder.get(record.order_id);return o&&o.transactionHash===record.payment_transaction_hash&&o.payer.toLowerCase()===record.payer.toLowerCase()&&o.seller.toLowerCase()===record.seller.toLowerCase()?o:undefined;};
 const reviewGroups=new Map<string,Review[]>();
 const reviews=evidence.reviews.flatMap(row=>{
  const o=matches(row);if(!o)return [];
  const eligible=!o.sameOwner&&o.delivered&&o.buyerAcknowledged&&o.outputHash===row.output_hash&&o.outputHash===row.delivered_output_hash&&trust.has(row.reviewer.toLowerCase())&&![o.seller,o.payer,o.owner,row.owner_address].some(p=>sameKnownController(p,row.reviewer,bindings));
  if(eligible){const group=reviewGroups.get(o.orderId)??[];group.push(row);reviewGroups.set(o.orderId,group);}
  return [{orderId:row.order_id,reviewer:row.reviewer,outputHash:row.output_hash,verdict:row.verdict,evidenceReference:row.evidence_reference,evidenceHash:row.evidence_hash,createdAt:row.created_at,countsTowardReview:eligible}];
 });
 const disputes=evidence.disputes.flatMap(row=>matches(row)?[{orderId:row.order_id,createdAt:row.created_at}]:[]);
 const refunds=evidence.refunds.flatMap(row=>matches(row)?[{orderId:row.order_id,chainId:row.chain_id,transactionHash:row.transaction_hash,logIndex:row.log_index,amountAtomic:row.amount_atomic,createdAt:row.created_at}]:[]);
 const disputesByOrder=new Map<string,number>(),refundsByOrder=new Map<string,{count:number;amount:bigint}>();
 for(const row of disputes)disputesByOrder.set(row.orderId,(disputesByOrder.get(row.orderId)??0)+1);
 for(const row of refunds){const totals=refundsByOrder.get(row.orderId)??{count:0,amount:0n};totals.count++;totals.amount+=BigInt(row.amountAtomic);refundsByOrder.set(row.orderId,totals);}
 const sellers=new Map<string,RecoveryOrder[]>();for(const order of orders){const seller=order.seller.toLowerCase(),group=sellers.get(seller)??[];group.push(order);sellers.set(seller,group);}
 const reputation=[...sellers].map(([seller,all])=>{
  const eligible=all.filter(o=>!o.sameOwner);let verifiedReviews=0,reviewedOrders=0,passedReviewOrders=0,conflictingReviewOrders=0,disputeCount=0,refundCount=0,refundedAtomic=0n;
  for(const order of all){
   disputeCount+=disputesByOrder.get(order.orderId)??0;const refunds=refundsByOrder.get(order.orderId);refundCount+=refunds?.count??0;refundedAtomic+=refunds?.amount??0n;
   const rows=reviewGroups.get(order.orderId)??[];if(!rows.length)continue;
   const unique:Review[]=[];for(const row of rows)if(!unique.some(other=>sameKnownController(other.reviewer,row.reviewer,bindings)))unique.push(row);
   verifiedReviews+=unique.length;reviewedOrders++;
   if(new Set(rows.map(r=>r.verdict)).size!==1)conflictingReviewOrders++;else if(rows[0].verdict==='passed')passedReviewOrders++;
  }
  const qualityScore=eligible.length>0&&reviewedOrders===eligible.length&&conflictingReviewOrders===0?BigInt(passedReviewOrders)*10000n/BigInt(eligible.length):null;
  return {seller,verifiedReviews,reviewedOrders,reviewEligibleOrders:eligible.length,passedReviewOrders,conflictingReviewOrders,qualityScore,qualityMethodology:'trusted-review-pass-rate-bps-v1',disputeCount,refundCount,refundedAtomic};
 });
 return {reputation,recovery:{reviews,disputes,refunds}};
}
