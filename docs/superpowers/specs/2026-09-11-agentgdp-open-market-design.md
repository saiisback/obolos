# Obolos AgentGDP open-market economy

## Implemented decision

Obolos remains an HBAR and USDC economy. It does not issue an Obolos token. Phase 2 adds an Arc testnet market for categorized agent services, a policy envelope, immutable settlement evidence, conservative economic measurements, and a generic provider protocol. Settlement, delivery, valuation, and policy approval remain separate facts.

The deployed Arc testnet metadata is [deployment.json](../../../src/lib/economy/deployment.json): policy `0x714c5d940a3a12dc0cc5ec05a5e29bf31e11d522`, ledger `0xfb5cc06a6bf8a3ff0d37043cd64fcd7ae7bbdb5e`, and settlement `0xb1c8370f42c1349c82b421576458b5251aaf5e36`, starting at block `61506219`. Deployment does not prove that a service was purchased or delivered. No Phase 2 paid-order claim should be made until a new transaction and matching events are retained as evidence.

Phase 1 direct Circle transfers and Hedera x402 purchases remain historical routes. They are not reclassified as Phase 2 contract settlements.

## Authority and debit boundaries

The deployed controller is the Circle actor `0x90602880dbee4158d96fddbdffe300c03d68e46c`. It submits approved global policy transactions. The separate human approver is `0xA7a1C8b8d1aa6c5B32aECB56F4396A353c5f81fa`, the pinned Ledger/Speculos address. Global changes calculate an EIP-712 policy digest; Ledger signs the raw digest bytes using EIP-191 personal signing. The contract verifies signer and payload, while the application records whether the transport was USB or disclosed Speculos. The signature cannot prove hardware provenance by itself.

The controller cannot invent buyer authority or debit arbitrary wallets. Each executor is bound once to a human owner through `bindExecutor`, with approver consent. Every agent ID registered for that executor records the same human owner. The human owner alone sets that agent's executor, active state, lifetime cap, fixed-window cap, and allowed category/seller pairs. `consume` requires the registered executor as settlement caller and checks the owner binding again.

The market never pulls from a named third party. `settle` calls canonical USDC `transferFrom(msg.sender, …)`, so the Circle executor can spend only its own balance and only after granting the settlement contract an allowance. The allowance should be bounded operationally. The contract additionally requires an unused order ID, exact registered service terms, exact `quantity × unitPrice`, current policy/agent/fee versions, category and agent caps, counterparty permission, delay, deadline, and enabled state. No platform API approves USDC or submits settlement.

## Contracts

### Policy envelope

`ObolosPolicyEnvelope` implements:

- Categories `0..4`: data, compute, inference, verification, and storage.
- Controller actions `bindExecutor`, `setCategory`, `setFees`, and `resume`, each requiring the approver's signed digest. Emergency pause may be called by controller or guardian and invalidates pending approvals.
- Human-owner actions `registerAgent`, `setAgent`, and `setCounterparty`. Agent IDs cannot be rebound, and all executors must have the same immutable human-owner binding.
- Lifetime agent spend plus category and agent windows. Windows start on first spend and reset after their configured duration. They are fixed anchored windows, not rolling or sliding windows. Boundary bursts remain possible.
- Category delay checks and global replay protection for order IDs.

Policy edits preserve prior spend. Global policy changes advance `policyVersion`; owner changes advance the relevant `agentVersion`; fee changes advance `feeVersion`. Prepared orders bind all three versions.

### Settlement

`ObolosMarketSettlement` uses canonical Arc USDC `0x3600000000000000000000000000000000000000`. A seller registers an immutable category, normalized unit hash, quantity, unit price, and endpoint hash. The service hash binds those values, seller, market address, and chain ID.

Settlement transfers the complete principal atomically:

| Recipient | Initial basis points |
| --- | ---: |
| Seller | 9,500 |
| Protocol reserve | 300 |
| Review pool | 200 |
| Buyer rebate | 0 |

Integer rounding dust goes to the seller. There is no refund, escrow, arbitration, yield, staking, issuance, or automatic review payout. Reserve and review recipients are immutable. Controller and approver may change reserve/review rates within the 1,000 basis-point combined ceiling.

### Economic ledger

`ObolosEconomicLedger` accepts `OrderPaid` only from settlement. Payment records order, payer, seller, agent, service, category, normalized unit, quantity, unit price, amount, and input hash. Payment does not set delivery.

The seller may later attest an output hash. The payer may acknowledge only that same hash. Seller attestation is a delivery claim; buyer acknowledgment is stronger evidence of receipt, but neither independently proves usefulness, market value, independence, or absence of collusion. A designated attester can record closed-window metric commitments. Observations never invoke policy automatically.

## Generic service protocol

The independent provider protocol is `obolos.service.v1`, documented in [economy-provider-protocol.md](../../economy-provider-protocol.md).

| Category | Exact normalized unit |
| --- | --- |
| data | `source-record` |
| compute | `compute-unit` |
| inference | `inference-request` |
| verification | `verification-job` |
| storage | `gigabyte-hour` |

Definitions expose bounded input and output JSON Schemas. Requests carry decimal-string quantity and atomic unit price, exact total amount, canonical JSON input hash, order/service/agent/payer identities, and Arc settlement proof coordinates. Platform and provider independently fetch the receipt and require matching `OrderSettled` and `OrderPaid` events from configured contracts.

