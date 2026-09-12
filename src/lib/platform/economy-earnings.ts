import type {User} from './auth';
import {sql} from './db';
import {economyDeployment} from '../economy/chain';
import {resourceCategories} from '../economy/model';

export type EconomySellerEarnings={
 indexedAt:string|null;
 totals:{grossAtomic:string;sellerAtomic:string;reserveAtomic:string;reviewAtomic:string;rebateAtomic:string;orderCount:number}|null;
 orders:{orderId:string;serviceHash:string;title:string;category:string;quantity:string;unit:string;amountAtomic:string;sellerAtomic:string;reserveAtomic:string;reviewAtomic:string;rebateAtomic:string;transactionHash:string;settledAt:string}[];
};
/** Gross seller payments before refunds; never inferred from a listing price or a runner status. */
export async function listEconomySellerEarnings(user:User):Promise<EconomySellerEarnings>{
 const deployment=economyDeployment();if(!deployment)return {indexedAt:null,totals:null,orders:[]};
 const db=sql(),index=await db`SELECT block_number,updated_at FROM economy_index_state WHERE settlement_address=${deployment.settlement}`;
 if(!index[0])return {indexedAt:null,totals:null,orders:[]};
 const rows=await db`WITH matched AS (
  SELECT DISTINCT ON (p.payload->>'orderId') p.payload AS paid,s.payload AS split,p.transaction_hash,p.block_timestamp,
   profile.profile->>'title' AS title,service.definition->>'unit' AS unit
  FROM economy_chain_events p
  JOIN economy_chain_events s ON s.chain_id=p.chain_id AND s.transaction_hash=p.transaction_hash
   AND s.payload->>'orderId'=p.payload->>'orderId' AND s.event_name='OrderSettled' AND s.contract_address=${deployment.settlement}
  LEFT JOIN economy_services service ON service.service_hash=p.payload->>'serviceHash'
  LEFT JOIN economy_service_profiles profile ON profile.service_hash=service.service_hash
  WHERE p.chain_id=${deployment.chainId} AND p.contract_address=${deployment.ledger} AND p.event_name='OrderPaid'
   AND lower(p.payload->>'seller')=${user.address.toLowerCase()} AND p.block_number<=${String(index[0].block_number)}::numeric
   AND s.block_number=p.block_number AND s.block_hash=p.block_hash
   AND p.payload->>'amount'=s.payload->>'amount'
   AND p.payload->>'amount' ~ '^[0-9]{1,78}$' AND s.payload->>'sellerAmount' ~ '^[0-9]{1,78}$'
   AND s.payload->>'reserveAmount' ~ '^[0-9]{1,78}$' AND s.payload->>'reviewAmount' ~ '^[0-9]{1,78}$'
   AND s.payload->>'rebateAmount' ~ '^[0-9]{1,78}$'
   AND (s.payload->>'sellerAmount')::numeric+(s.payload->>'reserveAmount')::numeric+(s.payload->>'reviewAmount')::numeric+(s.payload->>'rebateAmount')::numeric=(p.payload->>'amount')::numeric
  ORDER BY p.payload->>'orderId',p.block_number DESC,p.log_index DESC
 ) SELECT *,SUM((paid->>'amount')::numeric) OVER()::text AS gross_total,
  SUM((split->>'sellerAmount')::numeric) OVER()::text AS seller_total,
  SUM((split->>'reserveAmount')::numeric) OVER()::text AS reserve_total,
  SUM((split->>'reviewAmount')::numeric) OVER()::text AS review_total,
  SUM((split->>'rebateAmount')::numeric) OVER()::text AS rebate_total,
  COUNT(*) OVER()::text AS order_count
 FROM matched ORDER BY block_timestamp DESC,transaction_hash DESC LIMIT 100`;
 const totals=rows[0]?{grossAtomic:String(rows[0].gross_total),sellerAtomic:String(rows[0].seller_total),reserveAtomic:String(rows[0].reserve_total),reviewAtomic:String(rows[0].review_total),rebateAtomic:String(rows[0].rebate_total),orderCount:Number(rows[0].order_count)}:{grossAtomic:'0',sellerAtomic:'0',reserveAtomic:'0',reviewAtomic:'0',rebateAtomic:'0',orderCount:0};
 return {indexedAt:new Date(String(index[0].updated_at)).toISOString(),totals,orders:rows.map(row=>{
  const paid=row.paid as Record<string,string>,split=row.split as Record<string,string>,category=resourceCategories[Number(paid.category)]??'service';
  return {orderId:paid.orderId,serviceHash:paid.serviceHash,title:typeof row.title==='string'?row.title:`${category[0].toUpperCase()+category.slice(1)} service`,category,quantity:paid.quantity,unit:typeof row.unit==='string'?row.unit:'order',amountAtomic:paid.amount,sellerAtomic:split.sellerAmount,reserveAtomic:split.reserveAmount,reviewAtomic:split.reviewAmount,rebateAtomic:split.rebateAmount,transactionHash:String(row.transaction_hash),settledAt:new Date(Number(row.block_timestamp)*1000).toISOString()};
 })};
}
