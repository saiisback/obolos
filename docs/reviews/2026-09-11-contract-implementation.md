# Obolos phase 2 contract implementation

## Implemented boundary

- Solidity 0.8.28, OpenZeppelin 5.4.0 SafeERC20, ReentrancyGuard, ECDSA and EIP712; optimizer 200, viaIR, Shanghai EVM.
- Canonical USDC is immutable at `0x3600000000000000000000000000000000000000`. Three direct `transferFrom` allocations execute atomically. Caller is the registered agent executor and is always the payer. No caller-supplied third-party payer exists.
- One-time controller+approver signed `bindExecutor` enrolls each executor to its human owner before any allowance. Registration, updates and consumption all require this binding; an executor cannot escape caps by registering a replacement self-owned ID. Agent owner alone registers/changes executor, total and window caps, activity and permitted counterparties. Controller cannot alter these grants. Caller consent is its settlement transaction. No controller approval per micropayment.
- Global category policy restricts categories 0=data, 1=compute, 2=inference, 3=verification, 4=storage. Caps, delay, market pause, category/agent window accounting and replay are checked before transfers; failed token transfer or ledger write reverts all accounting.
- Global policy changes require both controller transaction and configured approver signature. The signature is **EIP-191 personal-sign over the bytes32 EIP-712 approval digest**, not a signature on the digest's text representation. Domain is `ObolosPolicyEnvelope`, version `1`, current chain ID and policy address. Type: `PolicyApproval(bytes32 actionHash,bytes32 observationHash,uint256 nonce,uint256 deadline)`. Nonce and deadline prevent reuse. Emergency pauses advance the approval nonce so stale resume approvals cannot survive a newer emergency. The chain proves this signer approved the digest; it cannot prove the physical signing device.
- Owner changes advance only `agentVersions[id]`; platform changes advance `policyVersion`. Both versions are bound to the order. Open agent registration does not invalidate unrelated mandates.
- Initial split is 95/3/2/0. The configurable reserve+review share cannot exceed 1,000 bps. Rebate is disabled. Seller receives all integer rounding dust. Reserve and review recipient addresses are immutable.
- A seller publishes an immutable service hash containing chain, settlement, seller, category, unit, quantity, unit price and endpoint hash. Settlement checks all economic fields against the service. Changing terms creates a new service hash.
- Ledger separates `OrderPaid`, `DeliveryAttested` (seller-declared) and `BuyerAcknowledged`. These are counts, not usefulness/wash-trading guarantees. Unknown sellers have zero counts, with no fabricated reputation score. Delivery and acknowledgment cannot be duplicated or overwritten.
- Closed-window observations are append-only and submitted by the configured attester. Controller can rotate that attester with a direct controller transaction; this emits `AttesterChanged` and does not claim a separate Ledger signature.

## Deployment and API

Deploy policy `(controller, approver, guardian)`, ledger `(controller, attester)`, then market `(policy, ledger, reserve, reviewPool)`. The explicit controller calls each `wireSettlement(market)` once. Wiring is immutable afterward; settlement checks that both addresses point back to itself. Verify all linked addresses before approving any USDC allowance. No deployment occurred in this implementation step.

`settle(Order)` fields: `orderId, agentId, category, seller, serviceHash, unitHash, quantity, unitPrice, amount, inputHash, deadline, policyVersion, agentVersion, feeVersion`. IDs and hashes are bytes32; category uint8; versions uint64; other numerics uint256. Payer is `msg.sender`. Authoritative ABIs and bytecode are generated in `contracts/artifacts/`.

Controller action hashes use `keccak256(abi.encode(...))`:

- executor enrollment: `("EXECUTOR_OWNER", address executor, address owner)`.
- category: `("CATEGORY", uint8 category, Category value)` where Category is `(bool enabled,uint256 perOrderCap,uint256 windowCap,uint64 windowSeconds,uint64 delaySeconds)`.
- fees: `("FEES", uint16 reserve, uint16 review)`.
- resume: `("RESUME")`.

Call `approvalDigest(actionHash, observationHash, approvalNonce, deadline)` and personal-sign those raw 32 bytes. Submit the same arguments and signature from the controller.

## Validation

`node scripts/contracts/compile.mjs` regenerates deterministic ABI/bytecode artifacts. `node --test tests/economy-contract.test.mjs` compiles contracts and runs actual Anvil transactions through viem. The test installs a test ERC20 at the canonical address using Anvil-only code injection; this is explicitly a local fixture, not evidence about live Arc balances or deployment.

Covered: controller/attacker debit denial, controller cannot escalate an owner grant, counterparty ownership, locked wiring, invalid/replayed policy signatures, exact seller/category/unit/quantity/amount binding, deadline and policy/agent/fee versions, 95/3/2 allocation, zero custody balance, replay, unknown seller counters, delivery and acknowledgment roles/duplicates, atomic allowance-failure rollback, separate agent/category and total caps, owner pause and seller revocation, timing windows/delay, guardian pause-only, fee ceilings, tiny-amount rounding, observation authority/duplicates.

## Explicit limits

Spend windows are fixed-duration windows anchored at first spend, not sliding rolling sums. This can admit bursts across window boundaries; the configured inter-order delay applies to both agent and category. Owner/controller policy edits preserve already-accounted spending. Caps are principal per order, not independently normalized price indexes. Metadata endpoint hashes do not verify endpoint behavior. Seller/buyer attestations do not establish external utility, independence or fair dispute resolution. IDs should be collision-resistant; global order IDs are unique and must not be reused. No threshold oracle automatically changes policy. Guardian pauses the whole managed market, not individual categories/agents. No escrow/refund/arbitration is claimed. Live token/runtime compatibility requires the separately authorized bounded deployment verification.

## Review corrections

Executable regression coverage added for self-owned alternate-agent escape, unauthorized enrollment/front-running, immutable owner binding, and old resume approval invalidation after a newer guardian pause. Controller+approver gated buyer enrollment is specific to the managed settlement route; public seller service publication remains permissionless.

## Durable deployment/execution helper

Added `scripts/economy-circle.ts` after inspecting installed Circle CLI `contract deploy`, `wallet execute`, and `transaction list` help and source. No live transactions or signing performed. Stable random idempotency UUID and exact intent persist with file/directory fsync before dispatch; exclusive lock blocks concurrent dispatch, uncertain responses require reconciliation, and changing an operation's arguments is rejected. Sanitized results retain IDs/hashes without credentials. Deployment checks chain 5042002, successful receipts, runtime excluding known compiler immutable references, all authorities/recipients and both wiring links before returning metadata. Generic approve/settle exports require caller-level expected-log verification. Speculos/USB helper personal-signs raw digest bytes and recovers the pinned approver.

Validation: `npx vitest run tests/economy-contract-circle.test.ts` passes 3 tests (durable pre-dispatch save and uncertain-stop, immutable intent and retained result, bytecode immutable masking); `npx tsc --noEmit --pretty false` passes. Latest Anvil contract suite passes with both security review regressions. Runtime artifact compilation regenerated after policy changes. Missing Circle correlation IDs deliberately stop for manual reconciliation. The live API's tuple parameter encoding still needs read-only fee estimation before the first on-chain settle.
