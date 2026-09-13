import {describe,it,expect} from 'vitest';
import {validateProductionValuation} from '../src/lib/economy/production-valuation';
import type {ProductionAccount} from '../src/lib/economy/production-account';
import {canonicalJsonHash} from '../src/lib/economy/service-contract';
const hash=(s:string)=>`0x${s.repeat(64)}`,address=(s:string)=>`0x${s.repeat(40)}`;
const p:ProductionAccount={protocol:'obolos.production-account.v1',chainId:5042002,settlement:address('1'),ledger:address('2'),orderId:hash('a'),transactionHash:hash('b'),outputHash:hash('c'),seller:address('3'),issuedAt:90,inputs:[],externalIntermediateAtomic:'20',gasAtomic:'5',inferenceAtomic:'10',otherResourceAtomic:'3',allIntermediateInputsIncluded:true,allResourcesIncluded:true,sourceReference:'https://evidence.test/costs',sourceHash:hash('d')};
const v={productionAccountHash:canonicalJsonHash(p),orderId:p.orderId,outputHash:p.outputHash,transactionHash:p.transactionHash,seller:p.seller,settlement:p.settlement,ledger:p.ledger,issuedAt:100,intermediateInputAtomic:'20',resourceCostAtomic:'38',costBreakdown:{paymentAtomic:'20',gasAtomic:'5',inferenceAtomic:'10',otherAtomic:'3'}};
describe('valuation bound to actual producer costs',()=>{
 it('uses intermediate inputs, not the buyer purchase price, in production cost',()=>expect(()=>validateProductionValuation(v,{payload:p,evidenceHash:canonicalJsonHash(p)})).not.toThrow());
 it.each([{productionAccountHash:hash('f')},{outputHash:hash('f')},{intermediateInputAtomic:'0'},{resourceCostAtomic:'100'},{issuedAt:80},{costBreakdown:{...v.costBreakdown,paymentAtomic:'100'}}])('rejects detached or changed accounting %j',patch=>expect(()=>validateProductionValuation({...v,...patch},{payload:p,evidenceHash:canonicalJsonHash(p)})).toThrow());
 it('requires a complete producer account and positive total cost',()=>{for(const patch of [{allResourcesIncluded:false},{allIntermediateInputsIncluded:false},{externalIntermediateAtomic:'0',gasAtomic:'0',inferenceAtomic:'0',otherResourceAtomic:'0'}])expect(()=>validateProductionValuation(v,{payload:{...p,...patch},evidenceHash:canonicalJsonHash(p)})).toThrow();});
});
