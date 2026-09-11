# Obolos AgentGDP open-market economy

## Decision

Obolos remains an HBAR and USDC economy. It will not issue, mint, or market a new Obolos token. “Inflation” means the **Agent Resource Price Index (ARPI)**: a transparent index of changing prices for standardized agent resources. The market is an open registry of seller-operated endpoints with categorized settlement, policy-bound buyers, measured economic signals, and a human-owned policy authority.

This design implements the management boundary described in *Managing Autonomous Agent Economies on Ethereum*: settlement moves value, while a policy layer turns categorized settlement evidence into explicit, auditable economy-wide constraints. It does not claim that payments prove real-world value, eliminate risk, or make the entire runtime decentralized.

## Scope and phases

Phase 1 is complete: Obolos has public discovery, seller-operated HTTPS repository-verifier services, buyer mandates, Hedera x402 evidence purchases, direct Arc test-USDC payments, paid-order delivery/retry, and chain-receipt evidence.

Phase 2 adds the AgentGDP economic-management layer in three deployable components:

1. **`ObolosMarketSettlement`** on Arc testnet records an authorized completed order and atomically splits canonical USDC between seller, protocol reserve, verifier/review pool, and an optional buyer rebate. It never custody-holds balances after settlement.
2. **`ObolosPolicyEnvelope`** stores the market constitution: allowed categories and counterparties, category caps, agent budgets, velocity windows, policy status, threshold rules, and a controller address. The controller is initially the user’s EOA. Material changes require a direct controller transaction and an associated Ledger/Speculos approval record in Obolos; the contract is the source of enforceable policy state.
3. **`ObolosEconomicLedger`** receives settlement attestations from the settlement contract, stores immutable category/price/quantity/output hashes, and emits events used to compute AgentGDP measurements. It records no report, API credential, model output, private runner identity, or raw evidence.

An indexer in the existing Next.js/Neon application reads these events, calculates the metrics below from a deterministic time window, presents the result in the supervisor console, and proposes a policy action. It cannot silently change policy. The controller submits or approves the resulting on-chain policy transaction.

## Economic model

Each listing declares a fixed resource category:

| Category | Unit | Price input to ARPI | Verified output basis |
| --- | --- | --- | --- |
| `data` | source record | USDC or HBAR per record | purchased evidence receipt |
| `compute` | normalized compute unit | USDC per unit | provider delivery hash |
| `inference` | normalized request/token bundle | USDC per unit | provider delivery hash |
| `verification` | verification job | USDC per job | fulfilled order + checks hash |
| `storage` | normalized storage unit-period | USDC per unit | provider delivery hash |

`quantity` and `unitPrice` are integer atomics. An order is accepted only if its category is enabled, seller is approved, price is within the current category cap, and the buyer agent has both a remaining budget and velocity allowance. A seller’s endpoint is discovery metadata; the settlement recipient is the immutable on-chain listing recipient.

### Settlement split

Every successful USDC order uses basis points that sum to 10,000. The initial testnet default is deliberately conservative:

| Recipient | Default | Purpose |
| --- | ---: | --- |
| Seller | 9,500 bps | payment for completed agent work |
| Protocol reserve | 300 bps | future sponsored monitoring / operations, visible on chain |
| Verifier/review pool | 200 bps | funds verified dispute/review work; no automatic payout in phase 2 |
| Buyer rebate | 0 bps | disabled until a separate anti-sybil policy is implemented |

Only the controller can change a split, and it must satisfy the policy envelope’s maximum fee. The contract transfers the four shares in the same transaction and emits the exact allocation. There is no token issuance, automatic yield, staking reward, or promise of return.

### AgentGDP measurements

The indexer calculates and commits a signed observation hash to the ledger. Its inputs are available from the emitted settlement events and verified delivery evidence:

- **GAP (Gross Agent Product):** sum of eligible verified value added, excluding intermediate inputs to avoid counting the same payment twice.
- **ARPI (Agent Resource Price Index):** category-weighted current price relative to the controller-set baseline. This is the requested inflation measure.
- **Machine purchasing power:** standardized eligible tasks purchasable per USDC in the active price book.
- **Velocity:** settled categorized principal during a rolling window divided by configured active market liquidity. It is a risk signal, not a money-supply claim.
- **Utilization:** productive agents with fulfilled work divided by deployable active agents.
- **Agent productivity and surplus:** verified output value and revenue less categorized resource inputs, with explicit “estimated” labels where output valuation is not independently verified.
- **Reputation:** an explainable service score made from fulfillment rate, retry/failure rate, dispute outcomes, quote consistency, and verified-output attestations. It never substitutes for payment proof or guarantees quality.

