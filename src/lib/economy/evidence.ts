import {readEventHistory} from './event-history';
import {verifyMessage,type Hex} from 'viem';
import {z} from 'zod';
import type pg from 'pg';
import {economyClient,policyAbi,type EconomyDeployment} from './chain';
import {canonicalJson,canonicalJsonHash} from './service-contract';
import {resourceCategories,type PriceComponent} from './model';
import {PlatformError} from '../platform/http';
import {readControllerBindings,sameKnownController} from './ownership';

// Lowercase-only signed fields avoid ambiguous normalization of signed bytes.
const hash=z.string().regex(/^0x[0-9a-f]{64}$/),address=z.string().regex(/^0x[0-9a-f]{40}$/);
const atomic=z.string().max(78).regex(/^(0|[1-9]\d*)$/),positive=atomic.refine(v=>BigInt(v)>0n);
const second=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const base={protocol:z.literal('obolos.evidence.v1'),chainId:z.literal(5042002),policy:address,ledger:address,settlement:address,asset:z.literal('USDC'),windowStart:second,windowEnd:second,issuedAt:second,signer:address,sourceReference:z.string().min(1).max(512),sourceHash:hash};
export const basketComponentSchema=z.object({id:z.string().min(1).max(80),category:z.enum(resourceCategories),unit:hash,baselineAtomic:positive,weightBps:positive,baselineServiceHash:hash,quoteServiceHash:hash}).strict();
export const evidenceSchema=z.discriminatedUnion('kind',[
 z.object({...base,kind:z.literal('order'),orderId:hash,agentId:hash,payer:address,seller:address,inputHash:hash,outputHash:hash,transactionHash:hash,finalOutputAtomic:atomic,intermediateInputAtomic:atomic,resourceCostAtomic:atomic,
  // Explicit exhaustive accounting, including conversions, is a signed claim, never inferred from the payment.
  costBreakdown:z.object({paymentAtomic:atomic,gasAtomic:atomic,inferenceAtomic:atomic,otherAtomic:atomic,conversionReference:z.string().min(1).max(512),allResourcesIncluded:z.literal(true)}).strict()}).strict(),
 z.object({...base,kind:z.literal('window'),capitalAtomic:atomic,activeAgentIds:z.array(hash).max(256),anchorBlock:atomic,anchorBlockHash:hash}).strict(),
 z.object({...base,kind:z.literal('basket'),basketId:hash,components:z.array(basketComponentSchema).min(1).max(50)}).strict(),
]);
export type EvidencePayload=z.infer<typeof evidenceSchema>;
export type EvidenceRecord={evidence_hash:string;payload:EvidencePayload;signature:string};
export type EvidenceTrust=Record<string,string[]>;
const fail=(message:string,status=422):never=>{throw new PlatformError(status,'INVALID_ECONOMIC_EVIDENCE',message);};
export function evidenceTrust():EvidenceTrust {
 try{return z.record(address,z.array(z.enum(['order','window','basket']))).parse(JSON.parse(process.env.ECONOMY_EVIDENCE_SIGNERS||'{}'));}catch{return {};}
}
export function evidenceMessage(payload:EvidencePayload){return `Obolos economic evidence v1\n${canonicalJson(payload)}`;}
export async function authenticateEvidence(input:unknown,deployment:EconomyDeployment,trust=evidenceTrust(),now=Math.floor(Date.now()/1000)){
 const {payload,signature}=z.object({payload:evidenceSchema,signature:z.string().regex(/^0x[0-9a-fA-F]{130}$/)}).strict().parse(input);
 if(payload.chainId!==deployment.chainId||payload.policy!==deployment.policy.toLowerCase()||payload.ledger!==deployment.ledger.toLowerCase()||payload.settlement!==deployment.settlement.toLowerCase())fail('Evidence belongs to a different deployment.');
 if(payload.windowStart%86400!==0||payload.windowEnd!==payload.windowStart+86400||payload.windowEnd>now||payload.issuedAt<payload.windowEnd||payload.issuedAt>now)fail('Evidence must bind a closed UTC day and a non-future signing time.');
 if(!Object.hasOwn(trust,payload.signer)||!trust[payload.signer].includes(payload.kind))fail('Evidence signer is not trusted for this role.',403);
 if(!await verifyMessage({address:payload.signer as Hex,message:evidenceMessage(payload),signature:signature as Hex}))fail('Evidence signature is invalid.',403);
 if(payload.kind==='window'&&new Set(payload.activeAgentIds).size!==payload.activeAgentIds.length)fail('Duplicate active agent.');
 if(payload.kind==='basket'){
  if(new Set(payload.components.map(c=>c.id)).size!==payload.components.length||payload.components.reduce((v,c)=>v+BigInt(c.weightBps),0n)!==10000n)fail('Invalid fixed basket weights or component identities.');
  if(canonicalJsonHash(payload.components.map(({quoteServiceHash:_quote,...component})=>component).sort((a,b)=>a.id.localeCompare(b.id)))!==payload.basketId)fail('Basket identity must bind every fixed baseline component.');
 }
 if(payload.kind==='order'){
  const c=payload.costBreakdown;
  if([payload.seller,payload.payer].includes(payload.signer))fail('An order participant cannot independently verify its own valuation.',403);
  if([c.paymentAtomic,c.gasAtomic,c.inferenceAtomic,c.otherAtomic].reduce((a,v)=>a+BigInt(v),0n)!==BigInt(payload.resourceCostAtomic))fail('Full resource cost differs from its signed breakdown.');
 }
 return {payload,signature,evidenceHash:canonicalJsonHash(payload)};
}

