import {describe,expect,it} from 'vitest';
import {advanceRun,approveRun,createRun,pauseRun,applyShock} from '../src/lib/engine';
import {liveGateway,type Gateway} from '../src/lib/gateway';
import {liveFixtureGateway} from './fixtures/gateway';

describe('live-only runtime',()=>{
 it('rejects simulated receipts and receipts without transaction IDs at both paid stages',async()=>{
  for(const stage of ['data','verify'] as const)for(const invalid of [{status:'simulated' as const},{transactionId:undefined}]){
   const run=createRun({mode:'live',repos:['vercel/next.js']});
   const gateway:Gateway={...liveFixtureGateway,
    async purchaseData(input){const result=await liveFixtureGateway.purchaseData(input);return stage==='data'?{...result,receipt:{...result.receipt,...invalid}}:result;},
    async verify(input){const result=await liveFixtureGateway.verify(input);return stage==='verify'?{...result,receipt:{...result.receipt,...invalid}}:result;},
   };
   for(let i=0;i<6;i++)await advanceRun(run,gateway);
   expect(run.status).toBe('failed');expect(run.error).toMatch(/confirmed live settlement/);expect(run.receipts).toHaveLength(stage==='data'?0:1);
  }
 });
 it('rejects rehearsal creation and begins without invented provider quotes',()=>{
  expect(()=>createRun({repos:['vercel/next.js'],mode:'rehearsal'})).toThrow();
  expect(createRun({repos:['vercel/next.js'],mode:'live'}).providers).toEqual([]);
 });
 it('keeps historical rehearsal records read-only even when submitted directly',async()=>{
  const run={...createRun({repos:['vercel/next.js'],mode:'live'}),mode:'rehearsal' as const};
  const gateway:Gateway={discover:async()=>{throw Error('must not execute');},purchaseData:async()=>{throw Error('must not execute');},generateReport:async()=>{throw Error('must not execute');},verify:async()=>{throw Error('must not execute');}};
  const before=JSON.stringify(run);
  await expect(advanceRun(run,gateway)).rejects.toThrow(/read-only/i);
  await expect(approveRun(run,{})).rejects.toThrow(/read-only/i);
  expect(()=>pauseRun(run)).toThrow(/read-only/i);
  expect(()=>applyShock(run)).toThrow(/read-only/i);
  expect(JSON.stringify(run)).toBe(before);
 });
 it('stops when live discovery is unavailable without manufacturing evidence',async()=>{
  const run=createRun({repos:['vercel/next.js'],mode:'live'});
  await advanceRun(run,liveGateway);
  await advanceRun(run,{...liveGateway,discover:async()=>{throw Error('Provider offline');}});
  expect(run.status).toBe('failed');expect(run.error).toBe('Provider offline');
  expect(run.evidence).toEqual([]);expect(run.receipts).toEqual([]);expect(run.report).toBeUndefined();
 });
});
