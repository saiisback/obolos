# Publishing public Hedera evidence

`scripts/hedera-publish-evidence.ts` reads local operator artifacts and independently checks their testnet mirror proofs. It never decrypts Ring, signs, dispatches a payment, or repeats resource purchase. Importing the module has no network or database side effects.

Create a private JSON manifest with these file paths. Relative paths resolve from the manifest's own directory; omitted optional paths publish no new proof for that workflow.

| Manifest field | Artifact |
| --- | --- |
| `identityServiceFile` | Required anchored `hedera/identity-service.json` |
| `identityBuyerFile` | Optional anchored `hedera/identity-buyer.json` |
| `a2aFile` | Completed `a2a/OPERATION.json`, including `result.receipt` |
| `htsFile` | Settled `hedera/hts-HASH.json`, including immutable input terms and result |
| `schedulesFile` | `hedera-bonus/schedules-public.json`, including plan and original references |
| `scheduledResultsFile` | Paired `hedera-bonus/scheduled-results.json`, including delivered evidence and proof |
| `auditFile` | HCS payment journal with its confirmed `.result` anchor |
| `auditPaymentFile` | Paired immutable `PaymentAuditInput` used to build the exact anchored payload |
| `replaceRelease` | Optional boolean, default false; explicitly replace the full release when true |

```sh
npx tsx --env-file=.env.local --env-file=.env.hedera-bonus scripts/hedera-publish-evidence.ts verify /absolute/private/manifest.json
npx tsx --env-file=.env.local --env-file=.env.hedera-bonus scripts/hedera-publish-evidence.ts publish /absolute/private/manifest.json
```

`verify` performs local reads and fixed testnet mirror GET requests, returning sanitized public metadata. When A2A evidence is supplied, it also authenticates the entire recorded offer with the private `A2A_OFFER_SECRET` and reads that exact transaction’s service settlement row using `DATABASE_URL`. It permits historical offer expiry for evidence verification while retaining the original signed bounds; it never authorizes another payment. The environment must pin `A2A_PUBLIC_URL`, `DATA_SERVICE_PUBLIC_URL` and `HEDERA_PAY_TO` to the original service. `publish` repeats that verification before opening its configuration update transaction. It then updates only `platform_hedera_config` records `identity-service`, supplied `identity-buyer`, and `release` in one transaction. It does not publish HTS provisioning credentials or change the separately configured `hts` service terms.

The publisher checks the exact identity payload, restricted submit key, topic/message sequence and consensus transaction; the authenticated full A2A offer, derived offer/payment-request IDs, completed response and receipt, and the service database’s exact settled offer/request/transaction association with matching delivered evidence; exact native/token transfer identity and amounts; and each finite schedule's original scheduled transaction, execution, resource proof and validated purchased evidence. Every planned scheduled delivery must be present exactly once. An HCS audit must bind its exact public payload to a supplied, independently verified identity topic and confirmed settlement. Its transaction, asset, amount, payer, payee, request ID and SHA-256 of the actual purchased evidence must match a supplied verified purchase. A standalone audit of an unrelated transfer or an arbitrary evidence digest is refused.

Only fields accepted by the public evidence schema leave the publisher. Raw purchased evidence, reports, repository lists, request IDs, offer tokens, keys and signed transaction bytes are excluded. Custom hashes and transaction references can remain visible in the already public topic message.

By default, supplied release fields merge into the sanitized existing release, preserving omitted workflows. An omitted buyer identity leaves its existing row intact. Use `replaceRelease: true` only for an intentionally complete replacement manifest: absent optional proofs are then removed from the release. The publication timestamp reflects this publication pass; retained optional fields are not reverified unless their artifact paths are supplied again. Supplying the full manifest rechecks every displayed proof.

The CLI emits only a generic failure message if source parsing, mirror verification or database publication fails. Failed publication rolls back its configuration changes. Private artifacts remain intact for reconciliation. A local completion label alone never qualifies a payment as published chain evidence.
