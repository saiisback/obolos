import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { encodePaymentSignatureHeader, decodePaymentRequiredHeader } from '@x402/core/http';
const state=vi.hoisted(()=>({intents:new Set<string>(),settle:vi.fn(),verify:vi.fn(),updates:0}));
vi.mock('../src/lib/platform/hedera-commerce',()=>({hederaTokenConfig:async()=>({asset:'0.0.777',payTo:'0.0.10425234',unitPriceAtomic:2,decimals:0,symbol:'TEST',network:'hedera:testnet'}),scheduledRepositoryRequest:vi.fn()}));
vi.mock('../src/lib/platform/db',()=>({sql:()=>async(parts:TemplateStringsArray,...values:unknown[])=>{
  const text=parts.join('?');
  if(text.includes('SELECT provider_id'))return [{provider_id:'repo-standard',unit_price_atomic:100000},{provider_id:'repo-economy',unit_price_atomic:120000}];
  if(text.includes('INSERT INTO platform_service_payments')){const id=String(values[0]);if(state.intents.has(id))return [];state.intents.add(id);return [{transaction_id:id}];}
  if(text.includes("SET state='settled'")){state.updates++;return [];}
  throw new Error('Unexpected SQL');
}}));
vi.mock('@x402/core/server',()=>({HTTPFacilitatorClient:class{},x402ResourceServer:class{
  register(){return this;} async initialize(){} async buildPaymentRequirements(input:{price:{amount:string;asset:string};payTo:string}){return [{scheme:'exact',network:'hedera:testnet',asset:input.price.asset,amount:input.price.amount,payTo:input.payTo,maxTimeoutSeconds:60,extra:{feePayer:'0.0.7162784'}}];}
  verifyPayment(...args:unknown[]){return state.verify(...args);}settlePayment(...args:unknown[]){return state.settle(...args);}
}}));
vi.mock('@x402/hedera/exact/server',()=>({ExactHederaScheme:class{}}));
vi.mock('@x402/hedera',()=>({Transaction:{fromBytes:()=>({transactionId:{toString:()=> '0.0.7162784@1788900000.123456789'}})}}));
vi.mock('../src/lib/repository-service',async(importOriginal)=>{
  const original=await importOriginal<typeof import('../src/lib/repository-service')>();
  return {...original,fetchRepoEvidence:async(repos:string[])=>repos.map(repo=>({repo,sourceUrl:`https://api.github.com/repos/${repo}`,fetchedAt:new Date().toISOString()}))};
});
import { publicDataRequest } from '../src/lib/platform/data-service';
const endpoint='https://obolos.app/x402/evidence/repo-standard';
function request(repos=['octocat/Hello-World'],signature?:string){return new NextRequest(endpoint,{method:'POST',headers:{'content-type':'application/json',...(signature?{'payment-signature':signature}:{})},body:JSON.stringify({repos})});}
async function signedRequest(path=['evidence','repo-standard']){
  const unpaid=await publicDataRequest(request(),path);
  const challenge=decodePaymentRequiredHeader(unpaid.headers.get('payment-required')!);
  const payload={x402Version:2,resource:challenge.resource,accepted:challenge.accepts[0],payload:{transaction:Buffer.from('test-transaction').toString('base64')}};
  return {payload,signature:encodePaymentSignatureHeader(payload)};
}
beforeEach(()=>{state.intents.clear();state.updates=0;state.verify.mockReset().mockResolvedValue({isValid:true,payer:'0.0.777'});state.settle.mockReset().mockResolvedValue({success:true,payer:'0.0.777',network:'hedera:testnet',transaction:'0.0.7162784@1788900000.123456789'});vi.stubEnv('APP_ORIGIN','https://obolos.app');vi.stubEnv('HEDERA_PAY_TO','0.0.10425234');});
afterEach(()=>vi.unstubAllEnvs());
describe('native metered Hedera service',()=>{
  it('offers explicitly metered HTS terms without changing the native HBAR route',async()=>{
    const result=await publicDataRequest(request(['octocat/Hello-World','vercel/next.js']),['hts','evidence','repo-standard']);
    expect(result.status).toBe(402);
    const challenge=decodePaymentRequiredHeader(result.headers.get('payment-required')!);
    expect(challenge.accepts[0].asset).toBe('0.0.777');expect(challenge.accepts[0].amount).toBe('4');
    expect(challenge.resource?.url).toBe('https://obolos.app/x402/hts/evidence/repo-standard');
    expect(state.settle).not.toHaveBeenCalled();
  });

  it('returns real-format metered402 and makes no settlement for an unpaid request',async()=>{
    const result=await publicDataRequest(request(['octocat/Hello-World','vercel/next.js']),['evidence','repo-standard']);
    expect(result.status).toBe(402);const challenge=decodePaymentRequiredHeader(result.headers.get('payment-required')!);
    expect(challenge.accepts[0].amount).toBe('200000');expect(challenge.accepts[0].payTo).toBe('0.0.10425234');expect(state.settle).not.toHaveBeenCalled();
  });
  it('rejects changed payment price before verification or settlement',async()=>{
    const {payload}=await signedRequest();payload.accepted.amount='1';
    const result=await publicDataRequest(request(undefined,encodePaymentSignatureHeader(payload)),['evidence','repo-standard']);
    expect(result.status).toBe(402);expect(state.verify).not.toHaveBeenCalled();expect(state.settle).not.toHaveBeenCalled();
  });
  it('settles one native transaction once across duplicate requests',async()=>{
    const {signature}=await signedRequest();
    const results=await Promise.all([publicDataRequest(request(undefined,signature),['evidence','repo-standard']),publicDataRequest(request(undefined,signature),['evidence','repo-standard'])]);
    expect(results.map(r=>r.status).sort()).toEqual([200,409]);expect(state.settle).toHaveBeenCalledTimes(1);expect(state.updates).toBe(1);
  });
  it('retains an uncertain intent and refuses another settlement attempt',async()=>{
    const {signature}=await signedRequest();state.settle.mockRejectedValueOnce(Error('Unknown external outcome'));
    expect((await publicDataRequest(request(undefined,signature),['evidence','repo-standard'])).status).toBe(503);
    expect((await publicDataRequest(request(undefined,signature),['evidence','repo-standard'])).status).toBe(409);
    expect(state.settle).toHaveBeenCalledTimes(1);expect(state.updates).toBe(0);
  });
  it.each([{transaction:'0.0.7162784@1788900001.123456789'},{payer:'0.0.888'},{payer:undefined}])('does not mark a mismatched successful settlement %j as paid',async mutation=>{
    const {signature}=await signedRequest();state.settle.mockResolvedValueOnce({success:true,payer:'0.0.777',network:'hedera:testnet',transaction:'0.0.7162784@1788900000.123456789',...mutation});
    expect((await publicDataRequest(request(undefined,signature),['evidence','repo-standard'])).status).toBe(502);expect(state.updates).toBe(0);expect(state.intents.size).toBe(1);
    expect((await publicDataRequest(request(undefined,signature),['evidence','repo-standard'])).status).toBe(409);expect(state.settle).toHaveBeenCalledTimes(1);
  });
  it('does not dispatch payment without a verified native payer',async()=>{const {signature}=await signedRequest();state.verify.mockResolvedValueOnce({isValid:true});expect((await publicDataRequest(request(undefined,signature),['evidence','repo-standard'])).status).toBe(402);expect(state.settle).not.toHaveBeenCalled();expect(state.intents.size).toBe(0);});
  it('preserves the reserved HTS intent when settlement payer differs',async()=>{const path=['hts','evidence','repo-standard'],{signature}=await signedRequest(path);state.settle.mockResolvedValueOnce({success:true,payer:'0.0.888',network:'hedera:testnet',transaction:'0.0.7162784@1788900000.123456789'});expect((await publicDataRequest(request(undefined,signature),path)).status).toBe(502);expect(state.updates).toBe(0);expect(state.intents.size).toBe(1);});
  it('accepts normalized mirror-format identity for the exact signed native transaction',async()=>{const {signature}=await signedRequest();state.settle.mockResolvedValueOnce({success:true,payer:'0.0.777',network:'hedera:testnet',transaction:'0.0.7162784-1788900000-123456789'});expect((await publicDataRequest(request(undefined,signature),['evidence','repo-standard'])).status).toBe(200);expect(state.updates).toBe(1);});
});
