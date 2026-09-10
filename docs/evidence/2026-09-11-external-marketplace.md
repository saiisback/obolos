# External HTTPS provider: paid testnet release

Executed September 11, 2026, Asia/Kolkata (September 10 UTC) on the production deployment of commit `8fa06fe4c702425754884878448a738c07d170e1`.

A separately authenticated buyer selected the **Obolos reference API verifier**, signed a v3 mandate binding its HTTPS endpoint and 0.05 test-USDC price, and queued one repository research job. The local runner bought fresh evidence through Hedera x402/Blocky402, generated the report through the scoped inference broker, and paid the selected seller through Circle on Arc testnet.

The marketplace verified the Arc transfer, persisted payment, then made a real HTTPS request to the provider endpoint. The provider looked up the paid receipt at its pinned marketplace origin, checked its own service ID and recipient, and returned checks. The job finished **succeeded / chain-confirmed**, with all eight checks passing (four local structural checks and four provider checks).

| Record | Value |
| --- | --- |
| Job | `94f09b64-5c1f-4bde-bc80-fb836f096b56` |
| Buyer agent | `bbe7a55b-8cda-4352-9091-a41b0db0f094` |
| Service / revision | `13936142-3321-4de8-8e09-e57dcf7d1a82` / 1 |
| Endpoint | `https://obolos.app/api/examples/verifier` |
| Seller recipient | `0xd2137e6d65165400641aff0e34781d09a0215858` |
| Purchased input | 1 repository record: `octocat/Hello-World` |
| Hedera payment | 0.001 test HBAR |
| Arc payment | 0.05 test USDC |
| Order | `ce7e75f7-d55f-4a20-b613-3705de59049d` / fulfilled |

- [Hedera transaction](https://hashscan.io/testnet/transaction/0.0.7162784%401789066449.450617271)
- [Arc transfer](https://testnet.arcscan.app/tx/0x06ecfa2ae9cf7280bd9da0e21d27507e850b38c09890d355d88b6ba3e40bc777)
- [Live paid-order receipt](https://obolos.app/api/market/orders/ce7e75f7-d55f-4a20-b613-3705de59049d/receipt)
- [Recorded results and checks](2026-09-11-external-marketplace.json)

## What this proves

This run used real testnet transfers and the external-provider HTTPS transport without mocked responses. The reference provider is operated by Obolos under the same domain. It demonstrates the provider contract and dispatch path; it does not demonstrate third-party adoption or independent hosting. Other sellers can register their already-deployed endpoints implementing the same contract.

Chain confirmation proves payment settlement, not report quality. Metric checks cover the purchased evidence; free-text recommendations are not certified. Ledger credential retrieval used Speculos, which is emulated and not hardware-backed. The private runner and broker remain trusted execution dependencies.

No older order was retried or repaid. A fresh agent, one-run mandate and durable execution intent capped this test at 0.001 HBAR and 0.05 USDC. Automated PostgreSQL tests separately cover provider failure, concurrent delivery retries and recovery without a second payment; this successful live run did not manufacture a delivery failure.
