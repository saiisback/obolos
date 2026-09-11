import {describe,expect,it} from 'vitest';
import {executeProviderWork,providerSchemas} from '../src/lib/economy/provider-work';
import {validateSchemaValue} from '../src/lib/economy/service-contract';

describe('real provider work',()=>{
 it('computes from UTF-8 input and verifies exact content hashes',async()=>{
  const output=await executeProviderWork('compute',{text:'hello 🌍'},{orderId:'order',paidAt:100});
  expect(output).toMatchObject({characters:7,bytes:10,words:2});
  expect(await executeProviderWork('verification',{text:'hello 🌍',sha256:output.sha256},{orderId:'order',paidAt:100})).toMatchObject({passed:true});
  expect(await executeProviderWork('verification',{text:'altered',sha256:output.sha256},{orderId:'order',paidAt:100})).toMatchObject({passed:false});
  validateSchemaValue(output,providerSchemas.compute.output);
 });
 it('requires actual source retrieval and propagates source failures',async()=>{
  await expect(executeProviderWork('data',{repo:'octocat/Hello-World'},{orderId:'o',paidAt:100,fetchEvidence:async()=>{throw Error('source offline');}})).rejects.toThrow('source offline');
  await expect(executeProviderWork('data',{repo:'https://attacker.test/'},{orderId:'o',paidAt:100})).rejects.toThrow();
 });
 it('refuses inference without configured real inference execution',async()=>{
  await expect(executeProviderWork('inference',{prompt:'Explain a hash.'},{orderId:'o',paidAt:100})).rejects.toThrow(/inference/i);
 });
 it('binds the storage lease to the persisted start of actual service on every retry',async()=>{
  const context={orderId:'order-one',paidAt:1,leaseStartedAt:100,now:100};
  const first=await executeProviderWork('storage',{text:'durable bytes'},context);
  expect(first).toEqual(await executeProviderWork('storage',{text:'durable bytes'},context));
  expect(first).toMatchObject({objectId:'order-one',bytes:13,expiresAt:new Date(3700*1000).toISOString()});
 });
 it('never completes storage work after its actual lease has expired',async()=>{
  await expect(executeProviderWork('storage',{text:'expired'},{orderId:'order',paidAt:1,leaseStartedAt:100,now:3701})).rejects.toThrow(/expired/i);
 });
});
