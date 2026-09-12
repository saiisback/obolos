import {z} from 'zod';
import {createUaid} from './identity';
const account=z.string().regex(/^0\.0\.[1-9]\d*$/);
const transactionId=z.string().regex(/^0\.0\.[1-9]\d*@\d{10,}\.\d{1,9}(?:\?scheduled)?$/);
const timestamp=z.string().regex(/^\d{10,}\.\d{9}$/);
const atomic=z.union([z.number().int().positive().max(Number.MAX_SAFE_INTEGER),z.string().regex(/^[1-9]\d{0,19}$/)]);
const anchor=z.object({network:z.literal('hedera:2'),topicId:account,transactionId,sequenceNumber:z.string().regex(/^[1-9]\d*$/),consensusTimestamp:timestamp,mirrorUrl:z.string()}).refine(value=>value.mirrorUrl===`https://testnet.mirrornode.hedera.com/api/v1/topics/${value.topicId}/messages/${value.sequenceNumber}`&&!value.transactionId.endsWith('?scheduled'));
const canonical=z.object({registry:z.string().min(1).max(500),name:z.string().min(1).max(500),version:z.string().min(1).max(50),protocol:z.string().min(1).max(50),nativeId:z.string().min(1).max(500),skills:z.array(z.number().int().nonnegative()).max(64)});
const identity=z.object({version:z.literal(1),canonical,uaid:z.string().min(1).max(600).regex(/^uaid:aid:[1-9A-HJ-NP-Za-km-z]+;uid=[^;\s]+;registry=[^;\s]+;proto=[^;\s]+;nativeId=[^;\s]+(?:;domain=[^;\s]+)?$/),submitKey:z.object({type:z.enum(['ED25519','ECDSA_SECP256K1']),key:z.string().regex(/^[a-f0-9]{64}(?:[a-f0-9]{2})?$/i)}),topicId:account.optional(),profileAnchor:anchor.optional()}).refine(value=>{try{return value.uaid.split(';')[0]===createUaid(value.canonical).split(';')[0]&&(!value.profileAnchor||value.profileAnchor.topicId===value.topicId)&&(value.submitKey.type==='ED25519'?value.submitKey.key.length===64:value.submitKey.key.length===66);}catch{return false;}});
const hts=z.object({asset:account,payTo:account,unitPriceAtomic:z.number().int().positive().max(100000000),decimals:z.number().int().min(0).max(8),symbol:z.string().min(1).max(12),network:z.literal('hedera:testnet')});
const receipt=z.object({mode:z.literal('live'),network:z.literal('hedera:testnet'),asset:z.literal('HBAR'),amountAtomic:atomic,units:z.number().int().positive().max(3),provider:z.enum(['repo-standard','repo-economy']),status:z.literal('settled'),timestamp:z.iso.datetime({offset:true}),transactionId});
const scheduledProof=z.object({scheduleId:account,consensusTimestamp:timestamp,payer:account,payTo:account,amountAtomic:atomic,network:z.literal('hedera:testnet'),asset:z.literal('HBAR'),round:z.number().int().nonnegative().max(9)});
const release=z.object({checkedAt:z.iso.datetime({offset:true}),a2a:z.object({receipt,offerId:z.string().min(1).max(120)}).optional(),hts:z.object({transactionId,asset:account,amountAtomic:atomic,payer:account,payTo:account}).optional(),schedules:z.array(z.object({scheduleId:account,transactionId,proof:scheduledProof}).refine(value=>value.scheduleId===value.proof.scheduleId&&value.transactionId.endsWith('?scheduled'))).max(10).optional(),audit:anchor.optional()});
function publicValue<T>(schema:z.ZodType<T>,value:unknown):T|null {const parsed=schema.safeParse(value);return parsed.success?parsed.data:null;}
/** Explicit schemas strip every field outside public proof metadata. No stored URL is fetched. */
export function publicHederaEvidence(values:{hts?:unknown;identityService?:unknown;identityBuyer?:unknown;release?:unknown}) {
 return {network:'hedera:testnet' as const,discovery:{agentCard:'/.well-known/agent-card.json',a2a:'/api/hedera/a2a',evidence:'/api/hedera/evidence'},hts:publicValue(hts,values.hts),identityService:publicValue(identity,values.identityService),identityBuyer:publicValue(identity,values.identityBuyer),release:publicValue(release,values.release)};
}
export type PublicHederaEvidence=ReturnType<typeof publicHederaEvidence>;