The ledger includes `metricId`, window start/end, value, baseline, input event root, methodology version, and observation hash. This makes an observation reproducible from retained events without asking users to trust dashboard totals.

## Policy responses

The following is the enforceable mapping from the supplied paper. Policy action is always explicit; no metric automatically transfers money or creates a new mandate.

| Signal | On-chain threshold | Allowed response | Human action |
| --- | --- | --- | --- |
| ARPI rises | index exceeds category threshold | lower category cap, require batching, disable expensive route | approve price-cap change |
| Productivity falls | rolling verified-output ratio below threshold | lower agent budget, route to higher-reputation seller | approve budget/routing change |
| Velocity spikes | rolling category principal exceeds limit | throttle new orders or impose delay | approve/renew throttle |
| Utilization falls | idle-agent share exceeds threshold | pause idle mandate | approve pause or re-enable |
| Surplus negative | estimated cost exceeds verified revenue | stop reinvestment and pause agent | review exception or rebalance |
| GAP expands | verified value-added growth exceeds threshold | propose carefully increased task budget | Ledger/Speculos approval required |

`pause`, category cap, counterparty allowlist, velocity window, and per-agent budget are all contract state. `reroute` remains an off-chain planner choice constrained by the on-chain allowlist and cap. Every change emits a policy event that names the trigger observation hash, policy field, old value, new value, controller, and approval reference hash.

## Contracts and interfaces

All contracts target Arc testnet chain ID `5042002` and canonical Arc test-USDC `0x3600000000000000000000000000000000000000`. They use Solidity 0.8.x, OpenZeppelin role/access and safe-transfer primitives, custom errors, reentrancy protection, and immutable USDC/token configuration. Contract addresses are stored in deployment metadata and shown in the public app.

### `ObolosPolicyEnvelope`

Key state:

```text
controller: address
emergencyGuardian: address
marketEnabled: bool
agent[agentIdHash]: { owner, active, totalCap, spent, windowStart, windowSpent }
category[categoryId]: { enabled, perOrderCap, windowCap, windowSeconds, velocityDelaySeconds }
counterparty[categoryId][seller]: bool
policyVersion: uint64
```

Key calls:

```text
registerAgent(agentIdHash, owner, totalCap)
setCategoryPolicy(categoryId, categoryPolicy, triggerObservationHash, approvalHash)
setCounterparty(categoryId, seller, allowed, triggerObservationHash, approvalHash)
setAgentBudget(agentIdHash, cap, triggerObservationHash, approvalHash)
pauseAgent(agentIdHash, triggerObservationHash, approvalHash)
unpauseAgent(agentIdHash, triggerObservationHash, approvalHash)
authorizeOrder(orderHash, agentIdHash, categoryId, seller, amount, expiresAt)
consumeOrder(orderHash, amount)
emergencyPause(reasonHash)
```

`authorizeOrder` is a controller-signed EIP-712 intent submitted by the trusted settlement relayer after validating the owner’s existing spending mandate. The contract enforces expiry, replay protection, agent/counterparty/category state, total cap, per-order cap, rolling spend and throttling delay. `consumeOrder` can be called only by the settlement contract. The controller and guardian are separate roles; the guardian can only tighten/pause, never raise a cap or move funds.

### `ObolosMarketSettlement`

Key calls:

```text
settle(order, buyerAuthorization, sellerServiceHash, deliveryHash)
```

The contract validates the policy authorization and exact order terms, calls `consumeOrder`, pulls the exact USDC principal from the configured buyer payer using a pre-approved allowance, transfers the configured basis-point shares, records the immutable `orderHash`, and emits `OrderSettled`. Delivery is committed as a hash and does not expose report content. In phase 2 this flow is used only for new on-chain-market orders; the existing direct Circle transfer path remains visible as the phase-1 legacy route and is not relabeled as contract settlement.

### `ObolosEconomicLedger`

