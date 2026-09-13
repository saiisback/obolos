import {z} from 'zod';
import {PlatformError} from '../platform/http';
const hash=z.string().regex(/^0x[0-9a-f]{64}$/);
const invalid=()=>new PlatformError(422,'INVALID_COST_RECEIPT','Cost observation requires the finalized seller delivery transaction.');
/** Arc native gas is USDC at 18 decimals; application accounts use 6. */
export function receiptCost(receipt:{transactionHash:string;from:string;to:string|null;status:string;blockNumber:bigint;gasUsed:bigint;effectiveGasPrice:bigint},expected:{seller:string;ledger:string;transactionHash:string;finalizedBlock:bigint}){
 if(receipt.transactionHash.toLowerCase()!==expected.transactionHash.toLowerCase()||receipt.from.toLowerCase()!==expected.seller.toLowerCase()||receipt.to?.toLowerCase()!==expected.ledger.toLowerCase()||receipt.status!=='success'||receipt.blockNumber>expected.finalizedBlock||receipt.gasUsed<0n||receipt.effectiveGasPrice<0n)throw invalid();
 const native=receipt.gasUsed*receipt.effectiveGasPrice,scale=10n**12n;
 return {transactionHash:hash.parse(receipt.transactionHash.toLowerCase()),gasUsed:receipt.gasUsed.toString(),effectiveGasPrice:receipt.effectiveGasPrice.toString(),nativeAtomic:native.toString(),nativeDecimals:18,amountAtomic:((native+scale-1n)/scale).toString(),asset:'USDC',decimals:6,rounding:'ceil-to-micro-USDC' as const};
}
export function providerUsage(category:string,output:unknown){
 if(category!=='inference')return null;
 const parsed=z.object({model:z.string(),promptTokens:z.number().int().nonnegative(),completionTokens:z.number().int().nonnegative(),requestId:z.string()}).safeParse(output);
 return parsed.success?{...parsed.data,cachedPromptTokens:null,costAtomic:null}:null;
}
