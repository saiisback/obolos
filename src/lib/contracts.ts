import type { VerificationService } from './market/contracts';
import type { SignedMandate } from './platform/execution-contracts';
export type Mode = 'rehearsal' | 'live';
export type RunStatus = 'ready' | 'running' | 'awaiting_approval' | 'paused' | 'completed' | 'failed';
export type Stage = 'mandate' | 'discovery' | 'purchase' | 'report' | 'verification' | 'complete';
export interface Mandate {
  dataBudgetAtomic: number; maxDataUnitPriceAtomic: number; verificationBudgetAtomic: number;
  allowedProviders: string[]; expiresAt: string; version: number; verificationService?: VerificationService;
}
export interface Provider {
  id: string; name: string; description: string; network: string; asset: 'HBAR' | 'USDC';
  unit: string; unitPriceAtomic: number; endpoint?: string;
}
export interface RepoEvidence {
  repo: string; description: string; stars: number; forks: number; openIssues: number;
  pushedAt: string; language: string; license: string; sourceUrl: string; fetchedAt: string;
}
export interface Receipt {
  id: string; requestId: string; mode: Mode; network: 'hedera:testnet' | 'arc:testnet';
  asset: 'HBAR' | 'USDC'; amountAtomic: number; units: number; provider: string;
  status: 'simulated' | 'settled'; timestamp: string; transactionId?: string; explorerUrl?: string; orderId?: string; recipient?: string;
}
export interface Report {
  title: string; summary: string; recommendation: string; evidence: RepoEvidence[];
  generatedBy: 'template' | 'model'; createdAt: string;
  checks: {label: string; passed: boolean; detail: string}[]; verified: boolean;
}
export interface AuditEvent {
  id: string; timestamp: string; actor: 'supervisor' | 'planner' | 'broker' | 'worker' | 'verifier';
  kind: 'info' | 'success' | 'warning' | 'blocked'; title: string; detail: string;
  previousHash: string; hash: string;
}
export interface ApprovalRequest {
  signerMode?: 'usb' | 'speculos';
  nonce: string; message: string; expiresAt: string; proposedMandate: Mandate; reason: string;
}
export interface AuthorizationProof {
  mode: Mode; nonce: string; message: string; verifiedAt: string;
  previousMandate: Mandate; approvedMandate: Mandate;
  signer?: string; signature?: string; signerMode?: 'usb' | 'speculos';
}
export interface Run {
  id: string; mode: Mode; title: string; repos: string[]; status: RunStatus; stage: Stage;
  createdAt: string; updatedAt: string; mandate: Mandate; providers: Provider[];
  selectedProvider?: string; dataSpentAtomic: number; verificationSpentAtomic: number;
  evidence: RepoEvidence[]; receipts: Receipt[]; events: AuditEvent[]; report?: Report;
  approval?: ApprovalRequest; shockApplied: boolean; error?: string;
  authorizations?: AuthorizationProof[];
}
export interface IntegrationStatus {id: string; name: string; ready: boolean; detail: string}
export interface DashboardState {
  runs: Run[]; integrations: IntegrationStatus[]; liveEnabled: boolean; operatorAuthenticated: boolean;
  priceControlsEnabled?: boolean;
}
export interface DataPurchase {
  runId: string; requestId: string; repos: string[]; providerId: string;
  maxAmountAtomic: number; unitPriceAtomic: number; mandateExpiresAt: string;
  a2aOfferToken?: string;
}
export interface VerificationPurchase {runId: string; requestId: string; maxAmountAtomic: number; report: Report; mandateExpiresAt: string; market?: {mandate:SignedMandate;runnerToken:string}}
export interface BrokerHealth {ready: boolean; integrations: IntegrationStatus[]}
// All routes return these envelopes. The browser must never receive signing or API credentials.
export type ApiResult<T> = {data: T} | {error: string};
