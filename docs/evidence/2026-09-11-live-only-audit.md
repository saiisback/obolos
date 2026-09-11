# Live-only release audit

This release permits emulation only for Ledger hardware through explicitly selected Speculos. The deployed application rejects new rehearsal execution and simulated payments. Isolated fixtures remain in automated tests; they are not production providers.

| Surface | Runtime implementation | Evidence boundary |
| --- | --- | --- |
| Ledger | Speculos runs the actual Sync/Ethereum apps and signs bounded policy digests | Emulated hardware, disclosed in signing records |
| Spending | Canonical Arc testnet USDC, existing Circle wallet and deployed contracts | Finalized receipts and exact policy/agent/service/input binding |
| Compute | Actual counts and SHA-256 of supplied text | Returned values derive from the paid input |
| Data | Authenticated retrieval of public GitHub repository metadata | Exact repository, source URL and retrieval timestamp |
| Inference | Actual OpenAI gpt-5-nano request through private Ring credential access | Provider request ID and token usage; no synthetic fallback |
| Verification | Actual SHA-256 content-integrity check | Does not assert narrative quality or monetary value |
| Storage | Durable PostgreSQL content, authenticated buyer retrieval and fixed one-hour lease | Actual bytes and hash; one stored-object-hour |
| Delivery | Seller signs the actual output hash on-chain; buyer separately acknowledges it | Payment, seller delivery and buyer acknowledgment remain distinct |
| Economics | Signed order/window/basket evidence with known-controller exclusions | Missing or incomplete independent evidence stays unavailable |
| Recovery | Immutable disputes/reviews, proof-verified voluntary refunds, seller retirement | No escrow, compulsory arbitration or automatic reviewer payout |
| Indexing | Authenticated bounded scheduled batches with paced/retried read calls | Public freshness/catch-up status; no simulated chain state |

A private provider host must remain online. It polls the real work queue and requests index refreshes every minute; a daily Vercel cron provides a fallback. This is testnet execution with test assets, not mainnet production maturity or independent market demand. The release buyer and reference seller are operated for integration verification; their activity does not establish independent economic usefulness.

The release repaired and regression-tested lost claim/completion responses, stale process locks, storage expiry, known common-controller reviews, same-block refunds, exact historical service lookup, pre-submit payment failure, post-approval key/offer revocation, and runtime RPC limits. Failed read-only data/compute/integrity work can be explicitly retried under its original claim and paid request. Uncertain charged inference is not automatically repeated.

Circle's secondary confirmation view can lag the chain. Durable operation identity must be retained; a missing API transaction hash never authorizes a replacement payment. Every accepted payment still requires successful finalized chain evidence.

See [provider operation](../economy/live-provider.md), [executor recovery](../economy/executor.md), and [signed economic evidence](../economy/signed-evidence.md). [Final release receipts](2026-09-11-live-only-release.md) are recorded separately so historical Phase 2 evidence remains unchanged.
