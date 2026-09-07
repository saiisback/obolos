import { describe,it,expect } from 'vitest';
import { createRun,advanceRun,applyShock,approveRun,pauseRun } from '../src/lib/engine';
import { rehearsalGateway } from '../src/lib/gateway';
import { verifyAudit } from '../src/lib/policy';
describe('managed research job',()=>{
 it('buys evidence, commissions a checked report and pays two distinct rails',async()=>{
  const run=createRun({repos:['vercel/next.js','sveltejs/kit'],mode:'rehearsal'});
  for(let i=0;i<7;i++) await advanceRun(run,rehearsalGateway);
  expect(run.status).toBe('completed');
  expect(run.report?.verified).toBe(true);
  expect(run.receipts).toHaveLength(2);
  expect(run.receipts.map(x=>x.network)).toEqual(['hedera:testnet','arc:testnet']);
  expect(run.receipts.every(x=>x.status==='simulated'&&!x.transactionId)).toBe(true);
  expect(verifyAudit(run.events)).toBe(true);
  await advanceRun(run,rehearsalGateway);
  expect(run.receipts).toHaveLength(2);
 });
 it('blocks a changed price and resumes only after a bound approval',async()=>{
  const run=createRun({repos:['vercel/next.js'],mode:'rehearsal'});
  await advanceRun(run,rehearsalGateway);
  await advanceRun(run,rehearsalGateway);
  applyShock(run);
  await advanceRun(run,rehearsalGateway);
  expect(run.status).toBe('awaiting_approval');
  expect(run.receipts).toHaveLength(0);
  expect(run.approval?.message).toContain(run.id);
  await approveRun(run,{});
  expect(run.mandate.version).toBe(2);
  await expect(approveRun(run,{})).rejects.toThrow();
  for(let i=0;i<5;i++) await advanceRun(run,rehearsalGateway);
  expect(run.status).toBe('completed');
 });
 it('pause prevents the next payment',async()=>{
  const run=createRun({repos:['vercel/next.js'],mode:'rehearsal'});
  pauseRun(run);
  await advanceRun(run,rehearsalGateway);
  expect(run.receipts).toHaveLength(0);
 });
 it('does not accept a simulated approval for a live job',async()=>{
  const run=createRun({repos:['vercel/next.js'],mode:'live'});
  run.approval={nonce:'test',message:'test',expiresAt:'2030-01-01',proposedMandate:{...run.mandate,version:2},reason:'test'};
  run.status='awaiting_approval';
  await expect(approveRun(run,{})).rejects.toThrow();
  expect(run.mandate.version).toBe(1);
 });
 it('fails a run if a gateway misrepresents paid amount',async()=>{
  const run=createRun({repos:['vercel/next.js'],mode:'rehearsal'});
  const bad={...rehearsalGateway,purchaseData:async(input:Parameters<typeof rehearsalGateway.purchaseData>[0])=>{
   const result=await rehearsalGateway.purchaseData(input);result.receipt.amountAtomic=1;return result;
  }};
  for(let i=0;i<4;i++) await advanceRun(run,bad);
  expect(run.status).toBe('failed');
  expect(run.receipts).toHaveLength(0);
 });
});
