import {productionAccountTotals,type ProductionAccount} from './production-account';
import {canonicalJsonHash} from './service-contract';
type ValuationBinding={productionAccountHash:string;orderId:string;outputHash:string;transactionHash:string;seller:string;settlement:string;ledger:string;issuedAt:number;intermediateInputAtomic:string;resourceCostAtomic:string;costBreakdown:{paymentAtomic:string;gasAtomic:string;inferenceAtomic:string;otherAtomic:string}};
export function validateProductionValuation(v:ValuationBinding,account:{payload:ProductionAccount;evidenceHash:string}){
 const p=account.payload,t=productionAccountTotals(p);
 if(v.productionAccountHash!==account.evidenceHash||canonicalJsonHash(p)!==account.evidenceHash||(['orderId','outputHash','transactionHash','seller','settlement','ledger'] as const).some(k=>v[k]!==p[k])||v.issuedAt<p.issuedAt)throw Error('Valuation must bind the exact signed production account and output.');
 if(t.intermediateAtomic===null||t.resourceCostAtomic===null||t.resourceCostAtomic<=0n)throw Error('Productivity requires complete production inputs and positive complete resource costs.');
 const c=v.costBreakdown;
 if(BigInt(v.intermediateInputAtomic)!==t.intermediateAtomic||BigInt(v.resourceCostAtomic)!==t.resourceCostAtomic||BigInt(c.paymentAtomic)!==t.intermediateAtomic||c.gasAtomic!==p.gasAtomic||c.inferenceAtomic!==p.inferenceAtomic||c.otherAtomic!==p.otherResourceAtomic)throw Error('Valuation costs differ from the signed production account.');
}
