# Hosted marketplace implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement and review bounded ownership tasks. Existing user authorization covers this checkout, subagents, commits and deployment.

**Goal:** Hosted buyer/seller agent commerce with paid verification, real testnet receipts and usable onboarding.
**Architecture:** Vercel+Neon own listings/orders/verifier/results; private owner-pinned broker owns spending; v2 signed scope binds seller terms. Legacy signed scopes and journals remain valid.
**Tech Stack:** Next.js 16.3.4, TypeScript, Neon/Postgres, viem, Circle CLI, existing Hedera x402, Speculos.
**Spec:** docs/superpowers/specs/2026-09-10-marketplace-design.md

## Global constraints

Testnet only. Fixed marketplace origin. No credentials in source/output. Seller payout is authenticated owner address. No payment replay. Explicit hosted verification and emulated Ledger labeling. Canonical checkout user requested; branch codex/obolos. Read installed Next route docs before edits.

## Task 1: Marketplace service and hosted verifier
- [ ] Own src/lib/market/**, src/lib/platform/marketplace.ts, src/app/api/market/**, migration006 and market tests.
- [ ] Test strict service terms, buyer/seller isolation, wrong counts, wrong transfers, transaction reuse, expired/changed orders before implementation.
- [ ] Implement contracts from spec; mandate verificationService is root-owned integration; coordinate exact exports.
- [ ] Service APIs use existing auth, Origin, rateLimit, bounded readJson and platformError. Orders require assigned live runner and exact signed scope. Atomic SQL guards transaction reuse and seller-owned statistics.
- [ ] Confirm endpoint checks canonical Arc receipt/token/amount/from/to/time, stores result, supports exact repeat without transfers.
- [ ] Run targeted tests; root reviews concurrency/security and integrates.

## Task 2: Buyer/seller interface
- [ ] Own src/components/platform/marketplace.tsx, /marketplace page, platform CSS additions, shell nav, agent-execution buyer selection and result UI.
- [ ] Reuse existing visual system. Browse only real listings. Seller auth, publish form, pause/price edit, confirmed earnings; no fake data.
- [ ] New mandate prepare request passes verificationServiceId; show selected recipient, price, revision before signing. Status/result independent confirmation and testnet funding information.
- [ ] Typecheck and browser desktop/mobile; root reviews buyer/seller ownership and signed message flow.

## Task 3: Root execution integration
- [ ] Preserve v1 message, add strict optional service snapshot to v2 mandate and run contract.
- [ ] Prepare locks snapshot, ensure budget sufficient; v2 runner includes complete signed scope and one-time runner authority in verify broker call.
- [ ] Broker locally pins marketplace owner/origin, validates signature, matching purchased/generated evidence, immutable order terms; pays exact selected price/recipient through existing Circle idempotency; uses durable order/receipt checkpoints.
- [ ] Force worker output to include exact quantitative claim lines, checked independently by service. Keep legacy report semantics honest.
- [ ] Validate uploaded v2 settlement through server-side proof path with global transaction uniqueness. Surface proof and seller result rather than trusting runner flags.
- [ ] Tests: v1 compatibility, seller tampering/price change, forged mandate, payment/result retries and proof binding. No automatic retry after ambiguous transfer.

## Task 4: Operate and release
- [ ] Apply additive migration to Neon, run isolated DB tests and full suite/build.
- [ ] Start Docker and broker without destroying locks/journals; configure pinned owner privately for dedicated test.
- [ ] Deploy tracked code through Git; verify public seller+buyer APIs and UI, run one bounded live marketplace job with separate seller address and both chain proofs.
- [ ] Persist private fixture evidence, publish sanitized release evidence and update current docs. Commit/push, verify remote commit/deployment. State any externally blocking credential availability accurately.
