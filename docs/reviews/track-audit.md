# Obolos: independent three-track integration audit

Checked 7 September 2026 against implementation and fresh primary sources. This is an implementation/qualification audit, not proof of funded payment, physical hardware use, or organizer acceptance. Scope excludes the parent's in-progress readiness, wallet-list and UI additions until separately verified.

## Final re-review status — 7 September 2026, 23:44 IST

**All three original P2 findings are resolved.**

- The engine retains exact authorization message/signature/signer, nonce, verification timestamp, and cloned previous/approved mandates before consuming the pending request. These records appear in the report history and full run export. Independent signature verification against the saved proof passes. This remains account authorization evidence, with hardware provenance requiring a physical demonstration.
- The dashboard now downloads `application/json` with a `.json` filename through `approvalFile`. Its regression passes that exact output directly into `approvalMessage(JSON.parse(file))`, including escaping and a non-ASCII character, without changing the signed message.
- The report now says “Source checks passed” and explicitly describes structural/source-integrity checks while disclaiming independent narrative certification. The underlying verifier remains deterministic and broker-local; an independent factual-verification agent has not been added or claimed by this fix.

Re-reviewed live controls: real price changes are operator-gated, shown only when provider controls are configured, explicitly disclose their effect on all jobs, and rediscover actual service quotes. Synthetic multipliers remain rehearsal-only. Live run creation checks server-side operator authentication, pinned controller/service configuration and broker health. Wallet snapshots require broker authentication; the app withholds wallet/controller/service addresses from non-operators and preserves unknown balances and exact integer precision.

The preflight source inspects configuration values and cross-service pins without executing configured tools, unlocking an encrypted bundle, or calling the network. Its output is limited to check names/statuses and explicitly says configuration does not establish sessions, funding, hardware approval or settlement. The test's executable-marker check verifies that candidate CLI binaries are never launched. No additional concrete P1/P2 was found in these reviewed changes.

Fresh focused validation: **24 tests across 6 files passed** (`approval-export`, `approval`, `live-readiness`, `preflight`, `wallets`, `engine`). The earlier full suite in this independent review passed 75 tests; the parent's newer whole-suite/build/browser results are recorded separately. Package/lock changes adding Ledger CLI 2.1.0 were in progress and are outside this source re-review. No funded or hardware operations occurred; runtime files were not modified by this reviewer.

## Concrete findings reported to the parent

### Resolved P2 — Completed runs discarded the controller authorization evidence

At review time, `src/lib/engine.ts:103–104` replaced the mandate and cleared `run.approval`, while retaining only nonce/version prose in the audit event. `src/lib/contracts.ts:34–39` had no approval-proof history. The submitted signature, exact message and signer disappeared. Exporting a completed job therefore cannot let a reviewer independently verify who authorized its larger limits, even though the server verified them at execution time. A locally recomputable hash chain cannot substitute for that signature.

Fix: persist the exact message, signature, pinned controller address, nonce, previous/new mandate versions, and verification timestamp as an immutable approval record before consuming the pending request; include it in the evidence export. Add a test that verifies a stored completed-run proof and rejects altered message/signature bytes. Signature validity establishes control of the pinned account; physical Ledger provenance still needs the device demonstration. Parent was notified before this report; implementation may now be changing.

### Resolved P2 — The downloaded approval did not match the signing script's input format

At review time, `src/components/dashboard.tsx:253` downloaded `approval-<id>.txt` containing the raw message, but `scripts/ledger-approve.ts:18` always parsed the file as JSON and required `{message: string}`. Taking the UI download directly to the instructed local script fails before any device operation. This is reproducible without credentials or hardware by applying `approvalMessage(JSON.parse(downloadedText))` to that output. Parent already owns this fix: export JSON containing the exact message and make the file extension/instructions agree; retain byte-for-byte content.

### Resolved P2 — “Factual consistency” in the report UI exceeded the implemented verification

`src/components/dashboard.tsx:264` labels the checks factual consistency against evidence. In `services/broker.ts:91–96`, the paid verifier checks evidence digest equality, canonical source URLs, fetch age, and occurrence of repository names in the summary. `checkReport` additionally checks structure/counts/timestamps. A worker summary claiming that `owner/repo` has an incorrect star count still passes if it names every repository and attaches unchanged evidence. Payment occurs before these checks; it does not make the prose true.

Fix within current scope: call these structural/source-integrity checks and make the narrative limitation visible in the report view. If the requested outcome is an actual verification agent, implement and demonstrate a separately scoped verifier that compares extracted factual claims against source fields and records its findings. Merely renaming this function or adding an agent/wallet card does not implement independent verification.

## Track fit and missing qualification evidence

| Track | Actual implemented integration | Remaining evidence / limitation |
|---|---|---|
| Ledger AI Agents x Ledger | Broker invokes `wallet-cli ring decrypt`; decrypted inference/Hedera secrets stay in its runtime; a separate HID script requests personal-message signing and server verifies the pinned address. | Real protected ring provisioning, actual encrypted-bundle use, physical controller-signing demonstration, private broker deployment, and tooling feedback still need evidence. Initial limits are operator-authorized; escalations use the signature path. |
| Hedera AI & Agentic Payments | Public Express service emits v2 exact challenges, meters one to three repositories, verifies via Blocky402, fetches GitHub data, settles, and returns evidence. Broker uses native Hedera SDK signing and validates exact mirror-node transfers tied to the signed transaction. | Public HTTPS service and repository, one real paid request through the consuming workflow, matching transaction proof, and video remain required. An unpaid 402 or `/supported` response is not a settlement. |
| Arc Best Agentic Economy Application with Circle Agent Stack | Circle Agent Wallet CLI transfers fixed-fee USDC on Arc testnet to a configured payee; adapter validates chain, sender, payee, amount and canonical token event. | Need a funded agent wallet and real onchain payment within a demonstrated job, plus working deployment, architecture, presentation/video and public source. Verifier currently lives in the same trusted broker; the payee is configured, not a demonstrated autonomous counterparty. |

