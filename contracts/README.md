# Obolos managed USDC settlement

Compile: `node scripts/contracts/compile.mjs`.

Execute local Anvil behavior tests: `node --test tests/economy-contract.test.mjs`.

Generated authoritative ABIs and bytecode: `contracts/artifacts/*.json`. Tests use a local fixture token at the canonical address; they are not a live Arc deployment.

## Deployment

1. Deploy `ObolosPolicyEnvelope(controller, approver, guardian)`.
2. Deploy `ObolosEconomicLedger(controller, attester)`.
3. Deploy `ObolosMarketSettlement(policy, ledger, reserve, reviewPool)`.
4. From the explicit controller, call `policy.wireSettlement(market)` and `ledger.wireSettlement(market)`. Each can succeed only once. Read all linked addresses back and check bytecode before approving USDC.
5. Controller submits human approver-signed `bindExecutor(executor, humanOwner, observation, deadline, signature)` once, then verifies `executorOwners(executor)`. Bindings cannot be changed. All managed buyer executors require this enrollment. Human owner calls `registerAgent(agentId, executor, totalCap, windowCap, windowSeconds)` and `setCounterparty(agentId, category, seller, true)`. **Managed deployment must use the human owner as owner and the autonomous Circle wallet only as executor.** An enrolled executor cannot register a self-owned replacement ID or switch a mandate to a differently owned executor. Public seller registration remains permissionless.
6. Seller calls `registerService(category, unitHash, quantity, unitPrice, endpointHash)`. Retain the emitted service hash. Controller configures the category using signed approval below.
7. Executor approves only the bounded canonical-USDC allowance to market and calls `settle(Order)`. No human signing is needed per order within the owner-granted envelope.

The controller transaction actor can be Circle; the separate approver must be the authorized human signing identity. Controller cannot modify agent-owner envelopes. Guardian can pause the whole market and cannot resume, change fees, or grant permissions. Token and reserve/review recipients are immutable. Initial fees are reserve 300 and review 200 basis points; seller gets the remainder and all rounding dust. Rebate is zero.

## Signed policy updates

Domain: `{ name: 'ObolosPolicyEnvelope', version: '1', chainId, verifyingContract: policy }`.

EIP-712 type: `PolicyApproval(bytes32 actionHash,bytes32 observationHash,uint256 nonce,uint256 deadline)`.

Obtain `approvalDigest(actionHash, observationHash, approvalNonce(), deadline)`. **Personal-sign the raw 32 digest bytes (EIP-191), not their hexadecimal text.** Submit the signature with the matching fields from controller. Nonce is consumed once; every emergency pause also advances the nonce, invalidating older pending approvals. The deadline is an absolute Unix timestamp. The contract proves identity and payload approval, not Ledger hardware provenance.

Action hashes use `keccak256(abi.encode(...))`:

- `bindExecutor`: `("EXECUTOR_OWNER", address executor, address owner)`; ownership binds once and cannot be changed.
- `setCategory`: `("CATEGORY", uint8 category, Category value)`; Category is `(bool enabled,uint256 perOrderCap,uint256 windowCap,uint64 windowSeconds,uint64 delaySeconds)`.
- `setFees`: `("FEES", uint16 reserveBps, uint16 reviewBps)`; combined maximum 1,000 bps.
- `resume`: `("RESUME")`.

Categories are 0=data, 1=compute, 2=inference, 3=verification, 4=storage. Policy updates preserve already-spent accounting. `policyVersion` changes for global actions; `agentVersions(agentId)` changes for that owner's grant. Read both plus `feeVersion` when preparing orders.

## Orders and events

`Order` ABI fields in order: `orderId,agentId,category,seller,serviceHash,unitHash,quantity,unitPrice,amount,inputHash,deadline,policyVersion,agentVersion,feeVersion`. Hashes/IDs are bytes32, category uint8, versions uint64, remaining integers uint256. Payer is always transaction caller and must equal registered executor. Amount must equal quantity × unitPrice and exactly match the registered service terms.

