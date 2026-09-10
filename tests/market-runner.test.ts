import { expect,it } from 'vitest';
import {randomUUID} from 'node:crypto';
import {privateKeyToAccount} from 'viem/accounts';
import {mandateMessage,validateSignedMandate,type MandateFields} from '../src/lib/platform/execution-contracts';
import {createRun,advanceRun} from '../src/lib/engine';
import {rehearsalGateway,type Gateway} from '../src/lib/gateway';
const account=privateKeyToAccount(`0x${'29'.repeat(32)}`);
function fields():MandateFields{return {id:randomUUID(),agentId:randomUUID(),owner:account.address,origin:'https://obolos.app',repos:['owner/repo'],allowedProviders:['repo-standard'],dataBudgetAtomic:100000,verificationBudgetAtomic:100000,maxDataUnitPriceAtomic:100000,maxRuns:1,expiresAt:new Date(Date.now()+3600000).toISOString()};}
function service(){const id=randomUUID();return {id,revision:1,name:'Metrics verifier',recipient:`0x${'38'.repeat(20)}`,priceAtomic:60000,endpoint:`https://obolos.app/api/market/services/${id}`};}
it('retains the legacy mandate bytes and binds every selected seller term in v2',async()=>{
 const m=fields();expect(mandateMessage(m).split('\n')[0]).toBe('Obolos isolated runner spending mandate v1');
 const selected={...m,verificationService:service()},message=mandateMessage(selected);
 expect(message).toContain('v2');expect(message).toContain(selected.verificationService.recipient);
 const signed={...selected,message,signature:await account.signMessage({message})};
 expect(await validateSignedMandate(signed,m)).toBe(true);
 const reordered=Object.fromEntries(Object.entries(signed.verificationService).reverse());
 expect(await validateSignedMandate({...signed,verificationService:reordered},m)).toBe(true);
 for(const change of [{recipient:account.address},{priceAtomic:60001},{revision:2},{endpoint:'https://attacker.example/pay'}]){
  expect(await validateSignedMandate({...signed,verificationService:{...selected.verificationService,...change}},m)).toBe(false);
 }
 const hostile={...selected,verificationService:{...selected.verificationService,endpoint:'https://attacker.example/pay'}};
 const hostileMessage=mandateMessage(hostile);
 expect(await validateSignedMandate({...hostile,message:hostileMessage,signature:await account.signMessage({message:hostileMessage})},m)).toBe(false);
});
it('the engine pays the selected seller price instead of the legacy fixed fee',async()=>{
 const m={...fields(),verificationService:service()},run=createRun({mode:'live',repos:m.repos,mandate:m});let amount=0;
 const gateway:Gateway={...rehearsalGateway,async purchaseData(input){const r=await rehearsalGateway.purchaseData(input);return {...r,receipt:{...r.receipt,mode:'live',status:'settled',transactionId:'hbar-fixture'}};},async verify(input){amount=input.maxAmountAtomic;const r=await rehearsalGateway.verify(input);return {...r,receipt:{...r.receipt,amountAtomic:amount,mode:'live',status:'settled',transactionId:'arc-fixture'},checks:[{label:'Paid verifier',passed:true,detail:'Fixture check'}]};}};
 for(let i=0;i<5;i++)await advanceRun(run,gateway);
 expect(amount).toBe(60000);expect(run.verificationSpentAtomic).toBe(60000);expect(run.status).toBe('completed');
});
