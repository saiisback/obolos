# Hedera Bonus Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for independent implementation and review.

**Goal:** Add evidenced Hedera agent-commerce integrations and audit Arc/Ledger fit.
**Architecture:** Separate A2A negotiation, Hedera public identity/audit, and token/scheduled commerce modules. Keep signing in the existing private broker; HTTP handlers validate public protocol data and payment proofs.
**Tech Stack:** Next.js 16.3.4, TypeScript, Neon, @x402/hedera 2.25.0, @hiero-ledger/sdk 2.85.0, A2A 0.3.0, HCS-14.
**Spec:** docs/superpowers/specs/2026-09-12-hedera-bonus-design.md

## Global constraints
- Only testnet real execution; Ledger hardware alone may be emulated.
- Read installed Next route-handler docs before touching routes.
- No keys, Ring plaintext, auth cookies or signed transaction payloads in public output.
- Persist transaction identity before dispatch, stop on uncertainty, never repeat a payment under a new identity.
- Work in this isolated worktree; do not change the saved submission.

### Task 1: A2A negotiation and payment integration
Files: new src/lib/hedera/a2a.ts, service Agent Card/A2A route, tests/hedera-a2a.test.ts, private buyer script. Own these files only.
- [ ] Write rejection and acceptance tests for JSON-RPC message/send, invalid request, bounded quantity, expired quote, proposal above/below service price and task identity.
- [ ] Implement versioned Agent Card, priced proposal/acceptance exchange and client orchestration through the existing HBAR x402 purchase function. No raw payer key at HTTP boundary.
- [ ] Test real resource response validation and preserve uncertain-payment stop behavior.
- [ ] Document run command and perform code review.

### Task 2: HCS-14 identity and HCS payment audit
Files: new src/lib/hedera/identity.ts, src/lib/hedera/audit.ts, scripts/hedera-register.ts, tests/hedera-identity.test.ts and tests/hedera-audit.test.ts. Own these files only.
- [ ] Test official HCS-14 canonical hash vector, normalization, invalid parameters, audit payload privacy and mirror proof checks.
- [ ] Implement deterministic UAID generation and compact profile/audit payloads, restricted-submit topic registration and mirror verification helpers.
- [ ] Add private operator script using Ring decryption and durable transaction identity; output public proof metadata only. Do not execute funded transactions in a child agent.
- [ ] Document interfaces for identity/audit evidence and perform code review.

### Task 3: Native HTS and scheduled service payments
Files: new src/lib/hedera/commerce.ts, src/lib/platform/hedera-commerce.ts, additive migration, private operator script, affected tests. Parent owns these and shared dependency changes.
- [ ] Test exact token payment requirements, scheduled transfer bounds and replay rejection before implementation.
- [ ] Add optional HTS x402 service without changing HBAR semantics; verify native token transfer and association prerequisites.
- [ ] Add finite owner-authorized scheduled transfer workflow with exact mirror proof before metered resource delivery.
- [ ] Record live testnet IDs in sanitized evidence; classify unsupported network features as blocked, never simulated.

### Task 4: Product integration, eligibility audit and release
Files: workspace Developers integration view, public evidence route, docs/hedera-bonus.md, docs/submission.md.
- [ ] Connect public identity, A2A, audit, token and schedule proof data to the app.
- [ ] Recheck current official Arc and Ledger requirements against real source and receipts.
- [ ] Run application tests, typecheck/build and independent final review; repair findings.
- [ ] Deploy authorized testnet app changes and exercise real paid flow, retaining evidence and honest limitations.

## Preflight rulings
The user explicitly authorized integration, fixes and real testnet runs in this session; routine reversible implementation proceeds without another design approval. The design above makes the work reviewable. New mainnet deployment is not authorized by this task. Existing untracked output and artwork in the original checkout remain untouched.
