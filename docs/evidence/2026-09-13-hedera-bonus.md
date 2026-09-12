# Hedera agent-commerce release — 13 September 2026

These are real Hedera testnet executions against the deployed Obolos service. Only Ledger hardware is emulated through the accepted Speculos setup. HBAR, HTS, Blocky402, HCS, GitHub data and native Scheduled Transactions used their actual network services. The two agent identities represent separately defined buyer/service roles operated by the same authorized testnet operator; this exercise does not claim independent operators or market demand.

## Live bonus evidence

| Hedera extra-credit direction | Implemented path and observed outcome |
| --- | --- |
| Metered data | Price scales by repository count. One A2A repository cost 100,000 tinybar; two repositories cost two OTEST credits. |
| Multi-agent negotiation via A2A | Public A2A 0.3.0 Agent Card and JSON-RPC `message/send` proposal/offer/acceptance bind payer, exact resource, quantity, price cap and expiry. The private buyer accepted and paid through native HBAR x402/Blocky402. An insufficient-budget proposal returned a counteroffer without a payment. |
| HCS-14 on-chain identity | Canonical HCS-14 UAIDs with verified profiles on restricted-submit HCS topics: service `0.0.10507462`, buyer `0.0.10507655`. Profiles use the explicit `obolos.hcs-profile` payload; no HCS-10/HCS-11 compatibility claim. |
| Discoverable agent directory | Existing service directory plus live `/.well-known/agent-card.json`, linking `POST /api/hedera/a2a` and exact paid resources. This demonstrates the directory alternative; it does not claim UCP. |
| HTS settlement | Native x402 payment of two units of token `0.0.10507691` through Blocky402 delivered two fresh public repository records. OTEST has zero decimals, fixed supply 1,000 and no custom fee arrays. It is a testnet service credit with no monetary value. |
| HCS payment audit | Service topic sequence 2 binds the completed A2A transaction, amount, parties, hashed request and actual purchased-evidence digest. |
| Recurring Scheduled Transactions | A finite, authorized two-round plan created two native schedule entities with `wait_for_expiry=true`, thirty seconds apart. Each transfer independently unlocked its exact repository delivery. This is a finite recurrence, not an indefinitely running subscription. |

## Exact public receipts

