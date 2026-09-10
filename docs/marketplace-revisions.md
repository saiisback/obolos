# Marketplace attribution and price history

Listings continue to run Obolos's hosted repository metric verifier. Publishing a listing does not deploy a seller's own code or transfer funds into an agent wallet. A seller optionally attributes a listing to one of their owned agents; settlement still pays the authenticated seller wallet saved on the listing.

## Publishing

Authenticated `POST /api/market/services` accepts the existing `name`, `description`, and integer `priceAtomic` fields, plus an optional `agentId`. Prices use USDC atomic units (1 USDC = 1,000,000 units), within the existing 1,000–1,000,000 unit bounds. The server checks agent ownership in the insert statement. Another user's agent is indistinguishable from an absent agent (404). Existing listings without attribution remain valid.

Public catalog responses include optional `agentId` and `agentName`. The latter is the agent's name captured at publication. Agent attribution is immutable for the listing, and these display fields are deliberately excluded from the signed `VerificationService` snapshot. Signed price, revision, endpoint, and payout enforcement remain unchanged.

## Editing and history

Authenticated `PATCH /api/market/services/:id` continues to accept name, description, price, and active status. Each accepted edit advances the revision. PostgreSQL records that revision in the same transaction using a trigger, so a history write failure also rolls back the listing edit. Concurrent edits serialize on the listing row and receive distinct revisions. The revision table rejects updates and deletes.

Public `GET /api/market/services/:id/history` returns up to the latest 100 revisions, newest first:

```json
{
  "revisions": [
    {
      "revision": 2,
      "name": "Repository verifier",
      "priceAtomic": 50000,
      "active": true,
      "recordedAt": "2026-09-10T10:00:00.000Z",
      "source": "change"
    }
  ]
}
```

No owner IDs, credentials, or private agent configuration are returned. Paused listings retain their public history. Migration `008_market_service_revisions.sql` captures each existing listing's current revision with `source: "backfill"` and the migration recording time. Earlier revisions and original edit timestamps were not stored and are not reconstructed.

This is a database audit history, not an on-chain price oracle or a decentralized dispute mechanism. New mandate preparation reads the current service revision. Existing signed selections continue to fail closed if a service changes before purchase; increasing a listing price does not expand a buyer's authorization.

## Verification

`tests/market-service-history.test.ts` covers API validation, attribution boundaries, public history projection, and signed-snapshot compatibility. `tests/market-service-postgres.test.ts` runs migrations in a temporary schema and verifies legacy backfill, actual ownership enforcement, concurrent revisions, and immutable history. Set `TEST_DATABASE_URL` to a disposable PostgreSQL instance when running the integration suite. The tests do not spend testnet funds.