Only the settlement contract can append a settlement event. A designated metrics attester can append an observation hash for a closed time window, but cannot alter prior observations. The controller can rotate the attester through a policy event. The contract emits immutable raw inputs and observations; it does not run an oracle or trust an arbitrary frontend calculation.

### Public discovery and reputation

The existing Neon marketplace remains the mutable discovery layer for URLs, copy and service configuration. It will store the corresponding Arc settlement recipient, contract service hash, category, price unit, and status. The public API will expose the latest on-chain policy state, settlement history, metric observations, and score breakdown. A service is “open” only when its endpoint is publicly listed and its recipient/category is registered in the policy envelope. Anyone may browse; settlement must satisfy the buyer’s own policy envelope.

ERC-8004 registration/attestation is an optional adapter, not a fabricated claim. The initial release stores a compatible agent identity reference only after a real registry address and registration transaction are available on the chosen network. ERC-4337/7579/7715 integrations are likewise future account/delegation adapters; Phase 2 does not claim deployment of a smart-account implementation or wallet-permission standard it does not actually use.

## Trust and failure handling

- The controller is the user EOA. A Ledger/Speculos approval is evidenced by an approval hash and corresponding Obolos audit record; in development, Speculos is explicitly emulated and not hardware-backed.
- The policy contract, settlement contract, token address and recipient split are on-chain. The browser, broker, data source, delivery endpoint, metrics attester and reputation evaluation remain trusted/off-chain components with disclosed limits.
- A failed endpoint after payment follows the existing paid-delivery recovery process. Settlement is not automatically refunded. Phase 2 records verifier/review-pool proceeds but has no dispute-arbitration contract, and therefore makes no buyer-protection claim.
- The emergency guardian can only disable market/category/agent activity. It cannot redirect seller proceeds, unpause a seller, change splits, or expand permissions.
- Metric observations cannot be used to invoke policy changes without an explicit controller transaction. Values are diagnostic inputs, not an autonomous governance mechanism.
- The system rejects duplicate order hashes, stale authorizations, category mismatch, seller mismatch, wrong token, mismatched split, expired signature, and spend/velocity breaches.

## Testnet rollout and acceptance criteria

1. Compile and unit-test contracts for all authorization, replay, cap, split, pause, role, and rounding cases.
2. Deploy contracts to Arc testnet from the controller wallet, verify deployed bytecode/address, configure canonical test-USDC, and record the deployment transaction.
3. Register the existing external reference verifier as the first `verification` seller, approve one bounded buyer agent, and set the initial 95/3/2/0 split.
4. Execute one new bounded real USDC contract-settlement order. Independently verify each token-transfer log, policy event, settlement event, and the delivered receipt.
5. Record at least one ARPI observation and a demonstrated, controller-approved policy change such as a category cap reduction. The evidence must show the triggering observation and the on-chain policy event.
6. Add dashboard views for market metrics, category price history, policy state, seller score breakdown, fee allocation, and transaction links. Clearly label any metric estimates and the Speculos development mode.
7. Preserve Phase 1 evidence and direct transfers. Do not retry, overwrite, or reclassify historical orders.

## Required deployment inputs

Before real Arc testnet deployment, the controller must supply or use a browser wallet with enough Arc testnet gas and test USDC, and must approve USDC spending to the deployed settlement contract. No private key should be sent in chat or stored in the repository. Existing Circle agent-wallet funds may execute the legacy direct-transfer path, but a contract `transferFrom` requires a compatible payer/allowance mechanism; the rollout will use the browser EOA unless Circle’s documented API supports the required allowance flow.

## Standards and source alignment

The design uses the paper’s separation of settlement, policy, agent economy and measurement. ERC-4337 defines an account-abstraction execution layer, ERC-7579 a modular account model, ERC-7715 wallet permission requests, and ERC-8004 agent identity/reputation primitives; none alone implements economy-level price, productivity, or risk policy. Phase 2 therefore uses direct controller transactions and explicit policy contracts first, then adds these standards only where their concrete deployed infrastructure exists.

- Paper source: `/Users/saikarthik/Desktop/final_paper_clean_figures_visual.pdf`
- [ERC-4337](https://eips.ethereum.org/EIPS/eip-4337)
- [ERC-7579](https://eips.ethereum.org/EIPS/eip-7579)
- [ERC-7715](https://eips.ethereum.org/EIPS/eip-7715)
- [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004)
