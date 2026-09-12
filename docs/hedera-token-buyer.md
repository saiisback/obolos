# Private HTS repository buyer

`purchaseHtsRepositories(input, credentials, directory)` is a separate fixed-supply test-credit workflow; the existing native HBAR buyer is unchanged. The seller publishes `/x402/hts/quote` and an exact token-priced `/x402/hts/evidence/repo-standard` resource. An operator supplies a pinned token ID, payer, recipient, symbol and immutable permanent request ID. Every repository costs one atomic zero-decimal test credit, with one to three distinct repositories and an approved total maximum of three credits.

The private input JSON has this shape (replace accounts, asset, origin and expiry with the explicitly authorized live testnet terms):

```json
{
  "requestId": "hts-demo-01",
  "resourceBaseUrl": "https://obolos.example/x402/hts/",
  "providerId": "repo-standard",
  "repos": ["vercel/next.js"],
  "terms": {
    "asset": "0.0.900",
    "payer": "0.0.777",
    "payTo": "0.0.123",
    "amountAtomic": 1
  },
  "unitPriceAtomic": 1,
  "maxAmountAtomic": 3,
  "mandateExpiresAt": "2026-09-13T01:00:00Z",
  "symbol": "OBTEST",
  "decimals": 0
}
```

The helper verifies the service quote, finite fungible token metadata, zero decimals, symbol and absence of token custom fees. It pins native testnet network, exact token/amount/payee/resource, and the fee payer advertised by Blocky402 before SDK signing. Token and account association must be provisioned separately by the authorized operator; no HBAR or alternate asset fallback exists.

Run only as an authorized private operator:

```sh
npx tsx --env-file=.env.broker scripts/hedera-token-buyer.ts /absolute/private/hts-purchase.json
```

Only this CLI unlocks the encrypted Ring bundle, using `WALLET_PASS` or the existing macOS Keychain entry. It prints sanitized transaction proof fields and keeps evidence/settlement and journals in `BROKER_DATA_DIR/hedera`. The exported helper receives credentials from its private caller and never unlocks keys itself.

A permanent exclusive journal and process lock precede signing. The signed native transaction ID is fsynced before exactly one paid HTTP dispatch. Successful response evidence and settlement are saved before mirror verification. A confirmed cached result can be read again with the same terms. An uncertain attempt only queries its original mirror transfer and, when the response was lost, `/x402/hts/receipts/:transactionId` for the service's stored purchased response. Missing proof or missing purchased evidence stops recovery. Never delete an uncertain journal or pay again using a new identity.

Local checks use `npx vitest run tests/hedera-token-buyer.test.ts` and `npm run typecheck`. Fixtures exercise actual native SDK token signing without funded execution; a live testnet receipt is still required to claim demonstration.
