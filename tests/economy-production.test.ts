import {describe,expect,it} from 'vitest';
import {keccak256,toHex} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {authenticateProductionAccount,productionAccountMessage,productionAccountSchema,productionAccountTotals,type ProductionAccount} from '../src/lib/economy/production-account';
import {canonicalJsonHash} from '../src/lib/economy/service-contract';

// Public deterministic test keys: never connected to any wallet provider or RPC.
const seller=privateKeyToAccount(`0x${'11'.repeat(32)}`),stranger=privateKeyToAccount(`0x${'22'.repeat(32)}`);
const hash=(s:string)=>keccak256(toHex(s)),now=1_800_000_000;
const deployment={settlement:`0x${'a'.repeat(40)}`,ledger:`0x${'b'.repeat(40)}`};
const payload=(patch:Partial<ProductionAccount>={}):ProductionAccount=>({
 protocol:'obolos.production-account.v1',chainId:5042002,...deployment,orderId:hash('test-output'),transactionHash:hash('test-paid'),outputHash:hash('test-result'),seller:seller.address.toLowerCase(),issuedAt:now,
 inputs:[],externalIntermediateAtomic:'0',gasAtomic:'0',inferenceAtomic:'0',otherResourceAtomic:'0',allIntermediateInputsIncluded:true,allResourcesIncluded:true,sourceReference:'https://evidence.test/account.json',sourceHash:hash('test-evidence'),...patch,
});
const sign=async(p:ProductionAccount,account=seller)=>({payload:p,signature:await account.signMessage({message:productionAccountMessage(p)})});

describe('producer accounting authentication and completeness',()=>{
 it('verifies a real seller signature and binds every payload field',async()=>{
  const p=payload(),record=await sign(p);
  expect(await authenticateProductionAccount(record,deployment,now)).toMatchObject({evidenceHash:canonicalJsonHash(p),payload:p});
  await expect(authenticateProductionAccount({...record,payload:{...p,gasAtomic:'1'}},deployment,now)).rejects.toThrow('signature');
  await expect(authenticateProductionAccount(await sign(p,stranger),deployment,now)).rejects.toThrow('signature');
 });
 it('distinguishes an explicitly complete zero from missing accounting',()=>{
  expect(productionAccountTotals(payload())).toEqual({intermediateAtomic:0n,resourceCostAtomic:0n});
  expect(productionAccountTotals(payload({allIntermediateInputsIncluded:false,allResourcesIncluded:false}))).toEqual({intermediateAtomic:null,resourceCostAtomic:null});
  expect(productionAccountTotals(payload({allResourcesIncluded:false}))).toEqual({intermediateAtomic:0n,resourceCostAtomic:null});
  expect(()=>productionAccountTotals(payload({allIntermediateInputsIncluded:false}))).toThrow('Complete resource accounting');
 });
 it('adds actual linked and external inputs once into resource costs',()=>{
  expect(productionAccountTotals(payload({inputs:[{orderId:hash('test-input'),amountAtomic:'20'}],externalIntermediateAtomic:'5',gasAtomic:'3',inferenceAtomic:'4',otherResourceAtomic:'2'}))).toEqual({intermediateAtomic:25n,resourceCostAtomic:34n});
 });
 it.each(['settlement','ledger'] as const)('rejects a signature for another %s deployment',async(field)=>{
  await expect(authenticateProductionAccount(await sign(payload({[field]:`0x${'c'.repeat(40)}`})),deployment,now)).rejects.toThrow('different deployment');
 });
 it('rejects future and stale signatures while allowing the exact freshness boundary',async()=>{
  await expect(authenticateProductionAccount(await sign(payload({issuedAt:now+1})),deployment,now)).rejects.toThrow('last day');
  await expect(authenticateProductionAccount(await sign(payload({issuedAt:now-86401})),deployment,now)).rejects.toThrow('last day');
  await expect(authenticateProductionAccount(await sign(payload({issuedAt:now-86400})),deployment,now)).resolves.toHaveProperty('evidenceHash');
 });
 it('rejects duplicate inputs, self consumption, and zero linked allocation',async()=>{
  const input={orderId:hash('test-input'),amountAtomic:'1'};
  await expect(authenticateProductionAccount(await sign(payload({inputs:[input,input]})),deployment,now)).rejects.toThrow('distinct');
  await expect(authenticateProductionAccount(await sign(payload({inputs:[{...input,orderId:payload().orderId}]})),deployment,now)).rejects.toThrow('distinct');
  expect(productionAccountSchema.safeParse(payload({inputs:[{...input,amountAtomic:'0'}]})).success).toBe(false);
 });
 it('cannot manufacture verified final output or independent verification through producer fields',async()=>{
  for(const field of ['verifiedFinalOutputAtomic','finalOutputAtomic','independentlyVerified']){
   const p={...payload(),[field]:'1000000'};
   await expect(authenticateProductionAccount(await sign(p),deployment,now)).rejects.toThrow();
  }
  expect(productionAccountSchema.safeParse({...payload(),chainId:1}).success).toBe(false);
  expect(productionAccountSchema.safeParse(payload({sourceReference:'http://evidence.test/account'})).success).toBe(false);
  expect(Object.keys(productionAccountTotals(payload())).sort()).toEqual(['intermediateAtomic','resourceCostAtomic']);
 });
});
