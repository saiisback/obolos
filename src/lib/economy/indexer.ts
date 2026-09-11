import {readEventHistory} from './event-history';
import {serializeIndexReads} from './index-rpc';
import {createHash} from 'node:crypto';
import {decodeEventLog, type Hex} from 'viem';
import type pg from 'pg';
import {economyClient,ledgerAbi,marketAbi,policyAbi,serializable,type EconomyDeployment} from './chain';
import {calculateEconomyMetrics} from './metrics';
import {resourceCategories,type EconomicSettlement} from './model';
import {selectEvidenceBasket,type EvidenceRecord} from './evidence';
import {readControllerBindings,sameKnownController} from './ownership';
import {readRecoveryEvidence,projectRecovery,reviewTrust} from './recovery-projection';

type Event={event_name:string;payload:Record<string,string>;transaction_hash:string;block_timestamp:string;block_number:string;log_index:number};
/** Index only finalized blocks, in bounded batches, with a transaction-protected cursor.
 * No private report bodies or keys are persisted in this public evidence projection. */
export async function indexEconomy(db:pg.Client,deployment:EconomyDeployment,client:ReturnType<typeof economyClient>=serializeIndexReads(economyClient())){
 if(await client.getChainId()!==deployment.chainId)throw Error('Wrong economy chain');
 await db.query('BEGIN');
 try{
  if(!(await db.query('SELECT pg_try_advisory_xact_lock(732980126) AS acquired')).rows[0]?.acquired){await db.query('ROLLBACK');return {changed:false,busy:true};}
  const state=(await db.query('SELECT block_number,block_hash,snapshot FROM economy_index_state WHERE settlement_address=$1 FOR UPDATE',[deployment.settlement.toLowerCase()])).rows[0];
  if(state){const prior=await client.getBlock({blockNumber:BigInt(state.block_number)});if(prior.hash!==state.block_hash)throw Error('Finalized chain history changed; manual index reconciliation required');}
  const from=state?BigInt(state.block_number)+1n:BigInt(deployment.fromBlock);
  const finalized=await client.getBlock({blockTag:'finalized'});
  if(finalized.number===null)throw Error('Finalized block is unavailable');
  const evidence=(await db.query<EvidenceRecord>('SELECT evidence_hash,payload,signature FROM economy_signed_evidence WHERE chain_id=$1 AND settlement_address=$2 ORDER BY evidence_hash',[deployment.chainId,deployment.settlement.toLowerCase()])).rows;
  const recoveryEvidence=await readRecoveryEvidence(db,deployment),trustedReviewers=reviewTrust();
  const evidenceRoot=`0x${createHash('sha256').update(JSON.stringify({evidence,recoveryEvidence,trustedReviewers,projectionVersion:2})).digest('hex')}`;
  if(from>finalized.number&&state?.snapshot?.evidenceRoot===evidenceRoot){await db.query('COMMIT');return {changed:false};}
  let to=from>finalized.number?BigInt(state.block_number):from+1999n<finalized.number?from+1999n:finalized.number;
  const contracts=[{address:deployment.policy,abi:policyAbi},{address:deployment.settlement,abi:marketAbi},{address:deployment.ledger,abi:ledgerAbi}];
  let batches:{contract:typeof contracts[number];logs:Awaited<ReturnType<typeof client.getLogs>>}[]=[];
  while(from<=to){
   batches=[];let count=0;
   for(const contract of contracts){const logs=await client.getLogs({address:contract.address,fromBlock:from,toBlock:to});batches.push({contract,logs});count+=logs.length;}
   if(count<=10000||to===from)break;
   // Adapt the range rather than making public log volume a permanent cursor stop.
   to=from+(to-from)/2n;
  }
  const target=to===finalized.number?finalized:await client.getBlock({blockNumber:to});
  if(target.number!==to||!target.hash)throw Error('Invalid finalized block evidence');
  const blocks=new Map<string,{timestamp:number;hash:Hex}>();
  for(const {contract,logs}of batches){
   for(const log of logs){
    if(log.removed||log.blockNumber===null||log.logIndex===null||!log.transactionHash||!log.blockHash)throw Error('Unfinalized evidence');
    if(log.address.toLowerCase()!==contract.address.toLowerCase()||log.blockNumber<from||log.blockNumber>to||!Number.isSafeInteger(log.logIndex)||log.logIndex<0)throw Error('Log does not match the requested contract and finalized range');
    let event;try{event=decodeEventLog({abi:contract.abi,data:log.data,topics:log.topics});}catch{continue;}
    const blockKey=log.blockNumber.toString();
    if(!blocks.has(blockKey)){
     const block=await client.getBlock({blockNumber:log.blockNumber});
     if(block.number!==log.blockNumber||!block.hash||!Number.isSafeInteger(Number(block.timestamp)))throw Error('Invalid canonical block evidence');
     blocks.set(blockKey,{timestamp:Number(block.timestamp),hash:block.hash});
    }
    const block=blocks.get(blockKey)!;
    if(block.hash.toLowerCase()!==log.blockHash.toLowerCase())throw Error('Log block hash differs from canonical finalized block');
    await db.query('INSERT INTO economy_chain_events(chain_id,contract_address,transaction_hash,log_index,block_number,block_hash,block_timestamp,event_name,payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING',[deployment.chainId,contract.address.toLowerCase(),log.transactionHash,log.logIndex,blockKey,log.blockHash,block.timestamp,event.eventName,JSON.stringify(serializable(event.args))]);
   }
  }
  const events=await readEventHistory<Event>(db,deployment.chainId,contracts.map(c=>c.address.toLowerCase()),to.toString());
  const paid=events.filter(e=>e.event_name==='OrderPaid');
  const registrations=[...new Map(events.filter(e=>e.event_name==='AgentRegistered').map(e=>[e.payload.agentId,e])).values()];
  const orderEvents=(name:string)=>new Map(events.filter(e=>e.event_name===name).map(e=>[e.payload.orderId,e]));
  const splits=orderEvents('OrderSettled'),deliveries=orderEvents('DeliveryAttested'),acknowledgments=orderEvents('BuyerAcknowledged'),payments=orderEvents('OrderPaid');
  const valuations=new Map(evidence.filter(e=>e.payload.kind==='order').map(e=>[e.payload.kind==='order'?e.payload.orderId:'',e]));
  const scopedEvidence=new Map(evidence.filter(e=>e.payload.kind!=='order').map(e=>[`${e.payload.kind}:${e.payload.windowStart}:${e.payload.windowEnd}`,e]));
  const activeAgentIds:string[]=[];const owners=new Map<string,string>();
  for(let i=0;i<registrations.length;i+=16){const agents=await Promise.all(registrations.slice(i,i+16).map(async e=>({id:e.payload.agentId,value:await client.readContract({address:deployment.policy,abi:policyAbi,functionName:'agents',args:[e.payload.agentId as Hex],blockNumber:to})})));for(const {id,value}of agents){owners.set(id,value[0].toLowerCase());if(value[2])activeAgentIds.push(id);}}
  const bindings=await readControllerBindings(client,deployment,[...paid.map(e=>e.payload.seller),...events.filter(e=>e.event_name==='OrderSettled').map(e=>e.payload.payer),...owners.values(),...recoveryEvidence.reviews.flatMap(r=>[r.reviewer,r.owner_address])],to);
  const settlements:EconomicSettlement[]=paid.map(e=>{
   const p=e.payload,split=splits.get(p.orderId)?.payload;
   if(!split)throw Error('Settlement allocation missing');
   const attestation=valuations.get(p.orderId);
   const valuation=attestation?.payload.kind==='order'?attestation.payload:null;
   return {orderId:p.orderId,agentId:p.agentId,seller:p.seller,asset:'USDC',category:resourceCategories[Number(p.category)],unit:p.unitHash,quantity:BigInt(p.quantity),principalAtomic:BigInt(p.amount),sellerAtomic:BigInt(split.sellerAmount),timestamp:Number(e.block_timestamp),
    delivered:deliveries.has(p.orderId),buyerAcknowledged:acknowledgments.has(p.orderId),
    sameOwner:sameKnownController(p.seller,owners.get(p.agentId)??split.payer,bindings)||sameKnownController(p.seller,split.payer,bindings),verifiedFinalOutputAtomic:valuation?BigInt(valuation.finalOutputAtomic):null,verifiedIntermediateInputAtomic:valuation?BigInt(valuation.intermediateInputAtomic):null,verifiedResourceCostAtomic:valuation?BigInt(valuation.resourceCostAtomic):null,valuationReference:attestation?.evidence_hash??null};
  });
  const serviceEvents=events.filter(e=>e.event_name==='ServiceRegistered');
  const services=serviceEvents.map(e=>({serviceHash:e.payload.serviceHash,seller:e.payload.seller,unitHash:e.payload.unitHash,unitPrice:e.payload.unitPrice,quantity:e.payload.quantity,endpointHash:e.payload.endpointHash,transactionHash:e.transaction_hash,category:resourceCategories[Number(e.payload.category)],registeredAt:Number(e.block_timestamp)}));
  // Closed UTC day prevents a changing partial window from masquerading as period inflation.
  const end=Math.floor(Number(target.timestamp)/86400)*86400,start=end-86400;
  const inputRoot=`0x${createHash('sha256').update(JSON.stringify({deployment,blockNumber:to.toString(),blockHash:target.hash,events,evidence,recoveryEvidence,trustedReviewers,controllerBindings:[...bindings].sort(([a],[b])=>a.localeCompare(b))})).digest('hex')}`;
  const projectWindow=async(start:number,end:number)=>{
  const basketEvidence=scopedEvidence.get(`basket:${start}:${end}`);
  const basketPayload=basketEvidence?.payload.kind==='basket'?basketEvidence.payload:null;
  const basket=selectEvidenceBasket(basketPayload?.components??[],services,end);
  const windowEvidence=scopedEvidence.get(`window:${start}:${end}`);
  const windowPayload=windowEvidence?.payload.kind==='window'?windowEvidence.payload:null;
  const previousRow=(await db.query("SELECT metrics FROM economy_observations WHERE asset='USDC' AND window_end=$1 AND settlement_address=$2 ORDER BY created_at DESC LIMIT 1",[start,deployment.settlement.toLowerCase()])).rows[0]?.metrics;
  const previous=previousRow?.arpiBps&&previousRow.basketIdentity?{methodology:previousRow.methodology,asset:previousRow.asset,end:previousRow.end,basketIdentity:previousRow.basketIdentity,arpiBps:BigInt(previousRow.arpiBps)}:null;
  const historical=settlements.map(s=>({...s,delivered:Number(deliveries.get(s.orderId)?.block_timestamp??Infinity)<end,buyerAcknowledged:Number(acknowledgments.get(s.orderId)?.block_timestamp??Infinity)<end}));
  const windowMetrics=calculateEconomyMetrics(historical,basket,{start,end,asset:'USDC',activeAgentIds:windowPayload?.activeAgentIds??[],capitalAtomic:windowPayload?BigInt(windowPayload.capitalAtomic):null,previousArpi:previous});
  if(!windowPayload)windowMetrics.limitations.push('Historical deployable-agent counts and capital balances have not been attested for this closed day. Utilization and velocity remain unavailable.');
  windowMetrics.limitations.push('Signed economic attestations express the named attestor’s assessment; signatures do not establish objective usefulness or undisclosed independence.');
  const observationHash=`0x${createHash('sha256').update(JSON.stringify(serializable({metrics:windowMetrics,inputRoot}))).digest('hex')}`;
  await db.query('INSERT INTO economy_observations(observation_hash,asset,window_start,window_end,input_root,methodology,metrics,settlement_address) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(observation_hash) DO NOTHING',[observationHash,'USDC',start,end,inputRoot,windowMetrics.methodology,JSON.stringify(serializable(windowMetrics)),deployment.settlement.toLowerCase()]);
  return {metrics:windowMetrics,quoteSelections:basketPayload?.components.map(c=>({componentId:c.id,baselineServiceHash:c.baselineServiceHash,quoteServiceHash:c.quoteServiceHash,evidenceHash:basketEvidence!.evidence_hash}))??[]};
  };
  // Late attestations refresh their exact historical day without replacing earlier observations.
  const historicalEnds=[...new Set(evidence.map(e=>e.payload.windowEnd).filter(e=>e<end))].sort((a,b)=>a-b);
  for(const windowEnd of historicalEnds)await projectWindow(windowEnd-86400,windowEnd);
  const {metrics,quoteSelections}=await projectWindow(start,end);
  const categories=await Promise.all(resourceCategories.map(async(name,id)=>{
   const [enabled,perOrderCap,windowCap,windowSeconds,delaySeconds]=await client.readContract({address:deployment.policy,abi:policyAbi,functionName:'categories',args:[id],blockNumber:to});
   return {name,enabled,perOrderCap,windowCap,windowSeconds,delaySeconds};
  }));
  const [enabled,reserveBps,reviewBps,policyVersion,feeVersion]=await Promise.all(['marketEnabled','reserveBps','reviewBps','policyVersion','feeVersion'].map(functionName=>client.readContract({address:deployment.policy,abi:policyAbi,functionName:functionName as 'marketEnabled',blockNumber:to})));
  const recoveryProjection=projectRecovery(settlements.map(s=>({...s,payer:splits.get(s.orderId)!.payload.payer,owner:owners.get(s.agentId)??splits.get(s.orderId)!.payload.payer,transactionHash:payments.get(s.orderId)!.transaction_hash,outputHash:deliveries.get(s.orderId)?.payload.outputHash??null})),recoveryEvidence,bindings,trustedReviewers);
  const reviewReputation=new Map(recoveryProjection.reputation.map(r=>[r.seller,r]));
  const sellerOrders=new Map<string,EconomicSettlement[]>();for(const order of settlements){const key=order.seller.toLowerCase(),group=sellerOrders.get(key)??[];group.push(order);sellerOrders.set(key,group);}
  const sellerAddresses=[...new Set([...services.map(s=>s.seller.toLowerCase()),...sellerOrders.keys()])];
  const reputation=sellerAddresses.map(seller=>{const orders=sellerOrders.get(seller)??[],paid=BigInt(orders.length),delivered=BigInt(orders.filter(s=>s.delivered).length),acknowledged=BigInt(orders.filter(s=>s.buyerAcknowledged).length);return {paid,delivered,acknowledged,acceptanceBps:paid>0n?acknowledged*10000n/paid:null,...(reviewReputation.get(seller)??{verifiedReviews:0,reviewedOrders:0,reviewEligibleOrders:0,passedReviewOrders:0,conflictingReviewOrders:0,qualityScore:null,qualityMethodology:'trusted-review-pass-rate-bps-v1',disputeCount:0,refundCount:0,refundedAtomic:0n}),seller};});
  const snapshot=serializable({recovery:recoveryProjection.recovery,evidenceRoot,evidence: evidence.map(({evidence_hash,payload,signature})=>({evidenceHash:evidence_hash,signature,...payload})),quoteSelections,deployment,blockNumber:to,blockHash:target.hash,indexedAt:new Date().toISOString(),chainTimestamp:Number(target.timestamp),caughtUp:to===finalized.number,activeAgentIds,metrics,policy:{enabled,reserveBps,reviewBps,policyVersion,feeVersion,categories},services,reputation,
   orders:settlements.map(s=>({...s,transactionHash:payments.get(s.orderId)!.transaction_hash})),policyHistory:events.filter(e=>e.event_name==='PolicyChanged').map(e=>({...e.payload,transactionHash:e.transaction_hash})),observations:events.filter(e=>e.event_name==='ObservationRecorded').map(e=>({...e.payload,transactionHash:e.transaction_hash})),inputRoot});
  await db.query('INSERT INTO economy_index_state(settlement_address,block_number,block_hash,snapshot) VALUES($1,$2,$3,$4) ON CONFLICT(settlement_address) DO UPDATE SET block_number=EXCLUDED.block_number,block_hash=EXCLUDED.block_hash,snapshot=EXCLUDED.snapshot,updated_at=now()',[deployment.settlement.toLowerCase(),to.toString(),target.hash,JSON.stringify(snapshot)]);
  await db.query('COMMIT');return {changed:true,blockNumber:to.toString(),caughtUp:to===finalized.number,orders:settlements.length};
 }catch(error){await db.query('ROLLBACK');throw error;}
}
