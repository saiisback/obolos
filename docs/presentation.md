# AgentGDP presentation outline

Use this outline with the actual live artifacts after setup. Statements describing paid transactions or hardware demonstrations are demonstration targets until matching evidence is attached. The [submission matrix](submission.md) is the source of completion status.

## Slide 1 — Delegation with limits

- Agents purchase repository evidence and commission source/structure verification.
- Humans define allowed providers, price ceilings, separate budgets and expiry.
- Show the real Foundation-referenced workspace and its original flat illustration.
- A repository comparison makes each input, decision and payment inspectable.

## Slide 2 — Two payment networks, one mandate

- Discover current quotes → check policy → purchase evidence through native Hedera x402.
- Produce a source-backed report → pay canonical USDC on Arc through Circle Agent Wallet → run verification checks.
- Quote increases cause rerouting or an approval pause before the next purchase.
- HBAR and USDC balances, allowances and receipts stay separate. There is no bridge or atomic cross-chain transaction.

## Slide 3 — Three integrations with distinct roles

| Integration | Implemented role | Evidence to show |
|---|---|---|
| Ledger Agent Stack | Sync-based Ring enrollment protects stored inference/HBAR secrets; Ethereum-app controller signs mandate escalation | Device provisioning footage, exact approval JSON, saved live authorization and tooling feedback |
| Hedera / Blocky402 | Public metered repository service and native HBAR x402 consuming client, with matching settlement checks | Public service URL, paid request and HashScan receipt |
| Arc / Circle Agent Stack | Email-OTP agent-wallet CLI session pays verification in canonical Arc testnet USDC | Circle agent wallet identity and matching ArcScan transfer |

Circle's MPC/session infrastructure is separate from Ledger. No Circle API-key integration, Ledger-signed Circle transfer or unimplemented optional protocol should appear on this slide.

## Slide 4 — A usable operator setup surface

- Connections displays operator-only public addresses, recipients, exact balance strings, source/check time and explorer links.
- Ready/missing/action-required checks distinguish configuration, funding, recorded payments and unfinished external demonstrations.
- Recorded evidence comes from this browser's live runs. Simulated receipts and approvals are excluded.
- Wallet management and `npm run preflight` are read-only. Login, funding, Ring enrollment and hardware signing remain explicit operator actions.

## Slide 5 — What is actually verified

- Show actual transaction IDs and inspect network, asset, amount and payee in the explorers.
- Show the saved message, nonce, signer/signature, timestamp and before/after mandate from `run.authorizations`.
- Report checks cover source integrity, freshness, repository coverage and structure; they do not certify arbitrary model prose or represent an independent audit.
- A transaction proves payment. A signature proves the address signed; physical device provenance needs footage and a device-confirmed controller.

## Slide 6 — Trust boundaries and submission status

- Include the README architecture diagram: chains settle payments; the model, deterministic orchestration/verifier, broker, facilitator, Circle infrastructure and local journal are off-chain.
- Ring protects secrets at rest. Runtime plaintext exists inside the trusted broker; OS isolation and durable journals remain deployment responsibilities.
- The local hash chain is not publicly anchored or tamper-proof against a compromised host. Gas fees are outside principal allowances.
- Clearly list any missing public service/repository, real paid receipts, physical demo, developer feedback and video artifacts.
- Disclose AI assistance and the September 3 PDF. New-project eligibility is an organizer decision, not an implementation claim.
