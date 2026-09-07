# Independent security and integration review

Reviewed 2026-09-07 against the approved Obolos design and implementation plan. Scope: policy/engine, persistence, API ownership/mutations, broker, paid evidence service, Hedera/Circle adapters, and physical approval script. UI excluded.

## Re-review status — resolved

Both P2 findings below are resolved in the reviewed implementation as of 2026-09-07 22:29 IST. No remaining P1/P2 blocker was found in these two fixes. The original findings are retained below as review history; their original line numbers refer to the earlier implementation.

- **Mandate expiry:** `mandateExpiresAt` now flows from the engine through both typed purchase contracts, strict broker schemas, journal operations, and adapters. The broker checks on entry, after queueing and after durable intent persistence. Hedera checks immediately before creating the signed payload and again after saving its signed intent, before transmission. Circle checks after wallet readiness immediately before launching its transfer command. Documentation accurately scopes expiry to new submissions; it cannot cancel an operation already handed to Circle/the network.
- **Fixed verification fee:** broker health requires exactly 50,000 micro-USDC, and `/verify` rejects any other configured fee before credential loading, evidence lookup, or payment. This matches the engine's fixed amount and prevents the previously described lower-fee transfer followed by receipt rejection.

Re-review validation: `npm test` passed **60 tests across 7 files**. New regressions cover expiry while queued, expired endpoint requests, Circle readiness crossing expiry, Hedera expiry during challenge/facilitator/durable-intent/signed-intent stages, no signing before an expired deadline, no transmission after it, and lower-fee rejection in both health and `/verify`. Existing idempotency, ownership and receipt tests remain passing. No real funds or hardware were used.

## Original findings (both resolved)

### Browser-origin follow-up

The parent reproduced Next normalizing `127.0.0.1` to `localhost` in `nextUrl`, while retaining the actual browser Host. `sameOrigin` now treats configured `APP_ORIGIN` as authoritative and otherwise compares the request protocol plus Host. The independent reviewer found no P1/P2 security issue in this change: it does not trust forwarded-host headers, and still rejects cross-site fetch metadata. Five HTTP regressions now cover normalized loopback, hostile origins, a pinned deployment origin, fetch metadata and session/operator signatures.

### Resolved P2 — Carry mandate expiry to the point that starts a transfer

Locations: `src/lib/contracts.ts` (DataPurchase and VerificationPurchase), `services/broker.ts:115`, `src/lib/integrations/hedera.ts:121–132`, `src/lib/integrations/circle.ts:39–40`.

The app checks expiry at advance entry and `assessQuote` correctly checks it again after live discovery. Neither payment request carries expiry to the broker, however. The broker can wait for another operation in its serialized journal; the Hedera adapter then awaits an unpaid challenge and facilitator metadata, and the Circle adapter awaits a wallet-list subprocess. A mandate with only seconds remaining can consequently cause a new signature/submission after its expiry. An early app check cannot enforce the advertised payment deadline across these asynchronous boundaries.

Reproduction scenario (source-level): create a mandate expiring in one second, advance the purchase before the deadline, and delay the Hedera unsigned challenge or Circle readiness response by two seconds. Both adapter paths continue into signing/transfer without any remaining expiry condition. This does not require manipulating an approved amount or acquiring another session.

Fix: carry the immutable mandate expiry in both broker schemas and payment input contracts. Reject expired requests after entering the journal queue, and recheck immediately before creating/sending a Hedera payload and before invoking the Circle transfer command. Bound the Hedera transaction lifetime to remaining authorization time where supported, or document that the expiry governs submission rather than final settlement. Add a delayed-dependency regression asserting no paid request/CLI invocation occurs after expiry.

### Resolved P2 — Reject a verification fee that differs from the app's fixed fee before paying

Locations: `services/broker.ts:100`, `services/broker.ts:141–145`, `src/lib/engine.ts:69–74`.

Broker health treats any positive `ARC_VERIFICATION_FEE_ATOMIC` as ready, and `/verify` permits any positive fee less than or equal to the requested maximum. The engine instead requires an exact 50,000-micro-USDC receipt. With the otherwise valid setting `ARC_VERIFICATION_FEE_ATOMIC=49999`, the broker transfers 49,999 and saves a settled result, then the app rejects that actual receipt, permanently fails the run, and does not append the settlement to its exported receipts. Increasing credentials or funding cannot fix this code/configuration contract mismatch.

Reproduction scenario (source-level): use a configured broker with fee 49,999 and an eligible report; the engine submits maximum 50,000, broker's `fee > input.maxAmountAtomic` condition is false, and the returned amount fails the engine's equality validation. The transfer happens before that rejection.

Fix: share a constant for the fixed 50,000 fee and reject any incompatible setting in health and `/verify` before executing a payment. Alternatively implement an explicit quoted-fee contract end to end; the approved current scope specifies the fixed fee. Add a broker test proving a lower configured fee cannot call the Circle adapter.

## Verification and observations

The initial review ran `npm test` successfully: 5 files, 44 tests passed. The re-review above supersedes that count with 60 passing tests. Existing coverage exercises journal serialization, restart uncertainty, changed idempotency payloads, duplicate chain transactions, exact Hedera transfer proof, API broker authentication, and session run isolation. These results do not include a complete authenticated live chain purchase.

Read installed `@circle-fin/cli@1.0.0` source through its source map: wallet transfer accepts the idempotency flag; the agent challenge output includes echoed idempotencyKey, blockchain, txHash, sourceAddress and destinationAddress, matching the adapter. Current SDK-backed Hedera signing tests executed successfully. No concrete SDK shape incompatibility found in the inspected paths.

No additional P1/P2 ownership bypass, automatic duplicate payment retry, credential response leak, or false live-settlement claim was found within this bounded review. The public service verifies terms, persists an intent before settlement, and rejects replay; broker journals reserve uncertain payments and refuse replacement stage IDs. Approval verification uses the saved message and pinned address, with hardware provenance accurately distinguished from signature validity.

External gates are separate from the code findings: funded Hedera and Arc testnet accounts, Circle login/session, Key Ring provisioning, a connected physical Ledger, externally hosted endpoints, actual paid receipts, and organizer qualification evidence remain operator-dependent. No credentials, wallet provisioning, device signing, or real payments were attempted during this review.
