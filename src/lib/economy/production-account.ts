import {z} from 'zod';
import {verifyMessage,type Hex} from 'viem';
import {canonicalJson,canonicalJsonHash} from './service-contract';
const hash=z.string().regex(/^0x[0-9a-f]{64}$/),address=z.string().regex(/^0x[0-9a-f]{40}$/),atomic=z.string().max(78).regex(/^(0|[1-9][0-9]*)$/);
export const productionAccountSchema=z.object({protocol:z.literal('obolos.production-account.v1'),chainId:z.literal(5042002),settlement:address,ledger:address,orderId:hash,transactionHash:hash,outputHash:hash,seller:address,issuedAt:z.number().int().nonnegative(),inputs:z.array(z.object({orderId:hash,amountAtomic:atomic.refine(v=>BigInt(v)>0n)}).strict()).max(64),externalIntermediateAtomic:atomic,gasAtomic:atomic,inferenceAtomic:atomic,otherResourceAtomic:atomic,allIntermediateInputsIncluded:z.boolean(),allResourcesIncluded:z.boolean(),sourceReference:z.string().url().max(512).refine(v=>v.startsWith('https://'),'Use a public HTTPS evidence reference'),sourceHash:hash}).strict();
export type ProductionAccount=z.infer<typeof productionAccountSchema>;
export function productionAccountMessage(payload:ProductionAccount){return 'Obolos production accounting v1\n'+canonicalJson(payload);}
export function productionAccountTotals(p:ProductionAccount){
 if(new Set(p.inputs.map(i=>i.orderId)).size!==p.inputs.length||p.inputs.some(i=>i.orderId===p.orderId))throw Error('Input orders must be distinct from each other and the output sale.');
 if(p.allResourcesIncluded&&!p.allIntermediateInputsIncluded)throw Error('Complete resource accounting requires complete intermediate inputs.');
 const intermediate=p.inputs.reduce((n,i)=>n+BigInt(i.amountAtomic),BigInt(p.externalIntermediateAtomic));
 return {intermediateAtomic:p.allIntermediateInputsIncluded?intermediate:null,resourceCostAtomic:p.allResourcesIncluded?intermediate+BigInt(p.gasAtomic)+BigInt(p.inferenceAtomic)+BigInt(p.otherResourceAtomic):null};
}
export async function authenticateProductionAccount(input:unknown,deployment:{settlement:string;ledger:string},now=Math.floor(Date.now()/1000)){
 const record=z.object({payload:productionAccountSchema,signature:z.string().regex(/^0x[0-9a-fA-F]{130}$/)}).strict().parse(input),p=record.payload;
 if(p.settlement!==deployment.settlement.toLowerCase()||p.ledger!==deployment.ledger.toLowerCase())throw Error('Accounting belongs to a different deployment.');
 if(p.issuedAt>now||p.issuedAt<now-86400)throw Error('Accounting signature must be issued within the last day.');
 productionAccountTotals(p);
 if(!await verifyMessage({address:p.seller as Hex,message:productionAccountMessage(p),signature:record.signature as Hex}))throw Error('Producer signature does not match the seller.');
 return {...record,evidenceHash:canonicalJsonHash(p)};
}
