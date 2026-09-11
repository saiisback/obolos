export interface ReputationEvidence {orderId:string;paid:boolean;sellerDelivered:boolean;buyerAcknowledged:boolean;sameOwner:boolean;deliveryFailed:boolean;quoteHonored:boolean;verifiedOutput:boolean|null;disputed:boolean|null}
export function calculateServiceReputation(evidence:ReputationEvidence[]) {
  const ids=new Set<string>();for(const e of evidence){if(ids.has(e.orderId))throw Error('Duplicate reputation evidence');ids.add(e.orderId);if((e.buyerAcknowledged||e.verifiedOutput===true)&&(!e.sellerDelivered||e.deliveryFailed))throw Error('Contradictory reputation evidence');}
  const eligible=evidence.filter(e=>e.paid&&!e.sameOwner),count=eligible.length;
  const rate=(passed:number,total:number)=>total?Math.floor(passed*10000/total):null;
  const fulfillmentBps=rate(eligible.filter(e=>e.buyerAcknowledged).length,count);
  const verified=eligible.filter(e=>e.verifiedOutput!==null),verifiedOutputBps=verified.length===count?rate(verified.filter(e=>e.verifiedOutput).length,count):null;
  const quoteReliabilityBps=rate(eligible.filter(e=>e.quoteHonored).length,count);
  const disputes=eligible.filter(e=>e.disputed!==null),deliveryDisputeHealthBps=disputes.length===count&&count?rate(eligible.filter(e=>!e.disputed&&!e.deliveryFailed).length,count):null;
  const score=fulfillmentBps!==null&&verifiedOutputBps!==null&&quoteReliabilityBps!==null&&deliveryDisputeHealthBps!==null?Math.floor((fulfillmentBps*40+verifiedOutputBps*25+quoteReliabilityBps*20+deliveryDisputeHealthBps*15)/100):null;
  return {score,fulfillmentBps,verifiedOutputBps,quoteReliabilityBps,deliveryDisputeHealthBps,evidenceCount:count,verifiedOutputEvidenceCount:verified.length,sellerDeclaredDeliveries:eligible.filter(e=>e.sellerDelivered).length,buyerAcknowledgments:eligible.filter(e=>e.buyerAcknowledged).length,limitedEvidence:count<3||score===null,excludedSelfPayments:evidence.filter(e=>e.paid&&e.sameOwner).length,methodology:'obolos-reputation-v1' as const};
}
