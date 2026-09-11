import type {EconomyMetrics} from './model';
export interface PolicyThresholds {inflationBps:bigint;minimumProductivityBps:bigint;maximumTurnoverBps:bigint;minimumUtilizationBps:bigint}
export interface PolicyProposal {signal:string;action:'review-price-cap'|'review-agent-budget'|'review-throttle'|'review-idle-agents'|'pause-reinvestment';reason:string;requiresHumanApproval:true}
/** Diagnostic proposals never submit a transaction or expand an agent mandate. */
export function proposeEconomyPolicy(metrics:EconomyMetrics,limits:PolicyThresholds):PolicyProposal[]{
 if(Object.values(limits).some(v=>v<0n))throw Error('Policy thresholds must be nonnegative');
 const proposals:PolicyProposal[]=[];
 const add=(signal:string,action:PolicyProposal['action'],reason:string)=>proposals.push({signal,action,reason,requiresHumanApproval:true});
 if(metrics.inflationBps!==null&&metrics.inflationBps>limits.inflationBps)add('resource-inflation','review-price-cap','Comparable resource prices rose beyond the selected threshold. Review unit prices and approved alternatives.');
 if(metrics.productivityBps!==null&&metrics.productivityBps<limits.minimumProductivityBps)add('productivity','review-agent-budget','Attested output value per resource cost fell below the selected threshold.');
 if(metrics.paymentTurnoverBps!==null&&metrics.paymentTurnoverBps>limits.maximumTurnoverBps)add('payment-turnover','review-throttle','Gross payments relative to attested capital exceed the selected limit. This is not the paper’s GAP-based money velocity.');
 if(metrics.utilizationBps!==null&&metrics.utilizationBps<limits.minimumUtilizationBps)add('utilization','review-idle-agents','Few eligible agents produced buyer-accepted work in this window.');
 if(metrics.surplusAtomic!==null&&metrics.surplusAtomic<0n)add('negative-surplus','pause-reinvestment','Attested output revenue is below measured resource spending. Review funding before reinvestment.');
 return proposals;
}
/** Paper capital accounting is a projection, never token issuance or an actual transfer. */
export function projectCapital(input:{capitalAtomic:bigint;surplusAtomic:bigint;savingsBps:bigint;depreciationAtomic:bigint}){
 if(input.capitalAtomic<0n||input.savingsBps<0n||input.savingsBps>10000n||input.depreciationAtomic<0n)throw Error('Invalid capital accounting inputs');
 const retainedAtomic=input.surplusAtomic*input.savingsBps/10000n;
 const nextCapitalAtomic=input.capitalAtomic+retainedAtomic-input.depreciationAtomic;
 return {nextCapitalAtomic,retainedAtomic,insolvent:nextCapitalAtomic<0n,kind:'accounting-projection' as const};
}
