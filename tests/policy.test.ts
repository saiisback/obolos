import { describe, it, expect } from 'vitest';
import { assessQuote, appendAudit, verifyAudit } from '../src/lib/policy';
import type { Mandate, Provider } from '../src/lib/contracts';
const mandate: Mandate = {dataBudgetAtomic:600000,maxDataUnitPriceAtomic:150000,verificationBudgetAtomic:50000,allowedProviders:['repo-standard'],expiresAt:'2030-01-01T00:00:00.000Z',version:1};
const provider: Provider = {id:'repo-standard',name:'Repository Signals',description:'',network:'hedera:testnet',asset:'HBAR',unit:'repository',unitPriceAtomic:100000};
describe('spending mandate',()=>{
 it('permits a bounded quote and denies cumulative budget exhaustion',()=>{
  expect(assessQuote(mandate,provider,3,0).allowed).toBe(true);
  expect(assessQuote(mandate,provider,3,400000)).toMatchObject({allowed:false,code:'budget'});
 });
 it('denies a provider price increase even when total budget remains',()=>{
  expect(assessQuote(mandate,{...provider,unitPriceAtomic:200000},1,0)).toMatchObject({allowed:false,code:'price'});
 });
 it('denies an unapproved provider, wrong network and expired authority',()=>{
  expect(assessQuote(mandate,{...provider,id:'attacker'},1,0).allowed).toBe(false);
  expect(assessQuote(mandate,{...provider,network:'hedera:mainnet'},1,0).allowed).toBe(false);
  expect(assessQuote({...mandate,expiresAt:'2000-01-01'},provider,1,0).allowed).toBe(false);
 });
 it('rejects negative, fractional and overflow costs',()=>{
  for(const cost of [-1,0,0.5,Number.MAX_SAFE_INTEGER]) expect(assessQuote(mandate,{...provider,unitPriceAtomic:cost},3,0).allowed).toBe(false);
 });
});
describe('audit evidence',()=>{
 it('detects a rewritten or removed event',()=>{
  const one=appendAudit([],'planner','info','Discovery','Two providers');
  const two=appendAudit(one,'broker','success','Payment','300000 tinybar');
  expect(verifyAudit(two)).toBe(true);
  expect(verifyAudit([{...two[0],detail:'Altered'},two[1]])).toBe(false);
  expect(verifyAudit([two[1]])).toBe(false);
 });
});
