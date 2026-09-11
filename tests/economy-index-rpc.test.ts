import {describe,expect,it} from 'vitest';
import {serializeIndexReads} from '../src/lib/economy/index-rpc';
describe('rate-limited finalized index reads',()=>{
 it('serializes parallel snapshot reads and retries nested Arc rate limits without changing arguments',async()=>{
  let active=0,maxActive=0,attempt=0;const pauses:number[]=[],argumentsSeen:unknown[]=[];
  const client=serializeIndexReads({readContract:async(input:{functionName:string})=>{active++;maxActive=Math.max(maxActive,active);argumentsSeen.push(input);await Promise.resolve();active--;if(++attempt===1)throw {name:'ContractFunctionExecutionError',cause:{name:'CallExecutionError',cause:{name:'LimitExceededRpcError'}}};return input.functionName;}},{pause:async ms=>{pauses.push(ms);}});
  expect(await Promise.all([client.readContract({functionName:'agents'}),client.readContract({functionName:'categories'})])).toEqual(['agents','categories']);
  expect(maxActive).toBe(1);expect(argumentsSeen).toEqual([{functionName:'agents'},{functionName:'agents'},{functionName:'categories'}]);expect(pauses.some(ms=>ms>=1000)).toBe(true);
 });
 it('bounds exhausted retries and leaves contract validation failures untouched',async()=>{
  let attempts=0;const limited=serializeIndexReads({getBlock:async()=>{attempts++;throw {name:'LimitExceededRpcError'};}},{pause:async()=>{}});
  await expect(limited.getBlock()).rejects.toMatchObject({name:'LimitExceededRpcError'});expect(attempts).toBe(4);
  attempts=0;const invalid=serializeIndexReads({readContract:async()=>{attempts++;throw {name:'ContractFunctionRevertedError'};}},{pause:async()=>{}});
  await expect(invalid.readContract()).rejects.toMatchObject({name:'ContractFunctionRevertedError'});expect(attempts).toBe(1);
 });
});

it('retries only the exact read-only simulation and never retries wallet writes',async()=>{
 let simulations=0,writes=0;const seen:unknown[]=[];const args={address:'0x1234',functionName:'consume',args:['permanent-order'],blockNumber:100n};
 const client=serializeIndexReads({simulateContract:async(input:unknown)=>{seen.push(input);if(++simulations===1)throw {name:'CallExecutionError',cause:{code:-32005}};return {result:true};},writeContract:async()=>{writes++;throw {code:-32005};},sendTransaction:async()=>{writes++;throw {code:-32005};}},{pause:async()=>{}});
 await expect(client.simulateContract(args)).resolves.toEqual({result:true});expect(seen).toEqual([args,args]);expect(writes).toBe(0);
 await expect(client.writeContract()).rejects.toMatchObject({code:-32005});await expect(client.sendTransaction()).rejects.toMatchObject({code:-32005});expect(writes).toBe(2);
});
it.each(['getCode','call','getTransactionReceipt'])('queues and bounds read retries for %s',async method=>{
 let attempts=0;const client=serializeIndexReads({[method]:async()=>{if(++attempts<2)throw {status:429};return 'read-only';}},{pause:async()=>{}});
 await expect(client[method]()).resolves.toBe('read-only');expect(attempts).toBe(2);
});
