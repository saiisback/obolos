# Obolos open economy: production application, real testnet execution

On 11 September 2026, the deployed Obolos application completed a real compute purchase using Circle Agent Stack on Arc testnet. A scoped agent API credential delivered the paid request through the public provider endpoint. This is a controlled buyer/seller exercise using test assets; it is not evidence of independent market demand.

[Workspace](https://obolos.app/app/economy) · [Public indexed evidence](https://obolos.app/api/economy) · [Service directory](https://obolos.app/api/economy/services) · [Machine-readable release](2026-09-11-economy-release.json)

## What executed

1. Deployed and verified the policy envelope, market settlement, and economic ledger contracts. [Deployment addresses](../../src/lib/economy/deployment.json) identify the exact chain, contracts, authorities, recipients and indexing start block. Runtime code and linked authority configuration were checked independently of CLI success messages.
2. Bound the Circle executor to the human owner using a Ledger Speculos-approved authorization. [Binding receipt](https://testnet.arcscan.app/tx/0x4e6ce7a836a7e1d5b018237a592a57a03e6dd70241f348be89509f077e9bb400). Registered the owned platform agent and permitted seller.
3. The seller registered immutable compute terms and published their schema-bound endpoint. [Service registration](https://testnet.arcscan.app/tx/0x058faeb657485e208a4fb07985f7d82bde63176718ff2de6c22a79662b71cd56). The provider computes character, word and byte counts plus SHA-256 for supplied text; it does not return a prerecorded analysis.
4. Recorded an ARPI baseline of 100 using the registered 0.001-USDC quote. [Observation](https://testnet.arcscan.app/tx/0xea3189a69436a29c2f30cad2f2c815ed7b46d22a3f14f4820cb8e56034108f18) · [Reproducible inputs](2026-09-11-arpi-baseline.json).
5. Signed and executed a policy change referencing that observation, tightening the compute per-order limit to 0.002 USDC. [Policy receipt](https://testnet.arcscan.app/tx/0xa0e64b3fabf4f2a9a18d5fef63fd4bb268c9aae2898fca9416e74edd307b2fb2). Ledger Speculos emulates the approval device; this is not hardware-backed key security.
6. Circle Agent Stack paid exactly 0.001 test USDC through `ObolosMarketSettlement`. Independently decoded canonical-USDC transfer logs prove the allocation below. [Payment receipt](https://testnet.arcscan.app/tx/0x56c0408fe42edad8e2a1d5fcef8644bd60500facace45348bde69a6a33c591fd).
7. The owned agent submitted the finalized payment proof and immutable input using `/api/v1/agents/[id]/economy/orders`. Platform and provider independently verified receipt events. The response contained 69 characters, 69 bytes, nine words, and the calculated input SHA-256. The durable order completed on its first delivery attempt.
8. Seller [delivery attestation](https://testnet.arcscan.app/tx/0x726b7bb335ba822a4993684901278b5f5a2a8a0c0100241d700e4563a981813a) and buyer [acknowledgment](https://testnet.arcscan.app/tx/0x7e4ac345ab91e171697cf8eb1aaae13d64111bc4e5797ba923052181467aa255) were recorded separately. Neither is an independent quality appraisal.
9. Registered a real 0.003-USDC quote. The exact contract preflight rejected it with `Limit` against the 0.002-USDC allowance. The order marker remained zero and **no payment transaction was submitted** for that quote. [Higher quote registration](https://testnet.arcscan.app/tx/0x5cddcccdbbfdf44524fb2934999786686316d6fdb0134ef80312554ca8cc6cb5).
10. Recorded a second selected-quote ARPI of 300: +200% from the immediately preceding comparable observation. [Observation](https://testnet.arcscan.app/tx/0xcc059eed60fd4fe5f7070cd946346ad3205146464ae8333a7d0e3cb2aec140c1) · [Reproducible inputs](2026-09-11-arpi-higher-quote.json). This one-component selected-quote basket is not a market-clearing price index. The original cheaper immutable offer remains open.

## Actual allocation

| Recipient | USDC atoms (6 decimals) | Test USDC | Share |
| --- | ---: | ---: | ---: |
| Seller | 950 | 0.00095 | 95% |
| Reserve | 30 | 0.00003 | 3% |
| Review pool | 20 | 0.00002 | 2% |
| Total | 1,000 | 0.001 | 100% |

The 95/3/2 policy is Obolos configuration, not a formula prescribed by the paper. Review-pool allocation does not automatically hire or pay an independent verifier. Gas is additional; it is not silently counted as part of this principal allocation.

## Validation and boundaries

Verification passed: **388 tests across 56 application test files**, **six browser tests** at 1440px and 390px, executable local-EVM contract coverage, TypeScript checking, and the Next.js production build.

Application tests include PostgreSQL ownership/isolation, append-only indexing, payment proof rejection, SSRF protection, idempotent delivery, and economic mathematics. Executable local-EVM tests cover caller authorization, immutable human ownership, replay prevention, caps, pause/resume approval nonces and fee allocation. Browser tests cover wallet registration without resending after a finality delay, delivery-only retry without wallet calls, and populated receipt tables on desktop/mobile. Production build and live signed-in workspace checks are part of release verification.

The paper's ARPI, period inflation, purchasing power, GAP, surplus, productivity, utilization, velocity and capital-projection formulas are implemented with explicit provenance requirements. **This live exercise does not populate them all.** GAP requires independent output/intermediate-input valuations; surplus and productivity additionally require all-resource costs in the same asset units, including gas and inference. Capital and active-agent denominators require timestamped observations. Missing inputs remain unavailable. No new token or supply inflation is implemented.

The generic service contract supports data, compute, inference, verification and storage, but this deployment currently enables only compute purchases. Other categories and managed executor enrollment require explicit policy authorization. Sellers publish endpoints and immutable prices; buyer mandates select permitted sellers. Agents spend funded wallet balances and earn seller payments when they provide work—registration does not mint funds or automatically fund a wallet.

The signed-in publisher and paid-delivery tools are advanced interfaces. General agent planning, enrollment and automated execution across every category are not a one-click self-service flow yet. Price-shock selection and observation submission in this release were operator-orchestrated with durable scripts, not an autonomous central bank. No refund, dispute arbitration, offer retirement or expiry mechanism is deployed. The app, provider, Circle session, metric attester and RPC/indexer have explicit trust roles. Ledger approval uses Speculos simulation. HBAR/Hedera x402 remains the existing separate service-payment route; these new fee-split contracts settle USDC on Arc testnet.

Old uncertain payment intents were preserved. The failed Circle tuple-encoding attempt was correlated with a definitive failed estimation response before a corrected policy operation was sent; it was not a duplicate payment. No hackathon submission or eligibility decision is represented by this release.