`OrderSettled` emits exact transfers; `OrderPaid` supplies category/unit/price/quantity/input data. A payment is not delivery. Seller calls ledger `attestDelivery(orderId,outputHash)`; payer can then call `acknowledgeDelivery(orderId,outputHash)`. Public `reputation(seller)` returns `(paid,delivered,acknowledged)`, with zero counts for unknown sellers. These counts do not independently prove useful output. Attester `recordObservation` commits a closed-window value and input/methodology hashes; no metric invokes policy automatically.

## Limits

Windows are fixed-duration, anchored at first spend, **not sliding windows**. Category and agent delay checks constrain bursts, but window-boundary bursts remain possible. Global order IDs must be collision-resistant and never reused. Endpoint hashes bind terms but do not verify delivery quality. Buyer and seller can collude; neither acknowledgment nor payment proves independent utility. There is no refund/arbitration/escrow. The ledger's controller-only `setAttester` emits a rotation event but does not require the separate policy approver signature.

## Durable Circle helper

`scripts/economy-circle.ts` imports without side effects. It provides `deployManagedMarket`, `executeCircle`, `approveCircleUsdc`, `settleCircleOrder`, `reconcile`, and `signPolicyDigest`. Configuration reads `CIRCLE_WALLET_ADDRESS`, `CIRCLE_CLI_HOME`, pinned `LEDGER_CONTROLLER_ADDRESS`, and optional canonical `ARC_RPC_URL` from the process environment; launch with the existing `.env.broker` using tsx. It never loads or prints CLI credentials.

Inspect usage without transactions:

```sh
npx tsx scripts/economy-circle.ts --help
```

After deployment review, the explicit live testnet command is:

```sh
npx tsx --env-file=.env.broker scripts/economy-circle.ts deploy RESERVE_ADDRESS REVIEW_POOL_ADDRESS output/economy-deployment.json --execute-testnet
```

The script refuses existing output files. It emits deployment metadata only after successful chain receipts, runtime-code comparison with compiler immutable slots masked, authority/recipient checks, and confirmed one-time wiring. Root integration can then adopt that reviewed JSON. It does not enroll an executor, modify policy, or approve token spending as part of deployment.

Each operation has a permanent name and a random UUID persisted and fsynced **before** CLI dispatch. Arguments and sanitized transaction results are retained under `data/economy-operations` (override `ECONOMY_OPERATION_DIR`). Reusing a name with altered arguments is rejected. Reusing a submitted operation returns its previous result. A timeout/ambiguous outcome prevents further submission, including automatic retries with the same key. A per-operation lock prevents concurrent dispatch; a stale lock requires checking the original process before manual removal.

```sh
npx tsx --env-file=.env.broker scripts/economy-circle.ts reconcile deploy-policy
```

Reconciliation searches Circle history for the retained transaction ID/hash or idempotency key, then checks the Arc receipt. If Circle timed out before returning any correlation identifier and history does not expose the key, the script stops for manual Circle correlation; it never guesses from amounts or creates another payment. Preserve the journal even after failures. Successful generic execution receipts alone do not prove application outcome: the caller must validate expected token, policy or settlement logs, as deployment verifies its resulting state.

`signPolicyDigest` uses the existing USB/Speculos transport, checks the displayed account against the pinned approver, personal-signs the raw digest bytes and verifies the returned signature. It reports `signerMode` so emulator evidence cannot be presented as hardware signing. Review the structured action and policy digest before invoking it. Tuple arguments are encoded locally with viem into canonical calldata. The tracked `scripts/circle-calldata-adapter.ts` checks the installed CLI version and complete source hash, then generates an ignored sibling bundle changing only the two agent execution request-construction sites to use upstream-supported `callData`. Authentication, challenge handling and idempotency remain upstream code. The corrected category action passed a read-only Circle fee estimate; CLI ABI-string tuple encoding had failed with `ESTIMATION_ERROR`. Original journal intent remains unchanged when transport encoding changes, and terminal failures cannot be resubmitted by reusing their name. A recovery operation requires explicit review and a link to the original retained evidence. No live CLI transaction, enrollment or signing was performed while developing this helper.
