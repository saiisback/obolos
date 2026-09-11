/** Pure observations of finalized activity and registered quotes. No value-added estimates. */
import {keccak256,toHex} from 'viem';
import {canonicalJson} from './service-contract';
import {resourceCategories,type EconomicSettlement,type ResourceCategory} from './model';

export type MeasurementSettlement=EconomicSettlement&{deliveredAt?:number|null;acknowledgedAt?:number|null;serviceHash?:string;transactionHash?:string;inputHash?:string;outputHash?:string|null};
export type MeasurementService={serviceHash:string;seller:string;category:ResourceCategory;unitHash:string;quantity:string|bigint;unitPrice:string|bigint;endpointHash:string;registeredAt:number;transactionHash:string};
export type MeasurementInput={settlements:MeasurementSettlement[];services:MeasurementService[];agents:{agentId:string;executor:string;active:boolean}[];balances:{address:string;balanceAtomic:bigint|null}[];asOf:number;blockNumber:string;blockHash:string;fromTimestamp:number;refunds?:{orderId:string;amountAtomic:bigint;timestamp:number;transactionHash?:string;logIndex?:number}[]};
export type MeasurementWindow={start:number;endInclusive:number;settlementCount:number;grossPaymentsAtomic:bigint;sellerRevenueAtomic:bigint;refundAtomic:bigint;refundCount:number;deliveredCount:number;acknowledgedCount:number;orderIds:string[];deliveredOrderIds:string[];acknowledgedOrderIds:string[]};
export type MeasurementPriceComponent={category:ResourceCategory;weightBps:bigint;familyServiceHash:string;seller:string;unitHash:string;quantity:bigint;endpointHash:string;baselineServiceHash:string|null;baselineTransactionHash:string|null;baselineAtomic:bigint|null;baselineRegisteredAt:number|null;currentServiceHash:string;currentTransactionHash:string;currentAtomic:bigint;currentRegisteredAt:number};
export type MeasurementPriceSnapshot={start:number;end:number;indexBps:bigint;quotes:{category:ResourceCategory;serviceHash:string;transactionHash:string;unitPriceAtomic:bigint;registeredAt:number}[]};
export type EconomyMeasurements={
 methodology:'obolos-observed-activity-v1';asset:'USDC';asOf:number;blockNumber:string;blockHash:string;today:MeasurementWindow;lifetime:MeasurementWindow;
 activity:{methodology:'current-active-agent-operational-completion-v1';start:number;endInclusive:number;activeAgentCount:number;fulfilledAgentCount:number;utilizationBps:bigint|null;activeAgentIds:string[];fulfilledAgentIds:string[];lifetimeFulfilledAgentCount:number};
 capital:{methodology:'current-active-executor-usdc-balances-v1';complete:boolean;executorCount:number;totalAtomic:bigint|null;knownBalanceAtomic:bigint;missingExecutorAddresses:string[];balances:{address:string;balanceAtomic:bigint|null}[];todayTurnoverBps:bigint|null;lifetimeTurnoverBps:bigint|null};
 prices:{methodology:'equal-weight-five-category-registered-quotes-v1';basketId:string|null;baselineAt:number|null;complete:boolean;missingCategories:ResourceCategory[];indexBps:bigint|null;baselineChangeBps:bigint|null;components:MeasurementPriceComponent[];priorClosedDay:MeasurementPriceSnapshot|null;precedingClosedDay:MeasurementPriceSnapshot|null;periodInflationBps:bigint|null;changeSincePriorCloseBps:bigint|null;purchasingPower:{category:ResourceCategory;serviceHash:string;transactionHash:string;unitHash:string;quantity:bigint;unitPriceAtomic:bigint;unitsPerUsdcMillionths:bigint;ordersPerUsdcMillionths:bigint}[]};
 provenance:{blockNumber:string;blockHash:string;asOf:number;fromTimestamp:number;inputHash:string;orderIds:string[];settlementTransactionHashes:string[];serviceHashes:string[];serviceTransactionHashes:string[];refundSources:{orderId:string;amountAtomic:bigint;timestamp:number;transactionHash:string|null;logIndex?:number}[];refundTimestampBasis:'supplied-record-time';missingDeliveryTimestampOrderIds:string[];missingAcknowledgmentTimestampOrderIds:string[]};limitations:string[];
};
const daySeconds=86400,bps=10000n;
const validTime=(value:number)=>Number.isSafeInteger(value)&&value>=0;
const digest=(value:unknown)=>keccak256(toHex(canonicalJson(JSON.parse(JSON.stringify(value,(_key,v)=>typeof v==='bigint'?v.toString():v)))));
const unique=(values:string[])=>[...new Set(values)];
function eventTime(order:MeasurementSettlement,kind:'delivered'|'acknowledged'):number|null{
 const flag=kind==='delivered'?order.delivered:order.buyerAcknowledged,time=kind==='delivered'?order.deliveredAt:order.acknowledgedAt;
 return flag&&time!==undefined&&time!==null?time:null;
}
export function calculateMeasurements(input:MeasurementInput):EconomyMeasurements{
 if(!validTime(input.asOf)||!validTime(input.fromTimestamp)||input.fromTimestamp>input.asOf||!/^\d+$/.test(input.blockNumber)||!input.blockHash)throw Error('Invalid measurement snapshot.');
 const todayStart=Math.floor(input.asOf/daySeconds)*daySeconds;
 const seenOrders=new Set<string>();
 for(const order of input.settlements){
  if(seenOrders.has(order.orderId))throw Error('Duplicate measurement order.');seenOrders.add(order.orderId);
  if(!validTime(order.timestamp)||order.quantity<=0n||order.principalAtomic<0n||order.sellerAtomic<0n||order.sellerAtomic>order.principalAtomic)throw Error('Invalid observed settlement.');
  for(const time of [order.deliveredAt,order.acknowledgedAt])if(time!==undefined&&time!==null&&(!validTime(time)||time<order.timestamp))throw Error('Invalid completion timestamp.');
 }
 const orders=input.settlements.filter(o=>o.asset==='USDC'&&o.timestamp>=input.fromTimestamp&&o.timestamp<=input.asOf),orderIds=new Set(orders.map(o=>o.orderId));
 const refunds=(input.refunds??[]).filter(r=>{if(!Number.isFinite(r.timestamp)||r.timestamp<0||r.timestamp>Number.MAX_SAFE_INTEGER||r.amountAtomic<0n||(r.logIndex!==undefined&&(!Number.isSafeInteger(r.logIndex)||r.logIndex<0)))throw Error('Invalid observed refund.');return orderIds.has(r.orderId)&&r.timestamp>=input.fromTimestamp&&r.timestamp<=input.asOf;});
 const window=(start:number,lifetime=false):MeasurementWindow=>{
  const selected=orders.filter(o=>o.timestamp>=start),selectedRefunds=refunds.filter(r=>r.timestamp>=start);
  const occurred=(o:MeasurementSettlement,kind:'delivered'|'acknowledged')=>{const time=eventTime(o,kind);if(time!==null)return time>=start&&time<=input.asOf;return lifetime&&(kind==='delivered'?o.delivered:o.buyerAcknowledged);};
  const delivered=orders.filter(o=>occurred(o,'delivered')),acknowledged=orders.filter(o=>occurred(o,'acknowledged'));
  return {start,endInclusive:input.asOf,settlementCount:selected.length,grossPaymentsAtomic:selected.reduce((v,o)=>v+o.principalAtomic,0n),sellerRevenueAtomic:selected.reduce((v,o)=>v+o.sellerAtomic,0n),refundAtomic:selectedRefunds.reduce((v,r)=>v+r.amountAtomic,0n),refundCount:selectedRefunds.length,deliveredCount:delivered.length,acknowledgedCount:acknowledged.length,orderIds:selected.map(o=>o.orderId),deliveredOrderIds:delivered.map(o=>o.orderId),acknowledgedOrderIds:acknowledged.map(o=>o.orderId)};
 };
 const today=window(todayStart),lifetime=window(input.fromTimestamp,true);
 const agents=new Map<string,{agentId:string;executor:string;active:boolean}>();
 for(const row of input.agents){const agent={...row,executor:row.executor.toLowerCase()},prior=agents.get(agent.agentId);if(prior&&(prior.executor!==agent.executor||prior.active!==agent.active))throw Error('Conflicting pinned agent state.');agents.set(agent.agentId,agent);}
 const activeAgents=[...agents.values()].filter(a=>a.active).sort((a,b)=>a.agentId.localeCompare(b.agentId)),activeIds=new Set(activeAgents.map(a=>a.agentId));
 const fulfilled=new Set(orders.filter(o=>{const delivery=eventTime(o,'delivered'),ack=eventTime(o,'acknowledged');return activeIds.has(o.agentId)&&delivery!==null&&ack!==null&&Math.max(delivery,ack)>=todayStart&&Math.max(delivery,ack)<=input.asOf;}).map(o=>o.agentId));
 const lifetimeFulfilled=new Set(orders.filter(o=>activeIds.has(o.agentId)&&o.delivered&&o.buyerAcknowledged&&(eventTime(o,'delivered')??input.fromTimestamp)<=input.asOf&&(eventTime(o,'acknowledged')??input.fromTimestamp)<=input.asOf).map(o=>o.agentId));
 const balanceMap=new Map<string,bigint|null>();
 for(const b of input.balances){const address=b.address.toLowerCase();if(b.balanceAtomic!==null&&b.balanceAtomic<0n)throw Error('Invalid pinned balance.');if(balanceMap.has(address)){const old=balanceMap.get(address)!;if(old!==null&&b.balanceAtomic!==null&&old!==b.balanceAtomic)throw Error('Conflicting balances at one pinned block.');balanceMap.set(address,old===null||b.balanceAtomic===null?null:old);}else balanceMap.set(address,b.balanceAtomic);}
 const balances=unique(activeAgents.map(a=>a.executor)).sort().map(address=>({address,balanceAtomic:balanceMap.get(address)??null})),missingExecutorAddresses=balances.filter(b=>b.balanceAtomic===null).map(b=>b.address),knownBalanceAtomic=balances.reduce((v,b)=>v+(b.balanceAtomic??0n),0n),totalAtomic=missingExecutorAddresses.length?null:knownBalanceAtomic;
 const seenServices=new Map<string,string>(),services:MeasurementService[]=[];
 for(const service of input.services){
  if(!validTime(service.registeredAt)||!resourceCategories.includes(service.category)||BigInt(service.quantity)<=0n||BigInt(service.unitPrice)<=0n)throw Error('Invalid registered quote.');
  const fingerprint=digest(service),prior=seenServices.get(service.serviceHash);if(prior&&prior!==fingerprint)throw Error('Conflicting immutable service.');if(!prior&&service.registeredAt<=input.asOf)services.push(service);seenServices.set(service.serviceHash,fingerprint);
 }
 // Stable time sort retains indexed block/log order for offers in the same second.
 const quotes=services.map((service,index)=>({service,index})).sort((a,b)=>a.service.registeredAt-b.service.registeredAt||a.index-b.index).map(row=>row.service);
 const families=resourceCategories.map(category=>quotes.find(s=>s.category===category));
 const missingCategories=resourceCategories.filter((_category,index)=>!families[index]),complete=missingCategories.length===0;
 const baselinePosition=complete?Math.max(...families.map(s=>quotes.indexOf(s!))):-1;
 const baselineAt=complete?quotes[baselinePosition].registeredAt:null;
 const comparable=(a:MeasurementService,b:MeasurementService)=>a.category===b.category&&a.seller.toLowerCase()===b.seller.toLowerCase()&&a.unitHash.toLowerCase()===b.unitHash.toLowerCase()&&BigInt(a.quantity)===BigInt(b.quantity)&&a.endpointHash.toLowerCase()===b.endpointHash.toLowerCase();
 const latest=(family:MeasurementService,until:number,exclusive=false)=>quotes.filter(s=>comparable(s,family)&&(exclusive?s.registeredAt<until:s.registeredAt<=until)).at(-1)!;
 const components:MeasurementPriceComponent[]=families.flatMap(family=>{if(!family)return [];const current=latest(family,input.asOf),baseline=baselineAt===null?null:quotes.slice(0,baselinePosition+1).filter(s=>comparable(s,family)).at(-1)!;return [{category:family.category,weightBps:2000n,familyServiceHash:family.serviceHash,seller:family.seller.toLowerCase(),unitHash:family.unitHash,quantity:BigInt(family.quantity),endpointHash:family.endpointHash,baselineServiceHash:baseline?.serviceHash??null,baselineTransactionHash:baseline?.transactionHash??null,baselineAtomic:baseline?BigInt(baseline.unitPrice):null,baselineRegisteredAt:baseline?.registeredAt??null,currentServiceHash:current.serviceHash,currentTransactionHash:current.transactionHash,currentAtomic:BigInt(current.unitPrice),currentRegisteredAt:current.registeredAt}];});
 const priceIndex=(current:bigint[])=>components.reduce((value,c,index)=>value+c.weightBps*current[index]*bps/c.baselineAtomic!,0n)/bps;
 const indexBps=complete?priceIndex(components.map(c=>c.currentAtomic)):null;
 const closedDay=(end:number):MeasurementPriceSnapshot|null=>{
  const start=end-daySeconds;if(start<0||baselineAt===null||baselineAt>=start)return null;
  const selected=families.map(f=>latest(f!,end,true));
  return {start,end,indexBps:priceIndex(selected.map(s=>BigInt(s.unitPrice))),quotes:selected.map(s=>({category:s.category,serviceHash:s.serviceHash,transactionHash:s.transactionHash,unitPriceAtomic:BigInt(s.unitPrice),registeredAt:s.registeredAt}))};
 };
 const priorClosedDay=closedDay(todayStart),precedingClosedDay=closedDay(todayStart-daySeconds);
 const basketId=complete?digest({methodology:'equal-weight-five-category-registered-quotes-v1',baselineAt,components:components.map(c=>({category:c.category,weightBps:c.weightBps,familyServiceHash:c.familyServiceHash,baselineServiceHash:c.baselineServiceHash,baselineAtomic:c.baselineAtomic}))}):null;
 const provenance={blockNumber:input.blockNumber,blockHash:input.blockHash,asOf:input.asOf,fromTimestamp:input.fromTimestamp,inputHash:digest({...input,settlements:orders,services:quotes,agents:[...agents.values()].sort((a,b)=>a.agentId.localeCompare(b.agentId)),balances,refunds}),orderIds:orders.map(o=>o.orderId),settlementTransactionHashes:unique(orders.flatMap(o=>o.transactionHash?[o.transactionHash]:[])),serviceHashes:quotes.map(s=>s.serviceHash),serviceTransactionHashes:unique(quotes.map(s=>s.transactionHash)),refundSources:refunds.map(r=>({...r,transactionHash:r.transactionHash??null})),refundTimestampBasis:'supplied-record-time' as const,missingDeliveryTimestampOrderIds:orders.filter(o=>o.delivered&&eventTime(o,'delivered')===null).map(o=>o.orderId),missingAcknowledgmentTimestampOrderIds:orders.filter(o=>o.buyerAcknowledged&&eventTime(o,'acknowledged')===null).map(o=>o.orderId)};
 return {methodology:'obolos-observed-activity-v1',asset:'USDC',asOf:input.asOf,blockNumber:input.blockNumber,blockHash:input.blockHash,today,lifetime,
  activity:{methodology:'current-active-agent-operational-completion-v1',start:todayStart,endInclusive:input.asOf,activeAgentCount:activeAgents.length,fulfilledAgentCount:fulfilled.size,utilizationBps:activeAgents.length?BigInt(fulfilled.size)*bps/BigInt(activeAgents.length):null,activeAgentIds:activeAgents.map(a=>a.agentId),fulfilledAgentIds:[...fulfilled].sort(),lifetimeFulfilledAgentCount:lifetimeFulfilled.size},
  capital:{methodology:'current-active-executor-usdc-balances-v1',complete:missingExecutorAddresses.length===0,executorCount:balances.length,totalAtomic,knownBalanceAtomic,missingExecutorAddresses,balances,todayTurnoverBps:totalAtomic!==null&&totalAtomic>0n?today.grossPaymentsAtomic*bps/totalAtomic:null,lifetimeTurnoverBps:totalAtomic!==null&&totalAtomic>0n?lifetime.grossPaymentsAtomic*bps/totalAtomic:null},
  prices:{methodology:'equal-weight-five-category-registered-quotes-v1',basketId,baselineAt,complete,missingCategories,indexBps,baselineChangeBps:indexBps===null?null:indexBps-bps,components,priorClosedDay,precedingClosedDay,periodInflationBps:priorClosedDay&&precedingClosedDay&&precedingClosedDay.indexBps>0n?(priorClosedDay.indexBps-precedingClosedDay.indexBps)*bps/precedingClosedDay.indexBps:null,changeSincePriorCloseBps:indexBps!==null&&priorClosedDay&&priorClosedDay.indexBps>0n?(indexBps-priorClosedDay.indexBps)*bps/priorClosedDay.indexBps:null,purchasingPower:components.map(c=>({category:c.category,serviceHash:c.currentServiceHash,transactionHash:c.currentTransactionHash,unitHash:c.unitHash,quantity:c.quantity,unitPriceAtomic:c.currentAtomic,unitsPerUsdcMillionths:1000000000000n/c.currentAtomic,ordersPerUsdcMillionths:1000000000000n/(c.currentAtomic*c.quantity)}))},
  provenance,limitations:['Activity includes known same-owner transactions and measures operational completion, not independent demand or productivity.','Gross payments and seller allocations are observed transfers, not output valuations or value added.','Capital is the current canonical-USDC balance of distinct active executor wallets; it is not total economic capital.','Turnover divides observed gross spend by the current balance snapshot, not historical average capital.','Refund windows use the supplied record timestamp, which may differ from the transfer block timestamp.','Registered quotes do not prove current seller availability. Basket baselines begin only when all five categories exist.','Period inflation compares two complete closed UTC days; change since prior close separately compares the current partial day.','Missing delivery timestamps are counted only in lifetime totals and never assigned to a day.']};
}
