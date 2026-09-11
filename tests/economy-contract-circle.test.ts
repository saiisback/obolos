import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { durableOperation, runtimeMatches } from '../scripts/economy-circle';
const dirs:string[]=[];
afterEach(async()=>{await Promise.all(dirs.splice(0).map(dir=>rm(dir,{recursive:true,force:true})));});
describe('durable Circle operation journal',()=>{
 it('persists UUID before dispatch and refuses an ambiguous second dispatch',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'obolos-circle-'));dirs.push(dir);let calls=0;
  const submit=async(key:string)=>{calls++;const saved=JSON.parse(await readFile(join(dir,'op.json'),'utf8'));expect(saved.idempotencyKey).toBe(key);expect(saved.status).toBe('submitting');throw Error('timeout');};
  await expect(durableOperation(dir,'op',{kind:'execute',args:['a']},submit)).rejects.toThrow('uncertain');
  await expect(durableOperation(dir,'op',{kind:'execute',args:['a']},submit)).rejects.toThrow('reconcile');expect(calls).toBe(1);
 });
 it('retains successful transaction evidence and rejects intent mutation',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'obolos-circle-'));dirs.push(dir);let calls=0;
  const submit=async(key:string)=>{calls++;return {idempotencyKey:key,id:'circle-id',txHash:'0x'+'ab'.repeat(32)};};
  const first=await durableOperation(dir,'op',{kind:'execute',args:['a']},submit);
  const next=await durableOperation(dir,'op',{kind:'execute',args:['a']},submit);expect(next.idempotencyKey).toBe(first.idempotencyKey);expect(calls).toBe(1);
  await expect(durableOperation(dir,'op',{kind:'execute',args:['b']},submit)).rejects.toThrow('different intent');
 });
 it('compares runtime bytecode outside known immutable slots only',()=>{
  expect(runtimeMatches('0x6000123460','6000000060',{'x':[{start:2,length:2}]})).toBe(true);
  expect(runtimeMatches('0x6100123460','6000000060',{'x':[{start:2,length:2}]})).toBe(false);
 });
});

import {encodeCircleCall,patchCircleSource} from '../scripts/circle-calldata-adapter';
import {decodeFunctionData,parseAbi,zeroHash} from 'viem';
it('encodes tuple parameters as canonical calldata without changing types or field order',()=>{
 const signature='setCategory(uint8,(bool,uint256,uint256,uint64,uint64),bytes32,uint256,bytes)';
 const data=encodeCircleCall(signature,['1','[true,"1000","5000","3600","10"]',zeroHash,'100','0x1234']);
 expect(decodeFunctionData({abi:parseAbi([`function ${signature}`]),data}).args).toEqual([1,[true,1000n,5000n,3600n,10n],zeroHash,100n,'0x1234']);
 expect(()=>encodeCircleCall(signature,['1','not-a-tuple',zeroHash,'100','0x1234'])).toThrow();
});
it('patches only the reviewed upstream execute parameter construction and fails closed on changes',async()=>{
 const source=await readFile('node_modules/@circle-fin/cli/dist/index.js','utf8');
 const patched=patchCircleSource(source),start=source.indexOf('async function handleAgentExecute('),end=source.indexOf('async function handleLocalExecuteEstimate(',start);
 expect(patched.slice(0,start)).toBe(source.slice(0,start));expect(patched.slice(patched.indexOf('async function handleLocalExecuteEstimate(',start))).toBe(source.slice(end));
 expect(patched.slice(start,patched.indexOf('async function handleLocalExecuteEstimate(',start)).match(/callData: abiFunctionSignature/g)).toHaveLength(2);
 expect(()=>patchCircleSource(source+'\n')).toThrow('review required');
});
it('never resubmits an operation after recorded terminal failure',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'obolos-circle-'));dirs.push(dir);let calls=0;
 const submit=async(key:string)=>{calls++;return {idempotencyKey:key,id:'failed-id'};};
 await durableOperation(dir,'failed',{kind:'execute',args:['original']},submit);
 const path=join(dir,'failed.json'),op=JSON.parse(await readFile(path,'utf8'));op.status='failed';
 const {writeFile}=await import('node:fs/promises');await writeFile(path,JSON.stringify(op));
 await expect(durableOperation(dir,'failed',{kind:'execute',args:['original']},submit)).rejects.toThrow('Terminal failure');expect(calls).toBe(1);
});
