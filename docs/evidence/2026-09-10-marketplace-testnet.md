# Hosted seller marketplace: paid testnet release

Tested September 10, 2026 against `https://obolos.app` at application commit `00fc166c5ada131748ebac3de7fa62bed832e367`.

## Successful paid job

- Agent: `73083358-9968-4e5b-a935-6e0485b48f13`
- Job: `5dd85c8c-1fc6-4d71-8117-134a0f6e98aa`
- Service: Obolos Metric Check, revision 1 (`fbf7c34a-5f95-4882-9a1a-b81326f311e3`)
- Order: `5ac9b13e-cea9-4424-8c84-e5cc79a32c12`
- Buyer owner wallet: `0x1F21897512e5AD2d9Aa087a0C8E818A3E2dD22FD`
- Seller recipient: `0xd2137E6D65165400641aff0e34781D09a0215858`
- Circle payer: `0x90602880dbee4158d96fddbdffe300c03d68e46c`

The buyer and seller authenticated separately by signing wallet challenges. The seller published its own payout listing. The buyer signed a v2 mandate for one repository, one run, a maximum 0.001 HBAR data purchase and 0.05 test USDC verification. A scoped API key queued the job; a separately paired private runner executed it through the funded broker.

| Operation | Result | Independent evidence |
|---|---|---|
| Repository evidence | One current `octocat/Hello-World` record, 0.001 HBAR through x402/Blocky402 | [Hedera transaction](https://hashscan.io/testnet/transaction/0.0.7162784%401789017858.924455961) |
| Worker | Actual inference request, structured model claims rendered without repairing their numbers | Report retained in the evidence JSON |
| Seller verification | 0.05 test USDC paid directly to the selected seller | [Arc transaction](https://testnet.arcscan.app/tx/0x62b803379e5701367937eeba0a542b8101e62f0d5d3a718a2a02a3993cc5accb) |
| Report checks | Seven checks passed, including metric equality, evidence freshness and claim scope | Fulfilled immutable order and report digest |
| Hosted job | `succeeded`, `chain-confirmed` | Neon record checked against Hedera settlement and Arc order proof |
| Confirmation replay | Same order confirmed twice with the same hash; no further transfer | HTTP 200 and identical saved checks/hash |

A fresh RPC read checked the successful Arc receipt, canonical token, exact payer/recipient/amount and block time. A fresh Hedera mirror check verified the evidence payment. The seller wallet balance was 0.1 test USDC from the two release-test orders described here. See [sanitized machine-readable evidence](2026-09-10-marketplace-testnet.json).

## Negative verification and status correction

The first distinct job, `2190f451-86f8-44b4-ba35-b7638f2e9878`, paid 0.001 HBAR and 0.05 test USDC, but its model placed extra numeric metric claims outside the required rows. The paid verifier rejected its claim scope. This is a fulfilled verification service with a negative report, not a failed transfer.

- Order: `75ab0c9b-8335-4db0-85cf-2e76c396be10`.
- [Hedera payment](https://hashscan.io/testnet/transaction/0.0.7162784%401789017438.351357730).
- [Arc seller payment](https://testnet.arcscan.app/tx/0x53dc799ee7a9311ace3863d602b4d4b3fa83e124616e0cac975ad859335de498).

The test exposed an overly conservative `uncertain` status for known negative verification. The status mapper now requires both server-verified chain proofs before classifying such a result as `failed`. After independently checking the original payments again, only that first job’s status was corrected to `failed`; its result, report, receipts, checks and order were preserved unchanged. No payment was repeated or erased. After both release jobs, the private broker journal contained 18 operation entries, all settled; this count includes report operations as well as payments.

The successful test is a new job with its own one-run signed mandate, fresh evidence purchase and fresh verification order. It is not a retry of the first transfer. Total release-test principal: **0.002 HBAR and 0.1 test USDC**, excluding network fees and inference cost.

## Scope and validation

The identities are generated release-test wallets controlled by the operator, not independent customers or evidence of market adoption. Sellers select a price and payout wallet; Obolos executes one hosted metric verifier. This does not demonstrate arbitrary seller-hosted agent code, escrow, refunds, mainnet or a decentralized planner.

Ledger credential retrieval uses the explicitly disclosed Speculos emulator and Ledger staging. Circle signs through its own agent-wallet infrastructure. Each buyer still needs a funded private runner/broker; connecting a browser wallet alone does not fund or host an agent.

The release passed 241 automated tests, including real PostgreSQL isolation/concurrency cases, TypeScript checking and a production build. Public marketplace, landing and developer pages passed desktop/mobile checks. Two isolated browser contexts also passed the genuine backend wallet-login challenge flow using generated test EOAs through a test EIP-1193 provider. The buyer displayed its succeeded job, seven passing checks and both chain-confirmed receipts; the seller displayed two confirmed orders and 0.1 test USDC. No page errors or mobile horizontal overflow were observed. This is browser integration testing, not a claim of testing a physical wallet extension.
