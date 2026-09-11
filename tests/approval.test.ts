import {describe,it,expect} from 'vitest';
import {privateKeyToAccount} from 'viem/accounts';
import {createRun,advanceRun,applyShock,approveRun} from '../src/lib/engine';
import {rehearsalGateway,DEFAULT_PROVIDERS} from './fixtures/gateway';
import {verifyMessage} from 'viem';
// Deliberately public deterministic test key. Never fund it or use it in a deployment.
const account=privateKeyToAccount(`0x${'11'.repeat(32)}`);
async function awaiting(){const run=createRun({repos:['vercel/next.js'],mode:'live'});const gateway={...rehearsalGateway,discover:async()=>DEFAULT_PROVIDERS.map(p=>({...p,unitPriceAtomic:400000}))};await advanceRun(run,gateway);await advanceRun(run,gateway);await advanceRun(run,gateway);return run;}
describe('controller signatures',()=>{
 it('accepts only a signature for the current run and consumes its nonce',async()=>{
  process.env.LEDGER_CONTROLLER_ADDRESS=account.address;
  try{
   const run=await awaiting(),other=await awaiting();
   const signature=await account.signMessage({message:run.approval!.message});
   await expect(approveRun(other,{signature})).rejects.toThrow('Signature');
   await approveRun(run,{signature});expect(run.status).toBe('running');expect(run.mandate.version).toBe(2);
   const proof=run.authorizations?.[0];expect(proof?.signature).toBe(signature);
   expect(proof?.previousMandate.version).toBe(1);expect(proof?.approvedMandate.version).toBe(2);
   expect(await verifyMessage({address:account.address,message:proof!.message,signature:proof!.signature as `0x${string}`})).toBe(true);
   expect(await verifyMessage({address:account.address,message:proof!.message+'altered',signature:proof!.signature as `0x${string}`})).toBe(false);
   await expect(approveRun(run,{signature})).rejects.toThrow('no pending');
  }finally{delete process.env.LEDGER_CONTROLLER_ADDRESS;}
 });
 it('rejects an expired approval even with the correct controller key',async()=>{
  process.env.LEDGER_CONTROLLER_ADDRESS=account.address;
  try{const run=await awaiting();run.approval!.expiresAt='2000-01-01T00:00:00Z';const signature=await account.signMessage({message:run.approval!.message});await expect(approveRun(run,{signature})).rejects.toThrow('expired');}
  finally{delete process.env.LEDGER_CONTROLLER_ADDRESS;}
 });
});