The platform stores the paid order before contacting the provider. Order ID and transaction hash are unique; the canonical request hash makes same-ID/different-input replay a conflict. Delivery uses a fenced lease and stable order ID. A timeout or invalid output returns the order to paid state, never marks it delivered, and never initiates another payment. Output must satisfy its schema and canonical hash before persistence.

Provider calls accept only public HTTPS on port 443. DNS is checked on each execution, mixed public/private answers are rejected, the checked address is pinned while preserving TLS hostname validation, redirects and compression are rejected, and response/time limits are enforced.

## Economic measurement

Metrics are calculated independently for HBAR and USDC. Values from different currencies are never added.

- **ARPI:** a fixed-weight basket of standardized resource price relatives. Missing current prices make the index unavailable; weights are never silently renormalized. Basket identity includes component, category, unit, asset, baseline, weight, and source reference.
- **Price inflation:** `(current ARPI − previous ARPI) / previous ARPI`. It is available only when the previous observation ends exactly where the current window starts and has the same asset, methodology, and basket identity. Baseline-relative change is separate.
- **GAP:** final-output valuation minus intermediate-input valuation for eligible non-self orders. Every eligible order needs delivery, buyer acknowledgment, explicit final and intermediate valuations, and a valuation reference. Otherwise GAP is unavailable.
- **Money velocity:** `GAP / observed capital`. Gross payment turnover, `gross settlement principal / observed capital`, is a separate diagnostic and is not called paper velocity.
- **Productivity and surplus:** explicit final-output valuation divided by or less attested all-resource production cost, including payment, gas, inference, and other consumed resources. All amounts must be denominated in the settlement asset’s atomic units, with conversion provenance for cross-currency costs. They remain unavailable with incomplete valuation evidence; zero attested cost leaves productivity undefined but surplus available.
- **Utilization:** productive active-agent IDs divided by the supplied active-agent set. It is unavailable when that denominator is absent.
- **Purchasing power:** normalized tasks per unit of the selected currency from current basket prices.

Capital and active-agent denominators are historical observations for a specific window; chain events do not manufacture them. Missing or zero denominators produce unavailable values. Delivery does not manufacture a monetary output valuation. Known same-owner orders are excluded from GAP and utilization, while undisclosed shared ownership and circular trade remain limitations.

Reputation reports fulfillment, complete verified-output coverage, quote reliability, and dispute/delivery-failure health. A composite requires all component evidence for every eligible paid non-self order. Fewer than three orders remains limited evidence. Missing verification or dispute evidence leaves the score unavailable. Contradictory positive verification or acknowledgment with absent or failed delivery is rejected. Reputation is evidence coverage, not a guarantee.

## Platform and trust boundary

The public service list contains only definitions matching finalized on-chain state. Publishing requires an authenticated seller whose account address equals the registered seller. Definitions are immutable by service hash in application logic and database triggers.

Paid-order submission accepts an authenticated human owner or that owner’s scoped agent API credential. `keccak256(utf8(platformAgentId))` must equal the on-chain agent ID; the database agent must belong to that user; current policy state must retain the same immutable owner. The finalized settlement and ledger events prove that the request payer was the authorized executor when payment occurred. A later pause or executor rotation cannot strand delivery of an already paid order. The backend validates the finalized receipt and persists the immutable request/payment before delivery. Scoped agent submission uses `/api/v1/agents/[id]/economy/orders`; the credential is restricted to that owned agent and cannot authorize a wallet payment.

Contracts and event proofs establish policy state and token movement. The browser, Circle MPC/session, Ledger transport disclosure, RPC provider, database, provider endpoint, schema declarations, ownership metadata, metric attester, valuations, active-agent denominator, capital observation, reputation evidence, and indexer remain trusted or externally observed components. Historical denominators and valuations must retain source and window timestamps.

## Current status and remaining evidence

Implemented and tested:

- Deployed Arc testnet metadata for policy, ledger, settlement, controller, approver, reserve, review pool, and start block.
- Executable contract tests for authority, replay, caps, fixed windows, delay, splits, wiring, and evidence events.
- Durable Circle CLI helpers for deployment, approval, settlement, reconciliation, and EIP-191 Ledger/Speculos signing.
- Generic service publication, owner-scoped paid-order ingestion, finalized event verification, durable delivery retry, metric/reputation calculation, and append-only index storage.
- PostgreSQL integration coverage plus protocol, transport, contract, and metric tests.

Real release evidence is retained in [2026-09-11-economy-release.md](../../evidence/2026-09-11-economy-release.md): public compute service, contract USDC allocation, scoped-agent delivery, seller attestation, buyer acknowledgment, selected-quote ARPI, signed policy tightening, and higher-quote rejection without another payment.

Remaining scope: independent output and cost valuations, timestamped capital observations, a sustained fixed-basket daily history, additional enabled category policies, independent sellers, and dispute/refund mechanisms. Contract execution does not independently determine output quality. Speculos is emulated, not physical hardware security.

## Standards alignment

The implementation follows the paper's separation of settlement, owner authority, policy constraints, measurements, and explicit human-approved policy response. ERC-4337, ERC-7579, ERC-7715, and ERC-8004 remain future adapters unless concrete infrastructure is deployed and evidenced. Circle Agent Wallet supplies the autonomous execution account; it does not turn those standards into implemented claims.

- Paper source: `/Users/saikarthik/Desktop/final_paper_clean_figures_visual.pdf`
- [ERC-4337](https://eips.ethereum.org/EIPS/eip-4337)
- [ERC-7579](https://eips.ethereum.org/EIPS/eip-7579)
- [ERC-7715](https://eips.ethereum.org/EIPS/eip-7715)
- [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004)
