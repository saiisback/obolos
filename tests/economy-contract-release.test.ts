import {describe,expect,it} from 'vitest';
import {encodeAbiParameters,encodeEventTopics,keccak256,toHex,type Address,type Hex} from 'viem';
import {verifyObservationReceipt} from '../scripts/economy-observe';
import {ledgerAbi} from '../src/lib/economy/chain';
const hash=(s:string)=>keccak256(toHex(s));
const ledger='0x1111111111111111111111111111111111111111' as Address;
const attacker='0x2222222222222222222222222222222222222222' as Address;
const txHash=hash('tx'),metricId=hash('ARPI:USDC'),observationHash=hash('observation'),inputRoot=hash('inputs'),methodologyHash=hash('method');
const record={metricId,parameters:[metricId,'1','2','10000','10000',inputRoot,methodologyHash]};
const log={address:ledger,topics:encodeEventTopics({abi:ledgerAbi,eventName:'ObservationRecorded',args:{observationHash,metricId}}) as [Hex,...Hex[]],data:encodeAbiParameters([{type:'uint64'},{type:'uint64'},{type:'int256'},{type:'uint256'},{type:'bytes32'},{type:'bytes32'}],[1n,2n,10000n,10000n,inputRoot,methodologyHash])};
describe('observation settlement proof',()=>{
 it('accepts the exact ledger event in a smart-account entry-point transaction',()=>{
  const receipt={status:'success',transactionHash:txHash,to:attacker,logs:[log]};
  expect(verifyObservationReceipt(receipt,ledger,txHash,record)).toEqual({transactionHash:txHash,observationHash});
 });
 it('rejects an identical event emitted by another contract',()=>{
  expect(()=>verifyObservationReceipt({status:'success',transactionHash:txHash,logs:[{...log,address:attacker}]},ledger,txHash,record)).toThrow('exact ledger');
 });
 it('rejects mismatched value, transaction hash and reverted receipts',()=>{
  const receipt={status:'success',transactionHash:txHash,logs:[log]};
  expect(()=>verifyObservationReceipt(receipt,ledger,txHash,{...record,parameters:[metricId,'1','2','10001','10000',inputRoot,methodologyHash]})).toThrow();
  expect(()=>verifyObservationReceipt(receipt,ledger,hash('other'),record)).toThrow();
  expect(()=>verifyObservationReceipt({...receipt,status:'reverted'},ledger,txHash,record)).toThrow();
 });
});
