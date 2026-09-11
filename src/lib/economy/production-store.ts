import type pg from 'pg';
import type {User} from '../platform/auth';
import {PlatformError} from '../platform/http';
import type {EconomyDeployment} from './chain';
import {authenticateProductionAccount} from './production-account';
const fail=(message:string,status=422):never=>{throw new PlatformError(status,'INVALID_PRODUCTION_ACCOUNT',message);};
export async function recordProductionAccount(db:pg.Client,user:User,input:unknown,deployment:EconomyDeployment){
 let record;try{record=await authenticateProductionAccount(input,deployment);}catch(e){return fail(e instanceof Error?e.message:'Invalid accounting statement.');}
 const p=record.payload;if(p.seller!==user.address.toLowerCase())fail('Sign in as the producing seller.',403);
 await db.query('BEGIN');try{
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',['production-account:'+deployment.settlement]);
  const old=(await db.query('SELECT evidence_hash FROM economy_production_accounts WHERE order_id=$1',[p.orderId])).rows[0];
  if(old){if(old.evidence_hash!==record.evidenceHash)fail('This production account is immutable; a different statement already exists.',409);await db.query('COMMIT');return {evidenceHash:record.evidenceHash,replayed:true};}
  const state=(await db.query('SELECT snapshot FROM economy_index_state WHERE settlement_address=$1',[deployment.settlement])).rows[0]?.snapshot;
  const chainOrders=state?.orders as {orderId:string;seller:string;outputHash:string|null;transactionHash:string;delivered:boolean;buyerAcknowledged:boolean;timestamp:number;deliveredAt?:number|null;acknowledgedAt?:number|null;deliveryBlockNumber?:string|null;deliveryLogIndex?:number|null;acknowledgmentBlockNumber?:string|null;acknowledgmentLogIndex?:number|null}[]|undefined;
  const output=(await db.query('SELECT * FROM economy_orders WHERE order_id=$1',[p.orderId])).rows[0];
  const chainOutput=chainOrders?.find(o=>o.orderId===p.orderId);
  if(!chainOutput)return fail('Index the completed output sale before recording its production account.');
  if(!output||output.definition.seller!==p.seller||output.request.settlement.address!==p.settlement||output.request.settlement.ledgerAddress!==p.ledger||output.transaction_hash!==p.transactionHash||output.output_hash!==p.outputHash||chainOutput.outputHash!==p.outputHash||chainOutput.seller.toLowerCase()!==p.seller||!chainOutput.delivered||!chainOutput.buyerAcknowledged||chainOutput.transactionHash!==p.transactionHash)fail('The output sale must match indexed payment, seller delivery and buyer acknowledgment.');
  if(chainOutput.acknowledgedAt==null||p.issuedAt<chainOutput.acknowledgedAt)fail('Accounting must be signed after output acknowledgment.');
  for(const item of p.inputs){
   const row=(await db.query('SELECT * FROM economy_orders WHERE order_id=$1',[item.orderId])).rows[0],chainInput=chainOrders?.find(o=>o.orderId===item.orderId);
   if(!row||row.user_id!==user.id||row.request.settlement.address!==p.settlement||row.request.settlement.ledgerAddress!==p.ledger||!chainInput?.buyerAcknowledged||chainInput.transactionHash!==row.transaction_hash||chainInput.deliveredAt==null||chainInput.acknowledgedAt==null||chainOutput.deliveredAt==null||Math.max(chainInput.deliveredAt,chainInput.acknowledgedAt)>chainOutput.deliveredAt)fail('Each consumed input must be a delivered purchase owned by this producer and acquired before output delivery.');
   if(chainInput!.acknowledgmentBlockNumber==null||chainInput!.acknowledgmentLogIndex==null||chainOutput.deliveryBlockNumber==null||chainOutput.deliveryLogIndex==null)fail('Refresh indexed event positions before recording input consumption.');
   const inputBlock=BigInt(chainInput!.acknowledgmentBlockNumber!),outputBlock=BigInt(chainOutput.deliveryBlockNumber!);
   if(inputBlock>outputBlock||inputBlock===outputBlock&&chainInput!.acknowledgmentLogIndex!>=chainOutput.deliveryLogIndex!)fail('Input acceptance must precede output delivery.');
   const allocated=(await db.query('SELECT COALESCE(sum(amount_atomic),0)::text AS amount FROM economy_production_input_allocations WHERE input_order_id=$1',[item.orderId])).rows[0].amount;
   if(BigInt(allocated)+BigInt(item.amountAtomic)>BigInt(row.request.amountAtomic))fail('An input purchase cannot be allocated more than its actual paid amount.');
   const cycle=(await db.query('WITH RECURSIVE inputs(id) AS (SELECT input_order_id FROM economy_production_input_allocations WHERE output_order_id=$1 UNION SELECT a.input_order_id FROM economy_production_input_allocations a JOIN inputs i ON a.output_order_id=i.id) SELECT 1 FROM inputs WHERE id=$2 LIMIT 1',[item.orderId,p.orderId])).rows.length;
   if(cycle)fail('Production input links cannot form a cycle.');
  }
  await db.query('INSERT INTO economy_production_accounts(order_id,evidence_hash,seller,payload,signature) VALUES($1,$2,$3,$4,$5)',[p.orderId,record.evidenceHash,p.seller,JSON.stringify(p),record.signature]);
  for(const i of p.inputs)await db.query('INSERT INTO economy_production_input_allocations(output_order_id,input_order_id,amount_atomic) VALUES($1,$2,$3)',[p.orderId,i.orderId,i.amountAtomic]);
  await db.query('COMMIT');return {evidenceHash:record.evidenceHash,replayed:false};
 }catch(e){await db.query('ROLLBACK');throw e;}
}
