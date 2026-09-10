import type {Run} from '../contracts';
import type {SignedMandate} from './execution-contracts';
import {sql} from './db';
import {PlatformError} from './http';
import {reportDigest} from '../market/verifier';
import {checkReport} from '../gateway';
function fail():never {throw new PlatformError(409,'PAYMENT_PROOF_REQUIRED','The payment or delivered report could not be independently matched. Preserve the job and reconcile its existing transaction.');};
const canonical=(v:unknown):string=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v!==null&&typeof v==='object'?'{'+Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>JSON.stringify(k)+':'+canonical(x)).join(',')+'}':JSON.stringify(v);
export function assertHederaProof(body:{transactions?:{result?:string;consensus_timestamp?:string;transfers?:{account:string;amount:number}[]}[]},input:{payTo:string;amount:number;createdAt:string;expiresAt:string}){
 const match=body.transactions?.find(t=>t.result==='SUCCESS'&&Number(t.consensus_timestamp)*1000>=Date.parse(input.createdAt)-30000&&Number(t.consensus_timestamp)*1000<=Date.parse(input.expiresAt)+60000&&t.transfers?.filter(x=>x.account===input.payTo).reduce((s,x)=>s+BigInt(x.amount),0n)===BigInt(input.amount));
 if(!match)fail();return {payTo:input.payTo,amountAtomic:input.amount,consensusTimestamp:match.consensus_timestamp};
}
/** The public platform checks paid evidence against its settled service record,
 * the mirror node, and the independently settled marketplace order. */
export async function verifyHostedSettlement(job:{id:string;created_at:unknown},run:Run,m:SignedMandate){
 if(!m.verificationService)return null;
 const db=sql(),proofs:unknown[]=[];
 for(const receipt of run.receipts){
  if(receipt.network==='hedera:testnet'){
   const stored=await db`SELECT amount_atomic,repos,evidence,settlement FROM platform_service_payments WHERE state='settled' AND (transaction_id=${receipt.transactionId!} OR settlement->>'transaction'=${receipt.transactionId!})`;
   if(stored.length!==1||Number(stored[0].amount_atomic)!==receipt.amountAtomic||canonical(stored[0].repos)!==canonical(run.repos)||canonical(stored[0].evidence)!==canonical(run.evidence))fail();
   const id=receipt.transactionId!.replace('@','-').replace(/\.(\d+)$/,'-$1');
   const response=await fetch(`https://testnet.mirrornode.hedera.com/api/v1/transactions/${id}`,{signal:AbortSignal.timeout(20000),cache:'no-store',redirect:'error'});
   if(!response.ok)fail();
   const proof=assertHederaProof(await response.json(),{payTo:process.env.HEDERA_PAY_TO??'',amount:receipt.amountAtomic,createdAt:new Date(String(job.created_at)).toISOString(),expiresAt:m.expiresAt});
   proofs.push({network:receipt.network,transactionId:receipt.transactionId,...proof});
  }else{
   const orders=await db`SELECT * FROM platform_market_orders WHERE job_id=${job.id} AND status='fulfilled'`;
   const order=orders[0];
   if(!order||!run.report||order.data_transaction_id!==run.receipts.find(r=>r.network==='hedera:testnet')?.transactionId||order.id!==receipt.orderId||String(order.transaction_hash).toLowerCase()!==receipt.transactionId?.toLowerCase()||Number(order.amount_atomic)!==receipt.amountAtomic||String(order.recipient).toLowerCase()!==m.verificationService.recipient.toLowerCase()||order.service_id!==m.verificationService.id||order.revision!==m.verificationService.revision||order.report_digest!==reportDigest(run.report)||!order.proof)fail();
   const expected=[...checkReport(run.report),...(order.result as {checks:{label:string;passed:boolean;detail:string}[]}).checks];
   if(canonical(expected)!==canonical(run.report!.checks))fail();
   proofs.push({network:receipt.network,transactionId:receipt.transactionId,orderId:order.id,serviceId:order.service_id,recipient:order.recipient,amountAtomic:order.amount_atomic,proof:order.proof});
  }
 }
 return proofs;
}
