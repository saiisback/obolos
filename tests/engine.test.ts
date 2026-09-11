import { describe,it,expect,vi,afterEach } from 'vitest';
import { createRun,advanceRun,applyShock,approveRun,pauseRun } from '../src/lib/engine';
import { liveFixtureGateway, DEFAULT_PROVIDERS } from './fixtures/gateway';
import {privateKeyToAccount} from 'viem/accounts';
import { verifyAudit } from '../src/lib/policy';
afterEach(()=>vi.unstubAllEnvs());
describe('managed research job',()=>{
 it('uses the actual live quote response and never substitutes rehearsal prices',async()=>{
  const run=createRun({repos:['vercel/next.js'],mode:'live'});
  expect(()=>applyShock(run)).toThrow('refreshed provider quotes');
  const quotes=DEFAULT_PROVIDERS.map(p=>({...p,unitPriceAtomic:678901}));
  applyShock(run,quotes);
  await advanceRun(run,{...liveFixtureGateway,discover:async()=>quotes});
  await advanceRun(run,{...liveFixtureGateway,discover:async()=>quotes});
  expect(run.providers.map(p=>p.unitPriceAtomic)).toEqual([678901,678901]);
  await advanceRun(run,{...liveFixtureGateway,discover:async()=>quotes});
  expect(run.status).toBe('awaiting_approval');
  expect(run.approval?.proposedMandate.maxDataUnitPriceAtomic).toBe(678901);
  expect(run.receipts).toHaveLength(0);
 });
 it('buys evidence, commissions a checked report and pays two distinct rails',async()=>{
  const run=createRun({repos:['vercel/next.js','sveltejs/kit'],mode:'live'});
  for(let i=0;i<7;i++) await advanceRun(run,liveFixtureGateway);
  expect(run.status).toBe('completed');
  expect(run.report?.verified).toBe(true);
  expect(run.receipts).toHaveLength(2);
  expect(run.receipts.map(x=>x.network)).toEqual(['hedera:testnet','arc:testnet']);
  expect(run.receipts.every(x=>x.status==='settled'&&!!x.transactionId)).toBe(true);
  expect(verifyAudit(run.events)).toBe(true);
  await advanceRun(run,liveFixtureGateway);
  expect(run.receipts).toHaveLength(2);
 });
 it('blocks a changed price and resumes only after a bound approval',async()=>{
  const run=createRun({repos:['vercel/next.js'],mode:'live'});
  await advanceRun(run,liveFixtureGateway);
  await advanceRun(run,liveFixtureGateway);
  const quotes=DEFAULT_PROVIDERS.map(p=>({...p,unitPriceAtomic:400000}));
  const raised={...liveFixtureGateway,discover:async()=>quotes};
  applyShock(run,quotes);
  await advanceRun(run,raised);
  expect(run.status).toBe('awaiting_approval');
  expect(run.receipts).toHaveLength(0);
  expect(run.approval?.message).toContain(run.id);
  const signer=privateKeyToAccount(`0x${'11'.repeat(32)}`);vi.stubEnv('LEDGER_CONTROLLER_ADDRESS',signer.address);
  await approveRun(run,{signature:await signer.signMessage({message:run.approval!.message})});
  expect(run.mandate.version).toBe(2);
  await expect(approveRun(run,{})).rejects.toThrow();
  for(let i=0;i<5;i++) await advanceRun(run,liveFixtureGateway);
  expect(run.status).toBe('completed');
 });
 it('pause prevents the next payment',async()=>{
  const run=createRun({repos:['vercel/next.js'],mode:'live'});
  pauseRun(run);
  await advanceRun(run,liveFixtureGateway);
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
  const run=createRun({repos:['vercel/next.js'],mode:'live'});
  const bad={...liveFixtureGateway,purchaseData:async(input:Parameters<typeof liveFixtureGateway.purchaseData>[0])=>{
   const result=await liveFixtureGateway.purchaseData(input);result.receipt.amountAtomic=1;return result;
  }};
  for(let i=0;i<4;i++) await advanceRun(run,bad);
  expect(run.status).toBe('failed');
  expect(run.receipts).toHaveLength(0);
 });
});
