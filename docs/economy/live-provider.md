# Live provider operation and recovery

Only the Ledger hardware is emulated with Speculos. Arc settlement uses real testnet transactions. The reference provider runs locally with the existing seller key and retrieves the inference credential through Ledger Ring. It polls the authenticated production work queue; the website never receives the seller private key or model credential.

Run `npm run economy:provider` with private `.env.broker` and `.env.economy` files. Required new values are `ECONOMY_PROVIDER_TOKEN` and `CRON_SECRET`, matching production, plus the pinned platform origin, `INFERENCE_MODEL=gpt-5-nano`, and `INFERENCE_BASE_URL=https://api.openai.com/v1`. Supply the Ring unlock through the existing private credential mechanism. Protect files with mode 600. Preserve `data/economy-provider` and all operation journals across restarts.

The actual reference services are:

- Compute: Unicode character count, word count, UTF-8 byte count and SHA-256 of supplied text.
- Data: a current GitHub repository response with source URL and retrieval timestamp.
- Inference: a real model request, including returned request ID and token usage. Failure produces no fabricated response.
- Verification: a SHA-256 content-integrity check. This does not assess narrative quality or economic value.
- Storage: text stored durably in PostgreSQL, retrievable by its authenticated buyer at `/api/economy/storage/<orderId>` during the original one-hour lease beginning at the persisted provider claim time. The service accepts up to 32,768 characters and bills one `stored-object-hour`. It does not bill the small object as a gigabyte. Returned bytes report the actual content size. Delayed or expired work cannot silently renew the lease. Retention in backup or private journals can outlast retrieval expiry; this is not secure erasure.

Supply an optional private `GITHUB_TOKEN` scoped to public repository metadata to avoid the unauthenticated source quota. To retry a failed data, compute or integrity-check job after repairing its dependency, stop the existing worker and restart with `--retry-read <original-orderId>`. The same paid request and claim token are retained. Completed work, storage leases and uncertain inference calls cannot use this retry.

Provider health is available at `/api/economy/provider/status`. It reports the last authenticated worker contact, not a guarantee of future delivery. Keep the private host awake and online. Stable claim IDs recover lost claim responses. Once model execution might have happened, an interrupted job is marked failed rather than automatically charged again; inspect its preserved journal and use seller-funded recovery. An output already saved retries the same delivery attestation, never a replacement payment.

The worker requests one bounded index batch every minute while online. Vercel also invokes the authenticated index route daily as a fallback that fits its daily cron tier. The public economy API reports freshness and catch-up status; daily fallback alone is not continuous indexing.

Buyers can record disputes in the economy workspace. Sellers can record an already-completed canonical USDC refund by transaction hash, transfer log index and amount. A transfer must be finalized, later than payment, from the seller to the original payer, allocated once globally, and within the paid principal. These are voluntary refunds: atomic settlement is not escrow and does not provide compulsory arbitration. The review-pool allocation does not automatically pay reviewers.

Seller retirement permanently removes an offer from discovery. Exact historical definitions and paid-order delivery remain available. Offchain retirement cannot cancel an already-submitted onchain transaction; revoking the onchain mandate is the spending stop. Trusted independent reviewer and valuation roles are configured separately; absent authentic evidence remains unavailable. See [signed evidence](signed-evidence.md) and [executor](executor.md).
