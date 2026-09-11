import type {EconomicSettlement,EconomyMetrics,MetricWindow,PriceComponent} from './model';
const bps=10000n;
const methodology='obolos-agentgdp-v1' as const;
function basketIdentity(components:PriceComponent[]):string|null {
  if(!components.length)return null;
  return JSON.stringify([...components].sort((a,b)=>a.id.localeCompare(b.id)).map(p=>[p.id,p.category,p.unit,p.asset,p.baselineAtomic.toString(),p.weightBps.toString(),p.sourceReference??p.id]));
}
export function calculateEconomyMetrics(events:EconomicSettlement[],basket:PriceComponent[],window:MetricWindow):EconomyMetrics {
  if(!Number.isSafeInteger(window.start)||!Number.isSafeInteger(window.end)||window.start>=window.end)throw Error('Invalid metric window');
  const seen=new Set<string>();
  for(const e of events){if(seen.has(e.orderId))throw Error('Duplicate settlement');seen.add(e.orderId);if(e.principalAtomic<0n||e.sellerAtomic<0n||e.sellerAtomic>e.principalAtomic||e.quantity<=0n)throw Error('Invalid settlement units');}
  const components=basket.filter(p=>p.asset===window.asset),ids=new Set<string>();
  for(const p of components){if(ids.has(p.id)||p.weightBps<=0n||p.baselineAtomic<=0n||p.currentAtomic!==null&&p.currentAtomic<=0n)throw Error('Invalid price basket');ids.add(p.id);}
  if(components.length&&components.reduce((v,p)=>v+p.weightBps,0n)!==bps)throw Error('Price basket weights must sum to 10000');
  const identity=basketIdentity(components);
  const arpiBps=components.length&&components.every(p=>p.currentAtomic!==null)?components.reduce((v,p)=>v+p.weightBps*p.currentAtomic!*bps/p.baselineAtomic,0n)/bps:null;
  const selected=events.filter(e=>e.asset===window.asset&&e.timestamp>=window.start&&e.timestamp<window.end);
  const eligible=selected.filter(e=>!e.sameOwner);
  const valued=eligible.filter(e=>e.delivered&&e.buyerAcknowledged&&e.valuationReference&&e.verifiedFinalOutputAtomic!==null&&e.verifiedIntermediateInputAtomic!==null);
  const complete=eligible.length>0&&valued.length===eligible.length;
  const revenue=valued.reduce((v,e)=>v+e.verifiedFinalOutputAtomic!,0n),inputs=valued.reduce((v,e)=>v+e.verifiedIntermediateInputAtomic!,0n);
  if(valued.some(e=>e.verifiedFinalOutputAtomic!<0n||e.verifiedIntermediateInputAtomic!<0n)||eligible.some(e=>e.verifiedResourceCostAtomic!==null&&e.verifiedResourceCostAtomic!==undefined&&e.verifiedResourceCostAtomic<0n))throw Error('Invalid economic valuation');
  const costComplete=complete&&valued.every(e=>e.verifiedResourceCostAtomic!==null&&e.verifiedResourceCostAtomic!==undefined);
  const gross=selected.reduce((v,e)=>v+e.principalAtomic,0n),resourceCost=costComplete?valued.reduce((v,e)=>v+e.verifiedResourceCostAtomic!,0n):null;
  const gap=complete?revenue-inputs:null,capital=window.capitalAtomic;
  if(capital!==null&&capital<0n)throw Error('Invalid capital observation');
  const active=new Set(window.activeAgentIds),productive=new Set(eligible.filter(e=>e.delivered&&e.buyerAcknowledged&&active.has(e.agentId)).map(e=>e.agentId));
  const limitations=['Delivery and buyer acknowledgment do not independently prove real-world usefulness.','Known same-owner payments are excluded from value-added and utilization; undisclosed common control and circular trade may remain.'];
  if(!complete)limitations.push('GAP requires explicit final-output and intermediate-input valuations for every eligible order in this window.');
  if(!costComplete)limitations.push('Surplus and productivity require an explicit all-resource cost attestation for every eligible valued order.');
  if(resourceCost===0n)limitations.push('Productivity is unavailable because attested total resource cost is zero; surplus remains defined.');
  if(arpiBps===null)limitations.push('ARPI requires every fixed-basket component with comparable currency and unit prices.');
  const previous=window.previousArpi;
  const comparablePrevious=previous!==null&&previous.methodology===methodology&&previous.asset===window.asset&&previous.end===window.start&&previous.basketIdentity===identity&&previous.arpiBps>0n;
  if(!comparablePrevious)limitations.push('Period inflation requires the immediately preceding ARPI observation for the same asset, methodology and fixed basket.');
  return {methodology,asset:window.asset,start:window.start,end:window.end,basketIdentity:identity,arpiBps,
    inflationBps:arpiBps!==null&&comparablePrevious?(arpiBps-previous.arpiBps)*bps/previous.arpiBps:null,
    baselineChangeBps:arpiBps!==null?arpiBps-bps:null,grossPaymentsAtomic:gross,sellerRevenueAtomic:selected.reduce((v,e)=>v+e.sellerAtomic,0n),gapAtomic:gap,
    surplusAtomic:resourceCost!==null?revenue-resourceCost:null,productivityBps:resourceCost!==null&&resourceCost>0n?revenue*bps/resourceCost:null,
    moneyVelocityBps:gap!==null&&capital!==null&&capital>0n?gap*bps/capital:null,paymentTurnoverBps:capital!==null&&capital>0n?gross*bps/capital:null,
    utilizationBps:active.size?BigInt(productive.size)*bps/BigInt(active.size):null,
    purchasingPower:components.map(p=>({componentId:p.id,unit:p.unit,tasksPerCurrencyMillionths:p.currentAtomic? (window.asset==='USDC'?1000000n:100000000n)*1000000n/p.currentAtomic:null})),
    settlementCount:selected.length,valuedSettlementCount:valued.length,excludedSelfPayments:selected.length-eligible.length,limitations};
}
