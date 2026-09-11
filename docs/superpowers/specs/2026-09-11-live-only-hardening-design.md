# Live-only Obolos hardening

User requirement: only the Ledger device may be emulated. All runtime data, model calls, service delivery, payments and economic evidence must be real. The user approved patching the six gaps identified in the audit.

The existing Arc deployment and historical payment journals remain authoritative. Do not replace them or reinterpret old receipts. Test fixtures may remain in automated tests; production cannot enter rehearsal, issue simulated receipts, or fabricate missing evidence.

## Changes

1. Retire the rehearsal product and reject new or advanced rehearsal jobs server-side. Preserve read-only historical exports. Keep the real research runner and Ledger Speculos integration.
2. Add a reusable local executor for a pinned platform agent, immutable service/input and bounded amount. Persist the complete intent before allowance/payment; verify policy, finalized settlement, delivery and acknowledgment. Resume the same order and operation names after interruption. Never turn an uncertain payment into another payment.
3. Deliver actual provider work for all five categories. Compute calculates input; data fetches real sources; verification checks explicit evidence; storage durably stores and retrieves content; inference calls the configured model through the private credential boundary. Category enabling follows successful readiness checks and bounded signed policy.
4. Add append-only authenticated evidence ingestion for valuations, all-resource costs, capital, active agents and fixed price baskets. Bind evidence to the deployment, order or closed window and signer, reject self-verification and contradictions, and feed validated records to the indexer. Missing evidence remains unavailable. Never invent independent demand or valuations.
5. Add seller offer retirement, buyer disputes, independent review records and proof-verified voluntary refunds. Existing atomic settlement is not escrow and cannot guarantee involuntary repayment; any remaining arbitration limitation must stay explicit.
6. Add authenticated scheduled indexing with bounded work, useful freshness reporting and retry of read-only operations. Run actual PostgreSQL integration checks, contract tests, application tests, typecheck, production build and relevant browser checks. Deploy and verify the public product when checks pass.

## Scope and truthfulness

Production testnet execution is real execution using test assets. Automated tests may isolate external services. A deterministic service is actual work, not a model. Same-operator demonstrations cannot establish independent demand. A signed valuation is an attestation with provenance, not objective proof. Existing fee splitting does not imply verifier payout.