type ChainEvent={event_name:string;payload:Record<string,string>;transaction_hash:string;block_timestamp:string;block_number:string;contract_address:string};
type ServiceQuote={serviceHash:string;category:string;unitHash:string;unitPrice:string;quantity:string;seller:string;endpointHash:string;registeredAt:number};
export function selectEvidenceBasket(components:z.infer<typeof basketComponentSchema>[],services:ServiceQuote[],end:number):PriceComponent[]{
 return components.map(p=>{
  const baseline=services.find(s=>s.serviceHash===p.baselineServiceHash&&s.registeredAt<end),quote=services.find(s=>s.serviceHash===p.quoteServiceHash&&s.registeredAt<end);
  const comparable=baseline&&quote&&baseline.unitPrice===p.baselineAtomic&&baseline.category===p.category&&baseline.unitHash===p.unit&&quote.category===baseline.category&&quote.unitHash===baseline.unitHash&&quote.quantity===baseline.quantity&&quote.seller===baseline.seller&&quote.endpointHash===baseline.endpointHash;
  return {id:p.id,category:p.category,unit:p.unit,asset:'USDC',baselineAtomic:BigInt(p.baselineAtomic),weightBps:BigInt(p.weightBps),sourceReference:p.baselineServiceHash,currentAtomic:comparable?BigInt(quote.unitPrice):null};
 });
}
export async function ingestEvidence(db:pg.Client,input:unknown,deployment:EconomyDeployment,client:ReturnType<typeof economyClient>=economyClient(),trust=evidenceTrust(),now=Math.floor(Date.now()/1000)){
 const verified=await authenticateEvidence(input,deployment,trust,now),p=verified.payload;
 const scope=p.kind==='order'?p.orderId:`${p.windowStart}:${p.windowEnd}`;
 await db.query('BEGIN');
 try{
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`${p.settlement}:${p.kind}:${scope}`]);
  const existing=(await db.query('SELECT evidence_hash FROM economy_signed_evidence WHERE chain_id=$1 AND settlement_address=$2 AND kind=$3 AND scope=$4',[p.chainId,p.settlement,p.kind,scope])).rows[0];
  if(existing){if(existing.evidence_hash!==verified.evidenceHash)fail('Conflicting evidence already exists for this scope.',409);await db.query('COMMIT');return {evidenceHash:verified.evidenceHash,replayed:true};}
  const cursor=(await db.query('SELECT block_number FROM economy_index_state WHERE settlement_address=$1',[p.settlement])).rows[0];
  if(!cursor)fail('Finalize and index chain evidence before submitting attestations.');
  const events=await readEventHistory<ChainEvent>(db,p.chainId,[p.policy,p.ledger,p.settlement],String(cursor.block_number));
  const related=[p.signer,...events.filter(e=>e.event_name==='AgentRegistered').flatMap(e=>[e.payload.owner,e.payload.executor]),...(p.kind==='order'?[p.payer,p.seller]:[])];
  if(p.kind==='basket')related.push(...events.filter(e=>e.event_name==='ServiceRegistered'&&p.components.some(c=>c.baselineServiceHash===e.payload.serviceHash||c.quoteServiceHash===e.payload.serviceHash)).map(e=>e.payload.seller));
  const bindings=await readControllerBindings(client,deployment,related,BigInt(cursor.block_number));
  if(p.kind==='order'){
   const paid=events.find(e=>e.event_name==='OrderPaid'&&e.contract_address===p.ledger&&e.payload.orderId===p.orderId),settled=events.find(e=>e.event_name==='OrderSettled'&&e.contract_address===p.settlement&&e.payload.orderId===p.orderId);
   const delivery=events.find(e=>e.event_name==='DeliveryAttested'&&e.contract_address===p.ledger&&e.payload.orderId===p.orderId),ack=events.find(e=>e.event_name==='BuyerAcknowledged'&&e.contract_address===p.ledger&&e.payload.orderId===p.orderId);
   if(!paid||!settled||!delivery||!ack||paid.transaction_hash!==p.transactionHash||settled.transaction_hash!==p.transactionHash||paid.payload.agentId!==p.agentId||paid.payload.inputHash!==p.inputHash||paid.payload.seller.toLowerCase()!==p.seller||settled.payload.payer.toLowerCase()!==p.payer||delivery.payload.outputHash!==p.outputHash||ack.payload.outputHash!==p.outputHash||BigInt(p.costBreakdown.paymentAtomic)!==BigInt(paid.payload.amount))fail('Order evidence does not match finalized payment, delivery and acknowledgment.');
   if(Number(paid!.block_timestamp)<p.windowStart||[paid!,settled!,delivery!,ack!].some(e=>Number(e.block_timestamp)>=p.windowEnd))fail('Order evidence crosses the signed window.');
   const agent=events.find(e=>e.event_name==='AgentRegistered'&&e.contract_address===p.policy&&e.payload.agentId===p.agentId);
   if(!agent||[agent.payload.owner,agent.payload.executor,p.payer,p.seller].some(a=>sameKnownController(a,p.signer,bindings)))fail('Agent owner or executor cannot independently verify its valuation.',403);
  }else if(p.kind==='window'){
   if(BigInt(p.anchorBlock)>BigInt(cursor.block_number))fail('Window anchor is not indexed.');
   if(await client.getChainId()!==p.chainId)fail('Wrong evidence chain.');
   const anchor=await client.getBlock({blockNumber:BigInt(p.anchorBlock)}),next=await client.getBlock({blockNumber:BigInt(p.anchorBlock)+1n});
   const finalized=await client.getBlock({blockTag:'finalized'});
   if(anchor.number!==BigInt(p.anchorBlock)||next.number!==BigInt(p.anchorBlock)+1n||finalized.number===null||next.number===null||next.number>finalized.number||anchor.hash?.toLowerCase()!==p.anchorBlockHash||Number(anchor.timestamp)>=p.windowEnd||Number(next.timestamp)<p.windowEnd)fail('Window anchor must be the finalized last block before the closed-day boundary.');
   const registrations=events.filter(e=>e.event_name==='AgentRegistered'&&e.contract_address===p.policy&&BigInt(e.block_number)<=BigInt(p.anchorBlock));
   const active:string[]=[];
   for(const id of new Set(registrations.map(e=>e.payload.agentId))){const agent=await client.readContract({address:deployment.policy,abi:policyAbi,functionName:'agents',args:[id as Hex],blockNumber:BigInt(p.anchorBlock)});if(agent[2]){active.push(id);if([agent[0],agent[1]].some(a=>sameKnownController(a,p.signer,bindings)))fail('Window attestor must be independent of active agents.',403);}}
   if(canonicalJson(active.sort())!==canonicalJson([...p.activeAgentIds].sort()))fail('Active agent denominator differs from the historical policy state.');
  }else{
   const services=events.filter(e=>e.event_name==='ServiceRegistered'&&e.contract_address===p.settlement).map(e=>({...e.payload,serviceHash:e.payload.serviceHash,category:resourceCategories[Number(e.payload.category)],unitHash:e.payload.unitHash,unitPrice:e.payload.unitPrice,quantity:e.payload.quantity,seller:e.payload.seller,endpointHash:e.payload.endpointHash,registeredAt:Number(e.block_timestamp)}));
   if(selectEvidenceBasket(p.components,services,p.windowEnd).some(c=>c.currentAtomic===null))fail('Fixed basket selects missing or incomparable exact service quotes.');
   if(p.components.some(c=>services.some(s=>(s.serviceHash===c.quoteServiceHash||s.serviceHash===c.baselineServiceHash)&&sameKnownController(s.seller,p.signer,bindings))))fail('A basket attestor must be independent of its sellers.',403);
   if(p.components.some(c=>services.find(s=>s.serviceHash===c.baselineServiceHash)!.registeredAt>=p.windowStart))fail('Fixed baseline must predate the measured day.');
  }
  await db.query('INSERT INTO economy_signed_evidence(evidence_hash,chain_id,settlement_address,kind,scope,window_start,window_end,signer,issued_at,payload,signature) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[verified.evidenceHash,p.chainId,p.settlement,p.kind,scope,p.windowStart,p.windowEnd,p.signer,p.issuedAt,JSON.stringify(p),verified.signature]);
  await db.query('COMMIT');return {evidenceHash:verified.evidenceHash,replayed:false};
 }catch(error){await db.query('ROLLBACK');throw error;}
}
