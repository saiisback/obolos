export const resourceCategories = ['data', 'compute', 'inference', 'verification', 'storage'] as const;
export type ResourceCategory = typeof resourceCategories[number];
export type EconomyAsset = 'USDC' | 'HBAR';
export interface PriceComponent { id:string; category:ResourceCategory; unit:string; asset:EconomyAsset; baselineAtomic:bigint; currentAtomic:bigint|null; weightBps:bigint; sourceReference?:string }
export interface EconomicSettlement {
  orderId:string; agentId:string; seller:string; asset:EconomyAsset; category:ResourceCategory;
  unit:string; quantity:bigint; principalAtomic:bigint; sellerAtomic:bigint;
  timestamp:number; delivered:boolean; buyerAcknowledged:boolean; sameOwner:boolean;
  /** Gross seller allocation observed in finalized settlement evidence, before separately accounted refunds. */
  observedRevenueAtomic?:bigint|null;
  // Every valuation and cost is expressed in this settlement asset’s atomic units (USDC 6, HBAR 8 decimals).
  // Cross-currency costs require conversion evidence in the referenced signed cost record before aggregation.
  // A delivered API response is not a monetary output valuation.
  verifiedFinalOutputAtomic:bigint|null; verifiedIntermediateInputAtomic:bigint|null;
  /** Attested total production cost in asset atomic units, including payment, gas, inference and other consumed resources. */
  verifiedResourceCostAtomic?:bigint|null;
  /** Immutable provenance for intermediate-input and all-resource cost claims. */
  costEvidenceReference?:string|null;
  costEvidenceSource?:'independent-attestor'|'producer-reported'|null;
  valuationReference:string|null;
}
export interface ArpiObservation {
  methodology:'obolos-agentgdp-v1'|'obolos-agentgdp-v2'; asset:EconomyAsset; end:number;
  basketIdentity:string; arpiBps:bigint;
}
export interface MetricWindow {
  start:number; end:number; asset:EconomyAsset; activeAgentIds:string[]; capitalAtomic:bigint|null;
  previousArpi:ArpiObservation|null;
}
export interface EconomyMetrics {
  methodology:'obolos-agentgdp-v2'; asset:EconomyAsset; start:number; end:number;
  basketIdentity:string|null; arpiBps:bigint|null; inflationBps:bigint|null; baselineChangeBps:bigint|null;
  grossPaymentsAtomic:bigint; sellerRevenueAtomic:bigint; gapAtomic:bigint|null;
  surplusAtomic:bigint|null; productivityBps:bigint|null; moneyVelocityBps:bigint|null;
  paymentTurnoverBps:bigint|null; utilizationBps:bigint|null;
  purchasingPower:{componentId:string; unit:string; tasksPerCurrencyMillionths:bigint|null}[];
  settlementCount:number; valuedSettlementCount:number; excludedSelfPayments:number;
  limitations:string[];
}