- A2A: [`0.0.7162784@1789239098.058069764`](https://hashscan.io/testnet/transaction/0.0.7162784%401789239098.058069764), consensus `1789239106.038151612`, 100,000 tinybar from `0.0.10413599` to `0.0.10425234`. Offer `7f5cf26ad911618a6f2625e8e4aaff4b033916e53760dc1a0493b130016a67f3`. Blocky402 fee payer is the transaction-ID account; it differs from the buyer account.
- HTS: [`0.0.7162784@1789239121.710567647`](https://hashscan.io/testnet/transaction/0.0.7162784%401789239121.710567647), consensus `1789239128.057486733`, exactly two `0.0.10507691` tokens from `0.0.10413599` to `0.0.10507498`. [Public service receipt](https://obolos.app/x402/hts/receipts/0.0.7162784%401789239121.710567647).
- Service profile: [topic `0.0.10507462`, sequence 1](https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.10507462/messages/1), transaction `0.0.10413599@1789238201.419043115`.
- Buyer profile: [topic `0.0.10507655`, sequence 1](https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.10507655/messages/1), transaction `0.0.10413599@1789238832.074833697`.
- Payment audit: [topic `0.0.10507462`, sequence 2](https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.10507462/messages/2), transaction `0.0.10413599@1789239159.991720565`, consensus `1789239167.580339930`.
- Scheduled round 0: [schedule `0.0.10507726`](https://hashscan.io/testnet/schedule/0.0.10507726), scheduled transfer `0.0.10413599@1789239069.774679638?scheduled`, consensus `1789239257.022674208`, 100,000 tinybar.
- Scheduled round 1: [schedule `0.0.10507733`](https://hashscan.io/testnet/schedule/0.0.10507733), scheduled transfer `0.0.10413599@1789239116.318844876?scheduled`, consensus `1789239287.020003535`, 100,000 tinybar.

The finite plan purchased `octocat/Hello-World` once per round, with a 1,000,000-tinybar principal cap and one-HBAR maximum native transaction fee. Both deliveries were fetched again as cached, paid results; no replacement payment was signed. The HTS purchase retrieved `octocat/Hello-World` and `hedera-dev/hedera-code-snippets`.

## Recovery and edge cases

Mirror indexing and immediate SDK receipt checks sometimes lagged consensus. Durable signed transaction identities were retained, and subsequent operator runs performed read-only recovery. An initial token creation with a ten-HBAR fee cap definitively failed `INSUFFICIENT_TX_FEE` with no entity. Only after verifying that exact failure did the explicit guarded retry create token `0.0.10507691` under a fifty-HBAR maximum fee. The failed and replacement journals remain distinct; there was no blind retry of uncertain funding.

Eight deployed HTTP checks passed: malformed A2A JSON, oversized body, insufficient-budget counteroffer, unpaid HTS gating, invalid repository rejection, retrieval of the original HTS receipt, cached replay of both scheduled deliveries, and rejection of rebinding a paid schedule to different resources. These checks initiated no payments.

Focused security regressions cover signed offer expiry/terms, payer and resource binding, facilitator receipt identity, ambiguous transport with no second settlement dispatch, HTS metadata and exact token debits, native schedule expiry/memo/fee constraints, HCS real mirror response formats, publication authenticity and private-field stripping. Nine isolated PostgreSQL tests apply all sixteen migrations and verify real uniqueness, concurrency, asset and state boundaries; they do not call a funded network.

## Reproduce and inspect

See [A2A setup](../hedera-a2a.md), [HTS buyer](../hedera-token-buyer.md), [HCS identity/audit](../hedera-identity-audit.md), and [proof publication](../hedera-evidence-publication.md). `scripts/hedera-commerce.ts` supports bounded provisioning, native schedule creation and delivery. Every uncertain operator run preserves its original private journal for reconciliation.

Public integration evidence is served by [`/api/hedera/evidence`](https://obolos.app/api/hedera/evidence) and the signed-in [Developers → Hedera integrations](https://obolos.app/app/developers#hedera) screen. Publication verifies the chain proof and the actual service delivery association, then writes only sanitized metadata. Raw credential bundles, offer tokens and signed transaction bytes never enter that response.

Arc still uses actual Circle Agent Stack wallets, canonical test USDC and the existing verified payment/delivery workflow. Ledger retains the real Key Ring integration and Speculos-emulated device. [Selected-track assessment](../reviews/2026-09-12-prize-fit.md). The Arc mainnet-by-September-30 payout condition is separate from this testnet release.

## Release verification

The full publication manifest was independently reverified and published at **2026-09-12 19:00:21.205 UTC** (September 13 in India). The public API exposes both profile anchors, A2A/HTS receipts, the HCS audit and both executed schedules. Actual signed-in browser checks at 1440×1000 and 390×900 rendered every proof with no horizontal overflow and no page errors.

- Application suite: **616 passed**; 73 database-dependent cases skipped in the default invocation.
- Separate isolated PostgreSQL verification: **16 passed**, including all nine new Hedera migration/uniqueness cases and the seven existing platform cases.
- TypeScript and production Next.js/Turbopack build passed. The deployed server includes exact facilitator transaction/payer binding; private publication runs from the reviewed operator script.
- Eight live HTTP edge checks passed without additional payment.
- Independent security/spec review approved the final service and publisher changes.

Deployment: `dpl_C6ruTnS3F3mqZ4drJPQXfsxfsCM4`, aliased to `https://obolos.app`. Public JSON and desktop/mobile capture artifacts were retained locally; private signed journals remain outside the repository.