These mappings are an audit judgment. The official tracks require central Ledger Agent Stack/Key Ring use, a live Blocky402 service and paid consumer request, and useful autonomous USDC flows on Arc with a functional documented MVP. Optional systems such as HCS identity, A2A, Nanopayments and Paymaster are not universal requirements. [Official prize requirements](https://ethglobal.com/events/ethonline2026/prizes)

Ledger separately requires tooling/DX feedback. Existing code-integration notes can be submitted honestly; actual hardware experience must not be invented. The pre-event paper's effect on the “new project” category remains an organizer decision. [Ledger event requirements](https://developers.ledger.com/ethonline)

## Ledger command and trust-boundary verification

Current official documentation confirms `ring init` provisions via the device, then `ring encrypt -i <input> -o <ciphertext> --key <name>` and `ring decrypt -i <ciphertext> --key <name>` support the implemented flow. Omitting decrypt's output file writes plaintext to stdout, as expected by the broker. Later encryption/decryption needs network access but no physical device. The password must be human-provisioned and injected privately. [Ledger Wallet CLI](https://developers.ledger.com/docs/ai-tools/ledger-cli)

Source inspection additionally confirms that the key name selects a derived scoped key; no separate undocumented “create key” command is missing from setup. The shared implementation tracks a newly used name and writes raw result bytes to stdout, while prompt/activity messages use stderr. The current init source requests the Ledger Sync app for provisioning; the Ethereum app is used separately by this project's approval script. [Ring crypto pipeline](https://github.com/LedgerHQ/ledger-live/blob/develop/apps/wallet-cli/src/commands/ring/shared.ts), [key derivation](https://github.com/LedgerHQ/ledger-live/blob/develop/apps/wallet-cli/src/key-ring/crypto.ts), [ring init](https://github.com/LedgerHQ/ledger-live/blob/develop/apps/wallet-cli/src/commands/ring/init.ts)

The Ledger component does not hardware-sign the native Hedera or Circle transfer. Key Ring protects the stored broker bundle; the Hedera key becomes plaintext inside the trusted broker. Circle uses its own agent-wallet signing infrastructure. The actual protection is scoped model capabilities plus OS isolation and external policy checks. Same-account processes with filesystem/shell access can compromise the broker. This is not a fully decentralized system or a cryptographic guarantee against a compromised broker.

## Circle API/CLI compatibility and policy limits

Fresh official chain documentation lists `ARC-TESTNET` as supported for Agent Wallets. The implemented source-wallet lookup filters agent wallets and Arc; installed `@circle-fin/cli@1.0.0` source shows wallet resolution prefers a matching agent wallet over a local-wallet collision. Its transfer command accepts the stable idempotency flag, and formatted output includes the echoed key, blockchain, transaction hash, source and destination consumed by the adapter. [Agent Wallet supported chains](https://developers.circle.com/agent-stack/agent-wallets/supported-blockchains)

Current command documentation supports the project's explicit source/address/chain/token transfer syntax. It also states custom spending-policy commands (`wallet limit`, set/reset/budget) are mainnet-only. Therefore the Arc testnet mandate and caps are enforced by Obolos's app/broker, not by a demonstrated Circle testnet custom policy. Do not promise that the user can configure those native Circle policies on Arc testnet. OTP login and faucet funding remain operator actions. [Circle CLI command reference](https://developers.circle.com/agent-stack/circle-cli/command-reference)

This integration performs a direct transfer, not a Circle Marketplace discovery/Nanopayment flow. The deterministic job controller initiates the payment after its policy checks; the report LLM has no direct wallet tool. This is an agent orchestration architecture, not several independently autonomous onchain agents.

## Native Hedera/Blocky compatibility

A fresh read-only GET to the hosted testnet facilitator succeeded during this audit. It advertised `x402Version: 2`, `scheme: exact`, `network: hedera:testnet`, and `extra.feePayer: 0.0.7162784`, also listed in `signers["hedera:*"]`. This matches the current adapter's metadata path. Do not hard-code that observed fee payer; the implementation correctly discovers it from the fixed HTTPS facilitator. [Live facilitator metadata](https://api.testnet.blocky402.com/supported)

Official network documentation confirms native HBAR asset ID `0.0.0`; amounts are tinybar at 100,000,000 per HBAR. This is the native Hedera scheme, distinct from an EVM-chain USDC transfer. Metered challenges, facilitator verification/settlement, exact recipient/amount checks and mirror proof are actual code paths, but require the funded end-to-end request to establish live operation. [Blocky402 networks](https://blocky402.com/docs/networks/), [x402 network and asset support](https://docs.x402.org/core-concepts/network-and-token-support)

## What this audit did not do

Read code, current official documentation, public Ledger source and installed Circle source maps; queried only public Blocky metadata. Did not read private key files, retrieve OS keychain items, log in, consume OTPs, provision a ring, fund an account, sign with hardware, or submit a payment. The original runtime findings have now been re-reviewed as resolved above. Package installation and live external gates remain separate checks.
