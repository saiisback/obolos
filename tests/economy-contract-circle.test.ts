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
 const patched=patchCircleSource(source).replace('    userOpHash: tx.userOpHash,\n','').replace(/  \/\/ OBOLOS exact-ID detail begin[\s\S]*?  \/\/ OBOLOS exact-ID detail end\n/,''),start=source.indexOf('async function handleAgentExecute('),end=source.indexOf('async function handleLocalExecuteEstimate(',start);
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

it('retains exact Circle transaction correlation before delayed confirmation without polling or redispatch',async()=>{
 const source=patchCircleSource(await readFile('node_modules/@circle-fin/cli/dist/index.js','utf8'));
 const start=source.indexOf('async function handleAgentExecute('),end=source.indexOf('async function handleLocalExecuteEstimate(',start),fn=source.slice(start,end).trim();
 let submissions=0,polls=0;const outputs:unknown[]=[];
 const execute=new Function('getProxyUrl','CircleHttpClient','readFlagValue','submitAgentContractExecutionChallenge','runChallengeCycle','runTransactionChallenge','output','outputError',`return (${fn});`)(()=> 'https://circle.example',class {},()=> 'permanent-key',async()=>{submissions++;return {challengeId:'challenge',idempotencyKey:'permanent-key'};},async()=>['exact-circle-transaction-id'],async()=>{polls++;return null;},(value:unknown)=>outputs.push(value),()=>{throw Error('lost pending transaction');});
 await execute({address:'0x'+'1'.repeat(40)},{},'ARC-TESTNET','0x'+'2'.repeat(40),'0x12345678',[],'0',false,[]);
 expect(submissions).toBe(1);expect(polls).toBe(0);expect(outputs).toEqual([expect.objectContaining({id:'exact-circle-transaction-id',idempotencyKey:'permanent-key'})]);
 const dir=await mkdtemp(join(tmpdir(),'obolos-circle-'));dirs.push(dir);let dispatches=0;
 const submit=async(key:string)=>{dispatches++;return {idempotencyKey:key,id:'exact-circle-transaction-id'};};
 expect((await durableOperation(dir,'pending',{kind:'execute',args:['exact']},submit)).result?.id).toBe('exact-circle-transaction-id');
 await durableOperation(dir,'pending',{kind:'execute',args:['exact']},submit);expect(dispatches).toBe(1);
});

import {requireCircleTransactionHash,type Operation} from '../scripts/economy-circle';
it('distinguishes a correlated queued transaction from absent correlation without accepting payment',()=>{
 const op={result:{id:'known-id',state:'QUEUED'}} as unknown as Operation;
 expect(()=>requireCircleTransactionHash(op)).toThrow('correlated, but its transaction hash is not available');
 expect(()=>requireCircleTransactionHash({} as Operation)).toThrow('No uniquely correlated');
 expect(requireCircleTransactionHash({result:{txHash:'0x'+'ab'.repeat(32)}} as unknown as Operation)).toBe('0x'+'ab'.repeat(32));
});
it('retains raw userOpHash in reviewed CLI history formatting while a transaction is SENT',async()=>{
 const source=patchCircleSource(await readFile('node_modules/@circle-fin/cli/dist/index.js','utf8')),start=source.indexOf('function formatTransactionOutput('),end=source.indexOf('function pickSubmittedFee(',start);
 const format=new Function(`return (${source.slice(start,end).trim()});`)();
 const userOpHash='0x'+'cd'.repeat(32),result=format({id:'known-id',state:'SENT',userOpHash});
 expect(result).toMatchObject({id:'known-id',state:'SENT',userOpHash});expect(result.txHash).toBeUndefined();
});

it('uses exact-ID transaction detail when list omits userOpHash and rejects cross-wallet detail',async()=>{
 const source=patchCircleSource(await readFile('node_modules/@circle-fin/cli/dist/index.js','utf8')),start=source.indexOf('async function transactionListCommand('),end=source.indexOf('// src/commands/transaction/manage.ts',start),fn=source.slice(start,end).trim();
 const id='88d1acb4-0ef4-55d2-86dd-7a7c5157765e',wallet='0x'+'1'.repeat(40),userOpHash='0x'+'ab'.repeat(32);let detailCalls=0;const outputs:unknown[]=[];let wrongWallet=false;
 class Client{async getTransaction(_token:string,requested:string){detailCalls++;expect(requested).toBe(id);return {id,walletId:wrongWallet?'other-wallet':'wallet-id',sourceAddress:wallet,blockchain:'ARC-TESTNET',userOpHash,state:'SENT'};}async listTransactions(){throw Error('list omits the required correlation field');}}
 const execute=new Function('requireFlags','resolveOrReport','loadAgentEnv','getProxyUrl','CircleHttpClient','readFlagValue','parseListFilters','parsePaginationFlags','formatTransactionOutput','outputTransactions','output','outputError',`return (${fn});`)(()=>({'--address':wallet,'--chain':'ARC-TESTNET'}),async()=>({wallet:{type:'agent',walletId:'wallet-id',address:wallet},env:{userToken:'test-token'}}),async()=>({}),()=> 'https://circle.example',Client,(_args:unknown,key:string)=>key==='--transaction-id'?id:undefined,()=>({}),()=>({}), (tx:unknown)=>tx,()=>{throw Error('unexpected history fallback');},(value:unknown)=>outputs.push(value),()=>{throw Error('rejected detail');});
 await execute({},['--transaction-id',id,'--output','json']);expect(detailCalls).toBe(1);expect(outputs).toEqual([{transactions:[expect.objectContaining({id,userOpHash})]}]);
 wrongWallet=true;await expect(execute({},['--transaction-id',id,'--output','json'])).rejects.toThrow();expect(outputs).toHaveLength(1);
});
