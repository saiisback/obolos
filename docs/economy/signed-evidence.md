# Signed economic evidence

`POST /api/economy/evidence` accepts `{payload, signature}` as JSON, at most 64 KiB. The payload schema is exported as `evidenceSchema` in `src/lib/economy/evidence.ts`. No example production observations are seeded. A signature is an attestation with identified provenance, not objective proof of economic value or independent demand.

An operator must independently establish the identity and independence of attestors, then configure `ECONOMY_EVIDENCE_SIGNERS` as a JSON object mapping lowercase EOA addresses to arrays of permitted roles: `order`, `window`, `basket`. Empty, missing or invalid configuration trusts nobody. A platform login does not grant attestation authority. Undisclosed common control cannot be established from different wallet addresses alone.

Sign the exact UTF-8 EIP-191 message returned by `evidenceMessage(payload)`:

```
Obolos economic evidence v1
<canonicalJson(payload)>
```

Canonical JSON sorts object keys; arrays retain their order. The payload uses lowercase addresses/hashes, decimal atomic-unit strings, Unix-second timestamps and protocol `obolos.evidence.v1`. Bind chain 5042002 and all three deployed contract addresses. Every scope is one closed UTC day `[windowStart, windowEnd)`; `issuedAt` must be after its end and no later than submission time. Include a public evidence reference and a content hash. Do not include report bodies, credentials, signed URLs or confidential cost-source documents: accepted payloads and their public signatures are included in the public economy snapshot.

- `order` binds the exact order, transaction, agent, payer, seller, input and output hashes. Finalized payment, delivery and matching acknowledgment must all occur within the signed day. The signer must differ from payer, seller, registered owner and executor. The full-resource breakdown explicitly includes payment, gas, inference, other costs, conversion provenance and an exhaustive-accounting attestation. Its sum must equal total resource cost; payment must match chain settlement. Final-output and intermediate-input valuations are provided by the authorized independent attestor, never derived from service delivery.
- `window` binds capital, the complete active-agent list, and the finalized last block before the day boundary. The next finalized block must be at or after the boundary. The list is compared to historical policy contract state; the attestor must differ from active owners/executors. Capital remains a signed accounting assessment supported by the attestor's reference. It is not automatically proved by a token balance query.
- `basket` binds each fixed baseline service hash and an explicitly selected quote hash for that day. Baseline must predate the day. Quote must exist before the day ends and match seller, category, unit, quantity and endpoint. The fixed `basketId` is `canonicalJsonHash` of components sorted by `id`, excluding only `quoteServiceHash`. Weights sum to 10000. An older immutable offer remains a valid exact quote; the indexer never substitutes the latest registration. The basket attestor must differ from its sellers.

The first accepted payload for deployment + role + order/day is immutable. An exact payload replay is idempotent. A different payload for that same scope returns 409, even if signed by another trusted attestor. Corrections currently require an explicit future methodology/migration; there is no overwrite or silent latest-wins path.

Run indexing before ingestion so finalized chain evidence and the cursor exist. After ingestion, invoke the normal authenticated refresh, `npm run economy:index`, or scheduled indexing. A changed evidence root triggers recomputation even at the same block. Historical signed days are recomputed in date order, and previous observation rows remain intact. Missing fields or an unattested basket/day remain unavailable. Existing unsigned legacy baskets are retained but no longer used as authenticated metric inputs.

## Scheduled indexing

Configure a random `CRON_SECRET` of at least 32 characters. `GET /api/cron/economy-index` requires `Authorization: Bearer <CRON_SECRET>`. Configure the host scheduler to call it every five minutes when supported. One invocation processes at most 2000 finalized blocks. Transaction advisory locks prevent overlapping work without retaining session locks in a transaction pool. Only transient HTTP/timeouts may retry once; chain reconciliation errors fail closed. There are no wallet/payment calls.

`GET /api/economy` includes freshness: `awaiting_index`, `catching_up`, `stale`, or `fresh`, plus index/chain ages. Older than ten minutes is stale. Large initial backlogs require repeated invocations or the existing CLI. Finalized event history is paged in groups of 2000 rows. Lifetime event, seller, agent and historical-window counts do not stop the cursor. Oversized RPC log ranges are reduced before processing. A single block is never dropped solely for exceeding a log-count threshold. Full-history projection, database writes, on-chain ownership reads and historical-day reprojection still grow with the deployment; further incremental projection work is needed for sustained large-scale throughput. Evidence submissions remain bounded by the 64 KiB request limit and their schema limits, including 256 active-agent IDs per signed denominator. Route duration is capped at 300 seconds; RPC timeouts and bounded batches do not guarantee every batch completes within that deadline.

## PostgreSQL checks

Run `TEST_DATABASE_URL=<isolated-capable direct PostgreSQL URL> npx vitest run tests/economy-evidence-postgres.test.ts`. The suite creates a random schema, applies every migration and drops that schema afterward. Neon transaction-pool URLs reject `search_path` startup options; use the direct endpoint for these integration tests. Never print or check in connection credentials.


## Recovery and review projection

Public recovery records are joined through the immutable order's exact chain, settlement and ledger addresses, then matched to the indexed payment transaction, seller and payer. New review, dispute or refund records trigger a same-block rebuild. Reviewer trust changes also trigger a rebuild. Private dispute reasons and platform user IDs are not projected.

The reputation field `qualityScore` is the **evidence-based trusted review pass rate**, in basis points. It is available only when every non-self paid order for that seller has delivered and acknowledged output plus at least one currently trusted review of that exact output. All qualifying reviews for each order must agree. The numerator is the count of orders whose qualifying verdict is `passed`; the denominator is all non-self paid orders. It does not measure objective usefulness or economic value.

`verifiedReviews` counts distinct known reviewer controllers per order. `reviewedOrders`, `reviewEligibleOrders`, `passedReviewOrders` and `conflictingReviewOrders` expose coverage and disagreement. An address related to the seller, payer or owner through immutable `executorOwners` bindings is excluded, including executors that have never registered an agent and recursive ownership chains. Known same-controller orders are excluded from both value-added metrics and review scores. Raw recovery review records expose `countsTowardReview` so exclusions are explicit.

Dispute counts, refund transfer counts and refunded atomic amounts remain factual records, including on self-controlled orders. They are never transformed into a quality bonus or penalty. Original chain events, settlement receipts and prior immutable observations remain unchanged.
