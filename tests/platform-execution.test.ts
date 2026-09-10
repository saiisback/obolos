import { describe, expect, it } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import { mandateMessage, validateSignedMandate, type SignedMandate } from '@/lib/platform/execution-contracts';
const account = privateKeyToAccount(`0x${'17'.repeat(32)}`);
const fields = { id:'11111111-1111-4111-8111-111111111111', agentId:'22222222-2222-4222-8222-222222222222', owner:account.address, origin:'https://obolos.example', repos:['openai/codex'], allowedProviders:['repo-standard','repo-economy'], dataBudgetAtomic:2000000, verificationBudgetAtomic:100000, maxDataUnitPriceAtomic:150000, maxRuns:2, expiresAt:'2026-09-10T01:00:00.000Z' };
const now = new Date('2026-09-10T00:00:00.000Z');
async function signed(): Promise<SignedMandate> { const message=mandateMessage(fields); return {...fields,message,signature:await account.signMessage({message})}; }
describe('runner spending mandate',()=>{
 it('verifies the exact owner and canonical scope',async()=>{expect(await validateSignedMandate(await signed(), {...fields,now})).toBe(true);});
 it('rejects tampering with all material execution fields',async()=>{const m=await signed(); for(const changed of [{agentId:m.id},{owner:'0x'+'12'.repeat(20)},{origin:'https://evil.example'},{repos:['evil/repo']},{allowedProviders:['repo-economy']},{dataBudgetAtomic:3000000},{verificationBudgetAtomic:200000},{maxDataUnitPriceAtomic:200000},{maxRuns:3},{expiresAt:'2026-09-10T02:00:00.000Z'},{message:m.message+'\nextra'}]) expect(await validateSignedMandate({...m,...changed},{...fields,now})).toBe(false);});
 it('rejects expired mandates and a different configured owner/agent/origin',async()=>{const m=await signed(); expect(await validateSignedMandate(m,{...fields,now:new Date(m.expiresAt)})).toBe(false); for(const pin of [{owner:'0x'+'12'.repeat(20)},{agentId:m.id},{origin:'https://evil.example'}]) expect(await validateSignedMandate(m,{...fields,...pin,now})).toBe(false);});
 it('rejects signatures from a different EOA',async()=>{const m=await signed(); const other=privateKeyToAccount(`0x${'18'.repeat(32)}`); m.signature=await other.signMessage({message:m.message}); expect(await validateSignedMandate(m,{...fields,now})).toBe(false);});
});

import { validateRunnerResult } from '@/lib/platform/execution';
import { createRun } from '@/lib/engine';
function failedResult(m:SignedMandate) {const result=createRun({mode:'live',repos:m.repos});result.id=m.id;result.status='failed';result.error='Broker unavailable';result.mandate={dataBudgetAtomic:m.dataBudgetAtomic,verificationBudgetAtomic:m.verificationBudgetAtomic,maxDataUnitPriceAtomic:m.maxDataUnitPriceAtomic,allowedProviders:m.allowedProviders,expiresAt:m.expiresAt,version:1};return result;}
describe('runner result boundary',()=>{
 it('accepts an exact no-spend failed result',async()=>{const m=await signed(),r=failedResult(m);expect(validateRunnerResult(r,{id:m.id,repos:m.repos,mandate:m}).status).toBe('failed');});
 it('rejects a different job, repos, simulated mode or increased mandate',async()=>{const m=await signed(),r=failedResult(m);for(const changed of [{id:m.agentId},{repos:['other/repo']},{mode:'rehearsal'},{mandate:{...r.mandate,dataBudgetAtomic:99999999}},{dataSpentAtomic:1},{authorizations:[{}]}])expect(()=>validateRunnerResult({...r,...changed},{id:m.id,repos:m.repos,mandate:m})).toThrow();});
 it('rejects receipts from another job or above approved spend',async()=>{const m=await signed(),r=failedResult(m);const receipt={id:'test',requestId:'other:data',mode:'live',network:'hedera:testnet',asset:'HBAR',amountAtomic:100000,units:1,provider:'repo-standard',status:'settled',timestamp:new Date().toISOString(),transactionId:'0.0.123@1234567890.000000001'};expect(()=>validateRunnerResult({...r,receipts:[receipt],dataSpentAtomic:100000},{id:m.id,repos:m.repos,mandate:m})).toThrow();});
});

it('rejects an altered event chain',async()=>{const m=await signed(),r=failedResult(m);r.events[0].detail='Altered';expect(()=>validateRunnerResult(r,{id:m.id,repos:m.repos,mandate:m})).toThrow();});
it('accepts matched live receipts and replaces supplied explorer destinations',async()=>{
 const m=await signed(),r=failedResult(m),time=new Date().toISOString();
 r.selectedProvider='repo-standard';r.dataSpentAtomic=100000;r.verificationSpentAtomic=50000;
 r.evidence=[{repo:'openai/codex',description:'Repository',stars:1,forks:1,openIssues:1,pushedAt:time,language:'TypeScript',license:'MIT',sourceUrl:'https://api.github.com/repos/openai/codex',fetchedAt:time}];
 r.receipts=[{id:'data',requestId:`${r.id}:data`,mode:'live',network:'hedera:testnet',asset:'HBAR',amountAtomic:100000,units:1,provider:'repo-standard',status:'settled',timestamp:time,transactionId:'0.0.123@1234567890.000000001',explorerUrl:'https://evil.example'},{id:'verify',requestId:`${r.id}:verify`,mode:'live',network:'arc:testnet',asset:'USDC',amountAtomic:50000,units:1,provider:'arc-verifier',status:'settled',timestamp:time,transactionId:`0x${'12'.repeat(32)}`,explorerUrl:'https://evil.example'}];
 r.report={title:'Report',summary:'Summary',recommendation:'Check evidence',evidence:r.evidence,generatedBy:'model',createdAt:time,checks:[{label:'source',passed:true,detail:'Matches'}],verified:true};r.status='completed';r.stage='complete';
 r.report.checks=Array.from({length:54},(_,i)=>({label:`Check ${i}`,passed:true,detail:'50 provider checks plus 4 local checks'}));
 const checked=validateRunnerResult(r,{id:m.id,repos:m.repos,mandate:m});
 expect(()=>validateRunnerResult({...r,report:{...r.report,checks:[...r.report!.checks,{label:'Excess',passed:true,detail:''}]}},{id:m.id,repos:m.repos,mandate:m})).toThrow();expect(checked.status).toBe('succeeded');expect(checked.result.receipts[0].explorerUrl).toBe('https://hashscan.io/testnet/transaction/0.0.123%401234567890.000000001');expect(checked.result.receipts[1].explorerUrl).toBe(`https://testnet.arcscan.app/tx/0x${'12'.repeat(32)}`);
});
it('rejects a verification receipt below the actual fixed fee',async()=>{const m=await signed(),r=failedResult(m);r.receipts=[{id:'verify',requestId:`${r.id}:verify`,mode:'live',network:'arc:testnet',asset:'USDC',amountAtomic:0,units:1,provider:'arc-verifier',status:'settled',timestamp:new Date().toISOString(),transactionId:`0x${'12'.repeat(32)}`}];expect(()=>validateRunnerResult(r,{id:m.id,repos:m.repos,mandate:m})).toThrow();});
