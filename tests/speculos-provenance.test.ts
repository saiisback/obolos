import {afterEach,describe,expect,it} from 'vitest';
import {privateKeyToAccount} from 'viem/accounts';
import {createRun,advanceRun,applyShock,approveRun} from '../src/lib/engine';
import {buildLiveOverview} from '../src/lib/live-readiness';
import {rehearsalGateway,DEFAULT_PROVIDERS} from '../src/lib/gateway';

afterEach(()=>{delete process.env.LEDGER_SIGNER_MODE;delete process.env.LEDGER_CONTROLLER_ADDRESS;});
async function pending(){
 const run=createRun({mode:'live',repos:['vercel/next.js']});
 const gateway={...rehearsalGateway,discover:async()=>DEFAULT_PROVIDERS.map(p=>({...p,unitPriceAtomic:400000}))};
 await advanceRun(run,gateway);await advanceRun(run,gateway);await advanceRun(run,gateway);return run;
}
describe('emulator provenance',()=>{
 it('binds emulator disclosure into signed text and saved proof',async()=>{
  process.env.LEDGER_SIGNER_MODE='speculos';
  const account=privateKeyToAccount(`0x${'11'.repeat(32)}`);
  process.env.LEDGER_CONTROLLER_ADDRESS=account.address;
  const run=await pending();
  expect(run.approval?.message).toContain('Speculos emulator');
  const signature=await account.signMessage({message:run.approval!.message});
  await approveRun(run,{signature});
  expect(run.authorizations?.[0].signerMode).toBe('speculos');
  expect(run.events.at(-1)?.detail).toContain('not physical');
 });
 it('rejects a mode change after the approval was issued',async()=>{
  process.env.LEDGER_SIGNER_MODE='speculos';
  const account=privateKeyToAccount(`0x${'11'.repeat(32)}`);
  process.env.LEDGER_CONTROLLER_ADDRESS=account.address;
  const run=await pending();
  const signature=await account.signMessage({message:run.approval!.message});
  process.env.LEDGER_SIGNER_MODE='usb';
  await expect(approveRun(run,{signature})).rejects.toThrow('signer mode');
 });
 it('discloses emulator configuration without claiming physical evidence',()=>{
  const result=buildLiveOverview({authenticated:true,env:{LEDGER_SIGNER_MODE:'speculos',LEDGER_CONTROLLER_ADDRESS:'0x'+'12'.repeat(20)},runs:[],health:{ready:false,integrations:[]},serviceReachable:false});
  expect(result.signerMode).toBe('speculos');
  expect(result.checks.find(c=>c.id==='controller')?.detail).toContain('Speculos');
  expect(result.checks.find(c=>c.id==='hardware')?.detail).toContain('not physical');
 });
});
