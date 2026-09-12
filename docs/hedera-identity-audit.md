# Hedera public identity and payment audit

`src/lib/hedera/identity.ts` implements the HCS-14 draft retrieved on 2026-09-12. `canonicalAgentData` trims strings, lowercases registry/protocol, sorts numeric skills, accepts core IDs 0–39 and OASF IDs 100+, and serializes only the six required keys in alphabetical order. `createUaid` hashes UTF-8 JSON with SHA-384 and encodes its 48 bytes as Bitcoin Base58; routing order is uid, registry, proto, nativeId, domain.

The [official HCS-14 vectors](https://hol.org/docs/standards/hcs-14/) supply inputs but use `{base58hash}` placeholders. Their illustrative canonical JSON places skills first despite the normative alphabetical rule. Our test uses the official HCS-10 inputs, follows the normative ordering and independently pins the derived hash. SHA-384 hex is `d97d6d05cfba3338dda284b483e94484ee3651becb8de7903239a9f402ff21d124aca0a971f5d7c569d660060fe1beee`; Base58 is `8yjEeyipVRyYFKKjnt8QXXTTQbprY1fVCqZA3UvN39v4JQtjHACwMmaq9HXCcZRu6V`.

`HederaAgentIdentity` carries canonical public data, UAID, restricted submit key and optional topic/profile proof. `HcsAnchor` carries testnet network, topic ID, submission transaction ID, sequence number, consensus timestamp and the fixed mirror URL. A generated UAID alone is a local identifier. Registration is chain confirmed only after the topic's exact submit key and the message bytes, sequence, timestamp and successful transaction binding all pass mirror verification. Current mirror responses use `submit_key._type` and a structured `chunk_info.initial_transaction_id`; the verifier supports these observed formats and the documentation’s older string example while checking the exact initial transaction identity and a single chunk.

The compact application payloads are `obolos.hcs-profile` v1 and `obolos.hcs-payment` v1. They are custom audit schemas; they do not claim HCS-10 discovery or full HCS-11 profile registration. Profiles publish recomputable canonical identity. Payments publish UAID, exact settlement transaction reference, asset, amount, payer/payee, SHA-256 request ID and SHA-256 evidence digest. Never pass private job text, raw reports, keys or signed transactions to these payloads. Each message is bounded to 1024 UTF-8 bytes.

## Private operator

Use the existing broker environment and encrypted Ledger Ring. The commands below perform real testnet transactions when prerequisites are present. This document supplies no fabricated evidence.

```sh
npx tsx --env-file=.env.broker scripts/hedera-register.ts register service
npx tsx --env-file=.env.broker scripts/hedera-register.ts register buyer
npx tsx --env-file=.env.broker scripts/hedera-register.ts verify service
npx tsx --env-file=.env.broker scripts/hedera-register.ts anchor-payment buyer --payment-file /absolute/private/payment-audit.json
```

The payment file has `PaymentAuditInput`: uaid, paymentTransactionId, network (`hedera:2`), asset (`HBAR` or native token ID), amountAtomic (positive decimal string), payer, payTo, requestId and evidenceDigest (SHA-256 hex). It must describe an actual successful x402 settlement. The operator independently verifies exact transaction ID, successful native/token transfer and payer/payee amounts before anchoring. Native payer fees are accepted only when the mirror identifies that payer as fee payer and the debit equals the exact amount plus charged fee; token custom fees are outside this schema. Scheduled payment IDs retain their `?scheduled` suffix and require a mirror transaction with `scheduled: true`. Private flow code can call exported `anchorPaymentAudit(identity, payment, credentials, directory)` after its existing settled response validation; audit failure must retain the settled payment rather than repeat purchase.

Private files are under `BROKER_DATA_DIR/hedera` (default `data/broker/hedera`) with directory mode 0700 and file mode 0600. Identity is persisted before topic creation. Every operation retains transaction ID and signed bytes before dispatch. Max fee is 1 HBAR per transaction, validity 120 seconds, one SDK submission attempt. Creation, profile and payment operations have separate process locks and journals. Rerunning an existing intent performs only a receipt query (with mirror fallback after receipt expiration) or mirror verification using that same transaction identity; it never signs or sends a replacement. If mirror indexing is delayed, rerun the same command to reconcile. A transaction that definitively failed requires explicit operator investigation; uncertainty is never an instruction to delete a journal.

`verify` is entirely read only and does not decrypt Ring secrets. Funded commands output only public proof metadata. The private journals contain signed bytes and must never be copied to the public evidence endpoint or committed.
