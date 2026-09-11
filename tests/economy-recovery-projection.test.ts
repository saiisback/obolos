import {describe,expect,it} from 'vitest';
import {projectRecovery,type RecoveryEvidence,type RecoveryOrder} from '../src/lib/economy/recovery-projection';
const a=(n:string)=>`0x${n.repeat(40)}`,h=(n:string)=>`0x${n.repeat(64)}`;
const order:RecoveryOrder={orderId:h('1'),seller:a('1'),payer:a('2'),owner:a('2'),transactionHash:h('2'),outputHash:h('3'),delivered:true,buyerAcknowledged:true,sameOwner:false};
const review=(reviewer=a('3'),verdict:'passed'|'failed'='passed')=>({order_id:order.orderId,reviewer,output_hash:order.outputHash!,verdict,evidence_hash:h('4'),evidence_reference:'https://evidence.example/review',created_at:'2026-09-11T00:00:00.000Z',owner_address:order.owner,payer:order.payer,seller:order.seller,payment_transaction_hash:order.transactionHash,delivered_output_hash:order.outputHash!});
const evidence=(reviews:RecoveryEvidence['reviews']=[]):RecoveryEvidence=>({reviews,disputes:[],refunds:[]});
describe('independent recovery evidence projection',()=>{
 it('keeps quality unknown until every eligible order has actual review coverage',()=>{
  expect(projectRecovery([order],evidence(),new Map(),[a('3')]).reputation[0].qualityScore).toBeNull();
  expect(projectRecovery([order],evidence([review()]),new Map(),[a('3')]).reputation[0]).toMatchObject({qualityScore:10000n,verifiedReviews:1,reviewedOrders:1,reviewEligibleOrders:1});
  expect(projectRecovery([order,{...order,orderId:h('8')}],evidence([review()]),new Map(),[a('3')]).reputation[0].qualityScore).toBeNull();
 });
 it('excludes untrusted and alternate executors bound to an order participant',()=>{
  expect(projectRecovery([order],evidence([review()]),new Map(),[]).reputation[0].verifiedReviews).toBe(0);
  expect(projectRecovery([order],evidence([review()]),new Map([[a('3'),a('2')]]),[a('3')]).reputation[0].verifiedReviews).toBe(0);
  expect(projectRecovery([{...order,sameOwner:true}],evidence([review()]),new Map(),[a('3')]).reputation[0].qualityScore).toBeNull();
 });
 it('never scores conflicting trusted verdicts or unrelated output/payment hashes',()=>{
  expect(projectRecovery([order],evidence([review(),review(a('4'),'failed')]),new Map(),[a('3'),a('4')]).reputation[0]).toMatchObject({qualityScore:null,conflictingReviewOrders:1});
  for(const changes of [{output_hash:h('9')},{payment_transaction_hash:h('9')},{seller:a('9')},{delivered_output_hash:h('9')}])expect(projectRecovery([order],evidence([{...review(),...changes}]),new Map(),[a('3')]).reputation[0].verifiedReviews).toBe(0);
 });
 it('counts distinct known reviewer controllers once per order and computes only review pass rate',()=>{
  expect(projectRecovery([order],evidence([review(),review(a('4'))]),new Map([[a('3'),a('5')],[a('4'),a('5')]]),[a('3'),a('4')]).reputation[0].verifiedReviews).toBe(1);
  expect(projectRecovery([order],evidence([review(a('3'),'failed')]),new Map(),[a('3')]).reputation[0].qualityScore).toBe(0n);
 });
});
