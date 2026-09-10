import { verifyMessage } from 'viem';
import { z } from 'zod';
import { verificationServiceSchema } from '../market/contracts';

export const repositoryScope = z.array(z.string().max(140).regex(/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}$/).refine(v=>!['.','..'].includes(v.split('/')[1]))).min(1).max(3).refine(v=>new Set(v.map(s=>s.toLowerCase())).size===v.length);
export const mandateFieldsSchema = z.object({
  id:z.uuid(),agentId:z.uuid(),owner:z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  origin:z.url().refine(v=>{try{return new URL(v).origin===v && ['http:','https:'].includes(new URL(v).protocol);}catch{return false;}}),
  repos:repositoryScope,allowedProviders:z.array(z.enum(['repo-standard','repo-economy'])).min(1).max(2).refine(v=>new Set(v).size===v.length),
  dataBudgetAtomic:z.number().int().min(1).max(100000000),verificationBudgetAtomic:z.number().int().min(1).max(1000000),
  maxDataUnitPriceAtomic:z.number().int().min(1).max(100000000),maxRuns:z.number().int().min(1).max(10),expiresAt:z.iso.datetime(),
  verificationService:verificationServiceSchema.optional(),
});
export type MandateFields=Omit<z.infer<typeof mandateFieldsSchema>,'allowedProviders'> & {allowedProviders:string[]};
export type SignedMandate=MandateFields & {message:string;signature:string};
export function mandateMessage(m:MandateFields) {
  return [`Obolos isolated runner spending mandate ${m.verificationService&&'execution' in m.verificationService?'v3':m.verificationService?'v2':'v1'}`,`Origin: ${m.origin}`,`Mandate: ${m.id}`,`Agent: ${m.agentId}`,`Owner: ${m.owner.toLowerCase()}`,
    'Signing provenance: wallet',`Repositories: ${JSON.stringify(m.repos)}`,`Allowed providers: ${JSON.stringify(m.allowedProviders)}`,
    `Maximum HBAR atomic units per repository: ${m.maxDataUnitPriceAtomic}`,`HBAR atomic units per run: ${m.dataBudgetAtomic}`,
    `USDC atomic units per run: ${m.verificationBudgetAtomic}`,`Maximum runs: ${m.maxRuns}`,
    `Total HBAR atomic units: ${m.dataBudgetAtomic*m.maxRuns}`,`Total USDC atomic units: ${m.verificationBudgetAtomic*m.maxRuns}`,
    ...(m.verificationService?[`Verification service: ${JSON.stringify({id:m.verificationService.id,revision:m.verificationService.revision,name:m.verificationService.name,recipient:m.verificationService.recipient,priceAtomic:m.verificationService.priceAtomic,endpoint:m.verificationService.endpoint,...('execution' in m.verificationService?{execution:m.verificationService.execution,providerEndpoint:m.verificationService.providerEndpoint}:{})})}`]:[]),
    `Expires: ${m.expiresAt}`,'Network scope: Hedera testnet and Arc testnet only.',
    'I authorize my paired runner to execute only this scope. This is spending approval, not an identity login.'].join('\n');
}
export const signedMandateSchema=mandateFieldsSchema.extend({message:z.string().max(5000),signature:z.string().regex(/^0x[0-9a-fA-F]{130}$/)}).strict();
export async function validateSignedMandate(value:unknown,pin:{owner:string;agentId:string;origin:string;now?:Date}):Promise<boolean> {
  const parsed=signedMandateSchema.safeParse(value);
  if(!parsed.success)return false;
  const m=parsed.data,now=(pin.now??new Date()).getTime(),expiry=Date.parse(m.expiresAt);
  if(m.owner.toLowerCase()!==pin.owner.toLowerCase()||m.agentId!==pin.agentId||m.origin!==pin.origin||expiry<=now||expiry>now+86400000||m.message!==mandateMessage(m))return false;
  if(m.verificationService&&(m.verificationService.endpoint!==`${m.origin}/api/market/services/${m.verificationService.id}`||m.verificationService.priceAtomic>m.verificationBudgetAtomic))return false;
  try{return await verifyMessage({address:m.owner as `0x${string}`,message:m.message,signature:m.signature as `0x${string}`});}catch{return false;}
}
