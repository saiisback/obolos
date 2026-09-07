# AgentGDP approved design

The user approved the six-stage managed research workflow and explicitly requested full implementation using Next.js, TypeScript and subagents. This file records that scope; it does not assert sponsor eligibility or live payment completion.

## Product
Compare up to three public GitHub repositories using a metered repository evidence service. A human defines separate HBAR and USDC allowances, a unit-price ceiling, permitted data providers and mandate expiry. A planner discovers providers, chooses the lowest allowed quote, purchases evidence through Hedera x402/Blocky402, and commissions a worker report and paid Arc verification. A price increase causes rerouting or a cryptographically authorized allowance increase. Every action has an audit entry and every payment has a receipt. Report quality means source-backed factual checks, not an investment or exhaustive software-quality judgment.

## Boundaries
- Next.js App Router + TypeScript frontend/backend. Responsive operator console with run history, report, mandate, evidence and connection status.
- Rehearsal executes the same policy/state flow with labeled fixtures and simulated receipts. No fake transaction hashes or claims of real hardware verification.
- Live mode requires an authenticated operator, configured broker, funded testnet accounts, Ledger Key Ring provisioning and an inference provider. It must fail closed without these.
- Native Hedera x402 is separate from Circle Agent Wallets on ARC-TESTNET. No bridge, shared balance or claim of atomic cross-chain settlement.
- A separate broker process owns Key Ring decryption, provider credentials, Hedera signing and Circle CLI credentials. The app receives narrow results. The LLM has no filesystem, shell, wallet tool or policy-write access.
- Key Ring protects provisioning/storage; plaintext exists inside the trusted broker at runtime. A compromised broker is outside the claimed protection boundary.
- Mandate escalation uses a fresh expiring, run-bound message verified against a configured Ledger controller address. Hardware signing occurs on the operator machine. Rehearsal approvals are explicitly simulated and cannot authorize live runs.
- Server validates repo slugs, provider allowlist, exact asset/network/payee/amount, budgets, expiry, receipt settlement and approval replay. Payments use stable idempotency keys; uncertain transfers are not automatically retried.
- Public resource service exposes machine-readable discovery, price quotes and a paid evidence endpoint; metering is per repository, not a flat fee regardless of work.
- Single operator/local disk deployment for the MVP. Browser sessions own their run history. A single server process serializes writes and actions, persists atomically, and does not claim distributed concurrency safety.

## Acceptance
Complete a rehearsal job; export its evidence; apply a price change before purchase; block over-limit requests; reject invalid or replayed approvals; approve and resume; pause before further spending. Verify real integration code against current SDK types. Obtain external evidence before marking Ledger/Hedera/Arc requirements demonstrated.

## External submission gates
Public GitHub URL, externally hosted service, actual Blocky402 paid request, actual Arc USDC payment, physical Ledger demo, developer feedback, architecture diagram and a 2–4 minute narrated video. The pre-event paper's eligibility needs organizer determination. Record all AI assistance and pre-existing material.
