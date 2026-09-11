import {createHash} from 'node:crypto';
import {decodeEventLog, type Address, type Hex} from 'viem';
import type pg from 'pg';
import {economyClient,ledgerAbi,marketAbi,policyAbi,serializable,type EconomyDeployment} from './chain';
import {calculateEconomyMetrics} from './metrics';
import {resourceCategories,type EconomicSettlement,type PriceComponent} from './model';

type Event={event_name:string;payload:Record<string,string>;transaction_hash:string;block_timestamp:string;block_number:string;log_index:number};
/** Index only finalized blocks, in bounded batches, with a transaction-protected cursor.
 * No private report bodies or keys are persisted in this public evidence projection. */
export async function indexEconomy(db:pg.Client,deployment:EconomyDeployment,client:ReturnType<typeof economyClient>=economyClient()){
 if(await client.getChainId()!==deployment.chainId)throw Error('Wrong economy chain');
 await db.query('BEGIN');
 try{
  await db.query('SELECT pg_advisory_xact_lock(732980126)');
  const state=(await db.query('SELECT block_number,block_hash FROM economy_index_state WHERE settlement_address=$1 FOR UPDATE',[deployment.settlement.toLowerCase()])).rows[0];
  if(state){const prior=await client.getBlock({blockNumber:BigInt(state.block_number)});if(prior.hash!==state.block_hash)throw Error('Finalized chain history changed; manual index reconciliation required');}
  const from=state?BigInt(state.block_number)+1n:BigInt(deployment.fromBlock);
  const finalized=await client.getBlock({blockTag:'finalized'});
  if(finalized.number===null||from>finalized.number){await db.query('COMMIT');return {changed:false};}
  const to=from+1999n<finalized.number?from+1999n:finalized.number;
  const target=to===finalized.number?finalized:await client.getBlock({blockNumber:to});
  const contracts=[{address:deployment.policy,abi:policyAbi},{address:deployment.settlement,abi:marketAbi},{address:deployment.ledger,abi:ledgerAbi}];
  if(target.number!==to||!target.hash)throw Error('Invalid finalized block evidence');
  const blocks=new Map<string,{timestamp:number;hash:Hex}>();
  for(const contract of contracts){
   const logs=await client.getLogs({address:contract.address,fromBlock:from,toBlock:to});
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
  const events=(await db.query<Event>('SELECT * FROM economy_chain_events WHERE chain_id=$1 AND contract_address=ANY($2::text[]) AND block_number<=$3 ORDER BY block_number,log_index',[deployment.chainId,contracts.map(c=>c.address.toLowerCase()),to.toString()])).rows;
  const paid=events.filter(e=>e.event_name==='OrderPaid');
  const registrations=events.filter(e=>e.event_name==='AgentRegistered');
  const activeAgentIds:string[]=[];const owners=new Map<string,string>();
  for(const e of registrations){const agent=await client.readContract({address:deployment.policy,abi:policyAbi,functionName:'agents',args:[e.payload.agentId as Hex],blockNumber:to});owners.set(e.payload.agentId,agent[0].toLowerCase());if(agent[2])activeAgentIds.push(e.payload.agentId);}
  const settlements:EconomicSettlement[]=paid.map(e=>{
   const p=e.payload,split=events.find(s=>s.event_name==='OrderSettled'&&s.payload.orderId===p.orderId)?.payload;
   if(!split)throw Error('Settlement allocation missing');
   return {orderId:p.orderId,agentId:p.agentId,seller:p.seller,asset:'USDC',category:resourceCategories[Number(p.category)],unit:p.unitHash,quantity:BigInt(p.quantity),principalAtomic:BigInt(p.amount),sellerAtomic:BigInt(split.sellerAmount),timestamp:Number(e.block_timestamp),
    delivered:events.some(s=>s.event_name==='DeliveryAttested'&&s.payload.orderId===p.orderId),buyerAcknowledged:events.some(s=>s.event_name==='BuyerAcknowledged'&&s.payload.orderId===p.orderId),
    sameOwner:p.seller.toLowerCase()===owners.get(p.agentId)||p.seller.toLowerCase()===split.payer.toLowerCase(),verifiedFinalOutputAtomic:null,verifiedIntermediateInputAtomic:null,valuationReference:null};
  });
  const serviceEvents=events.filter(e=>e.event_name==='ServiceRegistered');
  const services=serviceEvents.map(e=>({serviceHash:e.payload.serviceHash,seller:e.payload.seller,unitHash:e.payload.unitHash,unitPrice:e.payload.unitPrice,quantity:e.payload.quantity,endpointHash:e.payload.endpointHash,transactionHash:e.transaction_hash,category:resourceCategories[Number(e.payload.category)],registeredAt:Number(e.block_timestamp)}));
  // Closed UTC day prevents a changing partial window from masquerading as period inflation.
  const end=Math.floor(Number(target.timestamp)/86400)*86400,start=end-86400;
  const basketRow=(await db.query("SELECT * FROM economy_price_baskets WHERE asset='USDC' AND effective_at<=to_timestamp($1) ORDER BY effective_at DESC LIMIT 1",[end])).rows[0];
  const basket:PriceComponent[]=(basketRow?.components??[]).map((p:{id:string;category:PriceComponent['category'];unit:string;baselineAtomic:string;weightBps:string;serviceHash:string})=>{
   const baseline=services.find(s=>s.serviceHash===p.serviceHash);
   const current=baseline?[...services].reverse().find(s=>s.registeredAt<end&&s.seller===baseline.seller&&s.category===baseline.category&&s.endpointHash===baseline.endpointHash&&s.unitHash===baseline.unitHash&&s.quantity===baseline.quantity):undefined;
   return {id:p.id,sourceReference:p.serviceHash,category:p.category,unit:p.unit,asset:'USDC',baselineAtomic:BigInt(p.baselineAtomic),weightBps:BigInt(p.weightBps),currentAtomic:current?BigInt(current.unitPrice):null};
  });
  const previousRow=(await db.query("SELECT metrics FROM economy_observations WHERE asset='USDC' AND window_end=$1 ORDER BY created_at DESC LIMIT 1",[start])).rows[0]?.metrics;
  const previous=previousRow?.arpiBps&&previousRow.basketIdentity?{methodology:previousRow.methodology,asset:previousRow.asset,end:previousRow.end,basketIdentity:previousRow.basketIdentity,arpiBps:BigInt(previousRow.arpiBps)}:null;
  const historical=settlements.map(s=>({...s,delivered:events.some(e=>e.event_name==='DeliveryAttested'&&e.payload.orderId===s.orderId&&Number(e.block_timestamp)<end),buyerAcknowledged:events.some(e=>e.event_name==='BuyerAcknowledged'&&e.payload.orderId===s.orderId&&Number(e.block_timestamp)<end)}));
  const metrics=calculateEconomyMetrics(historical,basket,{start,end,asset:'USDC',activeAgentIds:[],capitalAtomic:null,previousArpi:previous});
  metrics.limitations.push('Historical deployable-agent counts and capital balances have not been attested for this closed day. Utilization and velocity remain unavailable.');
  const categories=await Promise.all(resourceCategories.map(async(name,id)=>{
   const [enabled,perOrderCap,windowCap,windowSeconds,delaySeconds]=await client.readContract({address:deployment.policy,abi:policyAbi,functionName:'categories',args:[id],blockNumber:to});
   return {name,enabled,perOrderCap,windowCap,windowSeconds,delaySeconds};
  }));
  const [enabled,reserveBps,reviewBps,policyVersion,feeVersion]=await Promise.all(['marketEnabled','reserveBps','reviewBps','policyVersion','feeVersion'].map(functionName=>client.readContract({address:deployment.policy,abi:policyAbi,functionName:functionName as 'marketEnabled',blockNumber:to})));
  const sellerAddresses=[...new Set(services.map(s=>s.seller.toLowerCase()))];
  const reputation=await Promise.all(sellerAddresses.map(async seller=>{const [paid,delivered,acknowledged]=await client.readContract({address:deployment.ledger,abi:ledgerAbi,functionName:'reputation',args:[seller as Address],blockNumber:to});return {seller,paid,delivered,acknowledged,acceptanceBps:paid>0n?acknowledged*10000n/paid:null,qualityScore:null};}));
  const inputRoot=`0x${createHash('sha256').update(JSON.stringify(events)).digest('hex')}`;
  // Retain a reproducible off-chain closed-day observation. Chain attestations
  // remain separate ObservationRecorded events, never inferred from this row.
  const observationHash=`0x${createHash('sha256').update(JSON.stringify(serializable({metrics,inputRoot}))).digest('hex')}`;
  await db.query('INSERT INTO economy_observations(observation_hash,asset,window_start,window_end,input_root,methodology,metrics) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(asset,window_start,window_end,methodology) DO NOTHING',[observationHash,'USDC',start,end,inputRoot,metrics.methodology,JSON.stringify(serializable(metrics))]);
  const snapshot=serializable({deployment,blockNumber:to,blockHash:target.hash,indexedAt:new Date().toISOString(),chainTimestamp:Number(target.timestamp),caughtUp:to===finalized.number,activeAgentIds,metrics,policy:{enabled,reserveBps,reviewBps,policyVersion,feeVersion,categories},services,reputation,
   orders:settlements.map(s=>({...s,transactionHash:paid.find(e=>e.payload.orderId===s.orderId)!.transaction_hash})),policyHistory:events.filter(e=>e.event_name==='PolicyChanged').map(e=>({...e.payload,transactionHash:e.transaction_hash})),observations:events.filter(e=>e.event_name==='ObservationRecorded').map(e=>({...e.payload,transactionHash:e.transaction_hash})),inputRoot});
  await db.query('INSERT INTO economy_index_state(settlement_address,block_number,block_hash,snapshot) VALUES($1,$2,$3,$4) ON CONFLICT(settlement_address) DO UPDATE SET block_number=EXCLUDED.block_number,block_hash=EXCLUDED.block_hash,snapshot=EXCLUDED.snapshot,updated_at=now()',[deployment.settlement.toLowerCase(),to.toString(),target.hash,JSON.stringify(snapshot)]);
  await db.query('COMMIT');return {changed:true,blockNumber:to.toString(),caughtUp:to===finalized.number,orders:settlements.length};
 }catch(error){await db.query('ROLLBACK');throw error;}
}
