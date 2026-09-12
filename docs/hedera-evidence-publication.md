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
npx tsx scripts/hedera-publish-evidence.ts verify /absolute/private/manifest.json
npx tsx --env-file=.env.local scripts/hedera-publish-evidence.ts publish /absolute/private/manifest.json
```

`verify` performs local reads and fixed testnet mirror GET requests, returning sanitized public metadata. `publish` repeats that verification before connecting to the configured database. It then updates only `platform_hedera_config` records `identity-service`, supplied `identity-buyer`, and `release` in one transaction. It does not publish HTS provisioning credentials or change the separately configured `hts` service terms.

The publisher checks the exact identity payload, restricted submit key, topic/message sequence and consensus transaction; accepted A2A offer and receipt consistency; exact native/token transfer identity and amounts; and each finite schedule's original scheduled transaction, execution, resource proof and validated purchased evidence. Every planned scheduled delivery must be present exactly once. An HCS audit must bind its exact public payload to a supplied, independently verified identity topic and confirmed settlement.

Only fields accepted by the public evidence schema leave the publisher. Raw purchased evidence, reports, repository lists, request IDs, offer tokens, keys and signed transaction bytes are excluded. Custom hashes and transaction references can remain visible in the already public topic message.

By default, supplied release fields merge into the sanitized existing release, preserving omitted workflows. An omitted buyer identity leaves its existing row intact. Use `replaceRelease: true` only for an intentionally complete replacement manifest: absent optional proofs are then removed from the release. The publication timestamp reflects this publication pass; retained optional fields are not reverified unless their artifact paths are supplied again. Supplying the full manifest rechecks every displayed proof.

The CLI emits only a generic failure message if source parsing, mirror verification or database publication fails. Failed publication rolls back its configuration changes. Private artifacts remain intact for reconciliation. A local completion label alone never qualifies a payment as published chain evidence.
