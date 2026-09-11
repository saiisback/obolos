# Obolos phase 2 implementation and review ledger

Approved specification: ../specs/2026-09-11-agentgdp-open-market-design.md.
User authorized implementation, subagents, testnet verification, and existing GitHub/Vercel deployment. Work remains in the requested ETHONLINE checkout on codex/obolos.

## Preflight corrections

| Boundary | Finding | Implementation decision |
| --- | --- | --- |
| Policy / settlement | Controller signatures omitted payer and complete service terms; allowance alone is not permission to debit. | Require transaction caller to be the policy-bound payer/executor; bind agent owner, payer, service hash, price/units, deadline, policy version and unique order ID. Never debit arbitrary allowance holders. |
| Contract deployment | Three mutually immutable addresses make naive sequential deployment impossible. | Deploy with predicted CREATE addresses or one-time controller wiring that permanently locks before settlement. Verify every linked address. |
| Payment / delivery | Existing API requires payment before delivering; spec calls it a completed order. | Settlement records a paid order and input hash. Delivery attestation is a separate immutable event; paid work is not automatically successful work. |
| Metrics / currency | Raw HBAR and USDC are incomparable. | Separate currency/unit cohorts. No combined monetary totals without explicit timestamped conversion evidence. |
| Paper / velocity | Spec substitutes gross volume for paper's GAP/M. | Implement paper velocity as eligible value-added / measured capital; expose gross payment turnover as a separate diagnostic. Unknown denominators produce unavailable values. |
| Paper / inflation | ARPI versus baseline differs from period inflation. | ARPI = fixed-weight price relatives; inflation = change from previous comparable index. Baseline-relative change is separately named. Do not renormalize missing basket components. |
| GAP / reputation | Delivery hashes do not prove useful output or prevent wash trading. | Verified value-added needs explicitly attested output/input accounting; otherwise unavailable. Report known same-owner/replay exclusions and limited evidence. |
| Split | 95/3/2/0 is a product configuration, not a formula in the paper. | Disclose it as approved testnet policy; review-pool proceeds are not automatic verifier wages. Bind fee version to order approval. |
| Roles / approval | An approval hash does not prove Ledger intent. | Verify the signed approval payload and authorized signer before recording an approval; on-chain controller identity alone is not hardware proof. |
| Registry / openness | Global curated allowlists conflict with open service publication. | Anyone can publish their own endpoint/recipient; buyer-owned mandates select permitted sellers. Platform policy limits still apply to its managed settlement route. |

## Deliverables

- [x] Contracts: policy, settlement, economic ledger, delivery/reputation counters; executable EVM tests for debit authorization, replay, limits, pause, fees, roles and immutability.
- [x] Metrics: paper-faithful integer ARPI/inflation, purchasing power, GAP, productivity, surplus, utilization, capital/velocity and transparent reputation with provenance and unavailable values.
- [x] Integration: chain configuration/ABIs, durable submissions, independently verified logs, idempotent DB indexing, public economy/score APIs, owner policy authorization.
- [x] Open services: versioned category/unit/input-output terms for seller APIs and explicit contract-settlement eligibility; preserve legacy signatures and receipts.
- [x] Workspace: Economy metrics, service categories, policy review, allocation/receipt links, developer integration instructions, responsive verification.
- [x] Release: contract deployment metadata and code checks, migration, bounded paid testnet execution, real observation and policy-response evidence, review fixes, commit/push/deploy.

## Task seams

Contract agent owns contracts/, scripts/contracts/, tests/economy-contract*. Metrics agent owns src/lib/economy/metrics.ts, reputation.ts, model.ts and their tests. Root owns integration, database, UI and release. No shared package edits by agents; dependency requests go through root. Review agents are read-only and run after concrete diffs exist.

## Validation

Use real local EVM execution for Solidity behavior, meaningful pure-math tests, PostgreSQL isolation and indexing tests, Next production build and browser tests. Deploy only after review. Record real testnet transaction hashes separately from test fixtures. Do not overwrite/retry old economic intents. Missing deployment authority or funding is reported without fabricating success.

## Release evidence

The real production-path Arc testnet order, exact fee allocation, scoped-agent delivery, separate seller/buyer attestations, two selected-quote ARPI records, signed cap tightening and unpaid price-shock rejection are recorded in [release evidence](../../evidence/2026-09-11-economy-release.md). Final checks: 388 application tests across 56 files with real PostgreSQL integration, six desktop/mobile browser tests, executable local-EVM contract coverage, typecheck and production build. Release completion does not mean all paper metrics have populated historical data: independent valuations, full resource costs, capital observations, additional enabled categories and broader independent market activity remain explicit follow-on work.
