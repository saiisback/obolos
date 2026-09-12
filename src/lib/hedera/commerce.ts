import {createHash} from 'node:crypto';
import {z} from 'zod';
import {validateRepos} from '../repository-service';

const account=z.string().regex(/^0\.0\.[1-9]\d*$/);
const atomic=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const tokenTerms=z.object({asset:account,payer:account,payTo:account,amountAtomic:atomic}).strict();
export type TokenTerms=z.infer<typeof tokenTerms>;
export function validateTokenTerms(value:unknown):TokenTerms {
 const terms=tokenTerms.parse(value);
 if(terms.payer===terms.payTo)throw Error('Payer and service recipient must differ.');
 return terms;
}
type Transfer={account:string;amount:number;token_id?:string};
type MirrorTransaction={result:string;name:string;scheduled?:boolean;consensus_timestamp?:string;transaction_id?:string;charged_tx_fee?:number;memo_base64?:string;token_transfers?:Transfer[];transfers?:Transfer[]};
export function validateTokenTransfer(value:unknown,input:TokenTerms):void {
 const terms=validateTokenTerms(input);
 const transactions=(value as {transactions?:MirrorTransaction[]})?.transactions;
 if(!transactions?.some(tx=>{
  if(tx.result!=='SUCCESS'||tx.name!=='CRYPTOTRANSFER')return false;
  const rows=tx.token_transfers;
  return rows?.length===2 && rows.every(t=>t.token_id===terms.asset&&Number.isSafeInteger(t.amount)) &&
   rows.filter(t=>t.account===terms.payer).reduce((s,t)=>s+t.amount,0)===-terms.amountAtomic &&
   rows.filter(t=>t.account===terms.payTo).reduce((s,t)=>s+t.amount,0)===terms.amountAtomic;
 }))throw Error('Mirror node has not proved the exact HTS transfer.');
}
const scheduleSchema=z.object({id:z.string().uuid(),payer:account,payTo:account,repos:z.array(z.string()).min(1).max(3),unitPriceAtomic:atomic.max(100000000),count:z.number().int().min(1).max(10),intervalSeconds:z.number().int().min(10).max(86400),firstExecutionAt:z.string().datetime(),maxTotalAtomic:atomic.max(100000000)}).strict();
export type SchedulePlan=z.infer<typeof scheduleSchema>;
export function validateSchedulePlan(input:unknown,now=Date.now(),allowPast=false):SchedulePlan {
 const plan=scheduleSchema.parse(input);plan.repos=validateRepos(plan.repos);
 const first=Date.parse(plan.firstExecutionAt),last=first+(plan.count-1)*plan.intervalSeconds*1000;
 const total=plan.unitPriceAtomic*plan.repos.length*plan.count;
 if(plan.payer===plan.payTo||!Number.isSafeInteger(total)||total>plan.maxTotalAtomic||(!allowPast&&(first<now+10000||last>now+86400000)))throw Error('Schedule exceeds its finite spending authority.');
 return plan;
}
export function scheduleMemo(input:SchedulePlan,round:number):string {
 const p=validateSchedulePlan(input,0,true);
 if(!Number.isInteger(round)||round<0||round>=p.count)throw Error('Invalid schedule round.');
 // Fixed field order; binds the payment to the exact requested resource and round.
 return 'obolos:'+createHash('sha256').update(JSON.stringify([p.id,p.payer,p.payTo,p.repos,p.unitPriceAtomic,p.count,p.intervalSeconds,p.firstExecutionAt,p.maxTotalAtomic,round])).digest('hex');
}
export function validateScheduledProof(schedule:unknown,value:unknown,plan:SchedulePlan,round:number,scheduleId:string):void {
 account.parse(scheduleId);validateSchedulePlan(plan,0,true);
 const s=schedule as {schedule_id?:string;payer_account_id?:string;wait_for_expiry?:boolean;executed_timestamp?:string;expiration_time?:string;memo?:string;deleted?:boolean};
 const memo=scheduleMemo(plan,round),amount=plan.unitPriceAtomic*plan.repos.length;
 const due=Date.parse(plan.firstExecutionAt)/1000+round*plan.intervalSeconds;
 if(!s||s.schedule_id!==scheduleId||s.payer_account_id!==plan.payer||s.wait_for_expiry!==true||s.deleted||!s.executed_timestamp||Number(s.executed_timestamp)<due||Number(s.expiration_time)!==due||s.memo!==memo)throw Error('Native schedule execution is not proven.');
 const txs=(value as {transactions?:MirrorTransaction[]})?.transactions;
 if(!txs?.some(tx=>tx.result==='SUCCESS'&&tx.name==='CRYPTOTRANSFER'&&tx.scheduled===true&&tx.consensus_timestamp===s.executed_timestamp&&typeof tx.transaction_id==='string'&&/^0\.0\.[1-9]\d*-\d{10,}-\d{1,9}$/.test(tx.transaction_id)&&tx.transaction_id.split('-')[0]===plan.payer&&Number.isSafeInteger(tx.charged_tx_fee)&&tx.charged_tx_fee!>=0&&tx.charged_tx_fee!<=100000000&&tx.transfers?.every(t=>Number.isSafeInteger(t.amount))&&Buffer.from(tx.memo_base64??'','base64').toString('utf8')===memo&&!tx.token_transfers?.length&&
  tx.transfers?.filter(t=>t.account===plan.payTo).reduce((sum,t)=>sum+t.amount,0)===amount&&
  tx.transfers?.filter(t=>t.account===plan.payer).reduce((sum,t)=>sum+t.amount,0)===-(amount+tx.charged_tx_fee!)))throw Error('Scheduled payment does not match the resource purchase.');
}
