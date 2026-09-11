import {describe,expect,it} from 'vitest';
import {encodeAbiParameters,encodeEventTopics,parseAbi,type Hex} from 'viem';
import {verifyRefundTransfer} from '../src/lib/economy/recovery';
const token='0x3600000000000000000000000000000000000000',seller='0x'+'1'.repeat(40),payer='0x'+'2'.repeat(40),hash='0x'+'3'.repeat(64) as Hex;
const abi=parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)']);
const log={address:token,logIndex:2,topics:encodeEventTopics({abi,eventName:'Transfer',args:{from:seller as Hex,to:payer as Hex}}) as [Hex,...Hex[]],data:encodeAbiParameters([{type:'uint256'}],[1000n])};
const receipt={status:'success',transactionHash:hash,blockNumber:10n,logs:[log]};
describe('refund chain proof',()=>{
 it('requires the exact canonical token transfer from seller back to payer',()=>{
  expect(verifyRefundTransfer(receipt,{transactionHash:hash,logIndex:2,seller,payer,amountAtomic:'1000'})).toBe('1000');
  for(const changed of [{payer:seller},{seller:payer},{amountAtomic:'950'},{logIndex:3}])expect(()=>verifyRefundTransfer(receipt,{transactionHash:hash,logIndex:2,seller,payer,amountAtomic:'1000',...changed})).toThrow();
 });
 it('rejects fake-token logs and reverted receipts',()=>{
  const request={transactionHash:hash,logIndex:2,seller,payer,amountAtomic:'1000'};
  expect(()=>verifyRefundTransfer({...receipt,status:'reverted'},request)).toThrow();
  expect(()=>verifyRefundTransfer({...receipt,logs:[{...log,address:seller}]},request)).toThrow();
 });
});
