import {describe,it,expect} from 'vitest';
import {validateTokenTerms,validateTokenTransfer,validateSchedulePlan,scheduleMemo,validateScheduledProof} from '../src/lib/hedera/commerce';

const terms={asset:'0.0.123',payer:'0.0.10',payTo:'0.0.20',amountAtomic:2};
const plan={id:'f32a1f26-a784-4c8e-87b2-59e6dca214a3',payer:'0.0.10',payTo:'0.0.20',repos:['octocat/Hello-World'],unitPriceAtomic:100000,count:2,intervalSeconds:30,firstExecutionAt:'2026-09-12T18:00:30.000Z',maxTotalAtomic:200000};
describe('Hedera native commerce boundaries',()=>{
 it('pins HTS asset, positive integer units, and separate payer/recipient',()=>{
  expect(validateTokenTerms(terms)).toEqual(terms);
  for(const patch of [{asset:'0.0.0'},{amountAtomic:0},{amountAtomic:1.1},{payTo:terms.payer}])expect(()=>validateTokenTerms({...terms,...patch})).toThrow();
 });
 it('requires one exact successful token transfer and refuses different assets or mixed debits',()=>{
  const tx={result:'SUCCESS',name:'CRYPTOTRANSFER',token_transfers:[{token_id:terms.asset,account:terms.payer,amount:-2},{token_id:terms.asset,account:terms.payTo,amount:2}]};
  expect(()=>validateTokenTransfer({transactions:[tx]},terms)).not.toThrow();
  expect(()=>validateTokenTransfer({transactions:[{...tx,result:'FAIL_INVALID'}]},terms)).toThrow();
  expect(()=>validateTokenTransfer({transactions:[{...tx,token_transfers:[...tx.token_transfers,{token_id:'0.0.456',account:terms.payer,amount:-1}]}]},terms)).toThrow();
 });
 it('caps finite schedules and binds memos to every purchase term and round',()=>{
  expect(validateSchedulePlan(plan,Date.parse('2026-09-12T18:00:00Z'))).toEqual(plan);
  for(const patch of [{count:0},{count:11},{intervalSeconds:0},{maxTotalAtomic:199999},{firstExecutionAt:'2020-01-01T00:00:00Z'},{payTo:plan.payer}])expect(()=>validateSchedulePlan({...plan,...patch},Date.parse('2026-09-12T18:00:00Z'))).toThrow();
  expect(scheduleMemo(plan,0)).not.toEqual(scheduleMemo(plan,1));
  expect(scheduleMemo(plan,0)).not.toEqual(scheduleMemo({...plan,repos:['vercel/next.js']},0));
 });
 it('requires native schedule execution, exact memo and amount before granting data access',()=>{
  const schedule={schedule_id:'0.0.888',payer_account_id:plan.payer,wait_for_expiry:true,executed_timestamp:'1789236031.000000000',expiration_time:'1789236030.000000000',memo:scheduleMemo(plan,0),deleted:false};
  const tx={result:'SUCCESS',name:'CRYPTOTRANSFER',scheduled:true,transaction_id:'0.0.10-1789236000-000000001',charged_tx_fee:10000,consensus_timestamp:schedule.executed_timestamp,memo_base64:Buffer.from(scheduleMemo(plan,0)).toString('base64'),token_transfers:[],transfers:[{account:plan.payer,amount:-110000},{account:plan.payTo,amount:100000}]};
  expect(()=>validateScheduledProof(schedule,{transactions:[tx]},plan,0,'0.0.888')).not.toThrow();
  for(const patch of [{wait_for_expiry:false},{payer_account_id:'0.0.30'},{executed_timestamp:null},{memo:'wrong'},{expiration_time:'1789236999.000000000'}])expect(()=>validateScheduledProof({...schedule,...patch},{transactions:[tx]},plan,0,'0.0.888')).toThrow();
  expect(()=>validateScheduledProof(schedule,{transactions:[{...tx,scheduled:false}]},plan,0,'0.0.888')).toThrow();
  expect(()=>validateScheduledProof(schedule,{transactions:[{...tx,transfers:[{account:plan.payer,amount:-1000000},{account:plan.payTo,amount:100000},{account:'0.0.900',amount:900000}]}]},plan,0,'0.0.888')).toThrow();
 });
});
