# Hedera A2A negotiation

The public `/.well-known/agent-card.json` describes the [A2A 0.3.0 specification](https://a2a-protocol.org/v0.3.0/specification/) JSON-RPC endpoint at `/api/hedera/a2a`. It negotiates native testnet HBAR repository evidence using `message/send`. `tasks/get` and `tasks/cancel` return TaskNotFound because this synchronous negotiation returns Messages and does not assign Tasks. Acceptance is an unpaid authorization; successful paid evidence is produced by the trusted buyer through the existing native x402 adapter and its exact signed-transaction mirror verification.

Configure `A2A_PUBLIC_URL`, `DATA_SERVICE_PUBLIC_URL`, `HEDERA_PAY_TO`, and a private `A2A_OFFER_SECRET` of at least 32 bytes on the seller and resource service. `DATA_SERVICE_URL` is the buyer's pinned resource base and must resolve to the exact resource URL in the accepted offer. Optional `HEDERA_SERVICE_UAID` exposes a separately evidenced public identity. None of these routes unlock Ring or receive payer keys.

The proposal DataPart contains `action: "propose"`, payer account, permanent `requestId`, provider ID, one to three distinct repositories, `maxAmountAtomic` in tinybar, and ISO `mandateExpiresAt`. Below the current resource price, the seller returns a counteroffer requiring renewed authorization. Otherwise it returns a signed offer for the current exact price. The acceptance DataPart contains `action: "accept"`, the same payer and request ID, and `offerToken`; its Message must carry the returned context ID.

The token binds payer, request, repositories, exact HTTPS resource, unit price, total, cap, recipient, native HBAR asset, testnet network, issue time, and expiry of at most 60 seconds. `offerId` hashes its canonical payload and the private x402 idempotency identity is `a2a:<offerId>`. The resource service must validate the token and verified payer, claim the offer ID durably and uniquely before dispatch, and retain its settlement association. A token signature alone is not a payment receipt.

Run the private buyer only as an explicitly authorized operator:

```sh
npx tsx --env-file=.env.broker scripts/hedera-a2a-buyer.ts demo-a2a-01 repo-standard 100000 2026-09-12T23:59:00Z vercel/next.js
```

Use a fresh future mandate expiry and a bounded amount within `BROKER_MAX_DATA_ATOMIC`; provider must appear in `BROKER_ALLOWED_PROVIDERS`. The script discovers the pinned Agent Card, negotiates, unlocks the existing encrypted Ring bundle privately, and calls `purchaseHederaData`. It persists a permanent operation before any external call and stores accepted offer and paid receipt/evidence in private `BROKER_DATA_DIR/a2a`. Public stdout contains only offer and settlement proof metadata. A repeated completed operation returns its proof; any other existing operation stops for reconciliation. Never delete an uncertain intent or repeat a payment using a new operation identity.

Local verification: `npx vitest run tests/hedera-a2a.test.ts tests/hedera.test.ts` and `npm run typecheck`. Tests exercise protocol rejection, payer/context binding, price negotiation, expired/tampered offers, actual SDK signing through the existing adapter with controlled HTTP fixtures, evidence validation and no automatic retry after uncertainty. These tests do not claim live chain execution. Retain the live testnet receipt and mirror proof before marking the A2A paid flow demonstrated.
