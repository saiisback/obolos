# Hedera x402 data service

The separate resource service sells current public GitHub repository metadata through native Hedera x402 v2 `exact`. It calls the hosted Blocky402 facilitator at `https://api.testnet.blocky402.com`. HBAR uses asset `0.0.0` and integer tinybar; 100,000,000 tinybar equals 1 HBAR. There is no EVM wrapping, USDC substitution, mainnet fallback or simulated live receipt.

## Configure and run

1. Create and fund separate **testnet** payer and recipient accounts using the [Hedera developer portal](https://portal.hedera.com/). Keep both distinct from the facilitator fee payer. No account creation or purchase is performed by setup.
2. Copy `.env.services.example` to `.env.services`. Set the recipient `HEDERA_PAY_TO` and a random operator token of at least 24 characters. An optional `GITHUB_TOKEN` is used only by the data service to read public repository metadata. The buyer key never belongs in this file.
3. Start `npm run data-service`. It fails at startup if recipient configuration or Blocky402 initialization fails. Discovery and quotes require no payment; the paid resource returns HTTP 402 first.
4. In the broker configuration, set `DATA_SERVICE_URL` to the resource service base URL and `HEDERA_PAY_TO` to that same configured recipient. Provision the payer account id/private key through the Ledger Key Ring bundle described in the broker setup. The broker passes `{accountId, privateKey, keyType}` directly to the adapter after decryption. The adapter also supports broker-process-only `HEDERA_PAYER_ACCOUNT_ID`, `HEDERA_PAYER_PRIVATE_KEY` and `HEDERA_PAYER_KEY_TYPE` (`der`, `ecdsa`, or `ed25519`) for standalone integration use. The application's live broker retains its separate Key Ring readiness requirement.
5. For public deployment, run one service process with a persistent `DATA_SERVICE_DATA_DIR`, bind `DATA_SERVICE_HOST=0.0.0.0` behind an HTTPS reverse proxy, and set `DATA_SERVICE_PUBLIC_URL` to its public HTTPS base URL. It must match the broker's base URL exactly because the payer binds the challenge to the resource URL. Do not mount the broker's secret files into this service.

## HTTP contract

All amounts below are integer tinybar. Endpoints are relative to the service base URL.

| Endpoint | Request | Response |
| --- | --- | --- |
| `GET /health` | none | Facilitator/network configuration status; not proof of payment |
| `GET /discovery` | none | `Provider[]`, including `repo-standard` and `repo-economy` |
| `POST /quote` | `{ "providerId": "repo-standard", "repos": ["vercel/next.js"] }` | Unit price, count, total, network, asset, recipient and expiry |
| `POST /evidence/:providerId` | `{ "repos": ["vercel/next.js"] }` | First HTTP 402 plus `PAYMENT-REQUIRED`; paid request returns `{evidence, quote}` with `PAYMENT-RESPONSE` |
| `POST /operator/prices` | `{ "providerId": "repo-standard", "unitPriceAtomic": 400000 }` and operator Bearer token | Updated persisted unit price |

Standard starts at 100,000 tinybar per repository and economy at 120,000. These are two transparent price options from the same service and GitHub source, not a claim of independent providers. Price mutation accepts 1–100,000,000 tinybar per repository. Change both options to 400,000 and 450,000 for the mandate escalation demo, or change only standard to demonstrate automatic selection of economy. Prices are server authoritative: the paid request recomputes its total. A quote is advisory and the payer revalidates the actual 402 challenge before signing.

The request accepts one to three distinct `owner/repository` slugs; invalid paths, URLs, duplicate names and redirect targets are rejected. GitHub requests use only `https://api.github.com/repos/{owner}/{repo}`. Private repositories are refused even if a configured token could read them. Responses include GitHub API source URLs, fetch timestamps, last push timestamp, language, license, stars, forks and open issues. Open issue count is GitHub's reported count and may include pull requests. The service fetches evidence before asking Blocky402 to settle, so an upstream failure does not trigger settlement.

## Approval and settlement boundary

`purchaseHederaData(input, credentials?)` runs inside the broker. It requires the approved provider, repository count, exact unit price and total cap, then checks the actual challenge's network, native asset, exact recipient, amount, resource URL, fee payer and protocol. The fee payer is read from the fixed hosted facilitator's `/supported` response. SDK signing happens only after these checks and after a durable intent lock.

The broker records the transaction id decoded from its own signed transfer. A successful provider response must contain an x402 settlement receipt for that same transaction and payer. The adapter additionally queries the fixed Hedera testnet mirror node and requires a `SUCCESS` native transfer debiting the payer and crediting the recipient by precisely the approved amount. Mirror indexing is polled read-only up to five times; the paid request is never retried automatically. Only then does it return a `settled` receipt and validate the evidence schema/source URLs.

Broker intents/results live in `BROKER_DATA_DIR/hedera` (default `data/broker/hedera`). A settled idempotency key returns its saved result. A reused key with changed terms fails. An interrupted attempt remains blocked, including after restart. Resource-service intents are keyed by native transaction id so replaying the same transfer with a new HTTP key is refused.

## Reconcile uncertainty

If an HTTP response, settlement, or mirror proof is missing, stop the run. Locate its transaction id in the broker journal and inspect the corresponding resource-service journal and [Hedera testnet explorer](https://hashscan.io/testnet). Query the [mirror transaction endpoint](https://docs.hedera.com/reference/rest-api/transactions) for consensus success and exact transfers. A successful service journal also retains the purchased evidence. Preserve these records; never delete an intent or create a fresh request id simply to bypass uncertainty. This MVP deliberately has no automatic reconciliation override. Recover the verified result under operator review before resuming the run, or document a conclusively failed/expired transfer before authorizing a new run.

## Verified locally vs external evidence

On 2026-09-07 the hosted `/supported` endpoint advertised x402 v2 `exact` on `hedera:testnet`, fee payer `0.0.7162784`. Local HTTP smoke checks returned discovery and a genuine SDK-built unpaid challenge of 200,000 tinybar for two standard repositories. Unit/integration tests cover unsafe slugs, server metering, operator authentication, price changes, spend limits, wrong chain/asset/payee/fee payer, unproven settlement and durable no-retry behavior using an ephemeral test signing key and mocked transport. These are not a real payment or proof of funded accounts. Actual Blocky402 settlement, mirror receipt, public deployment and testnet transaction links remain external submission gates.

Implementation references: [Blocky402 quickstart](https://blocky402.com/docs/quickstart/), [Blocky402 API](https://blocky402.com/docs/api-reference/), [official x402 Hedera package source](https://github.com/x402-foundation/x402/tree/main/typescript/packages/mechanisms/hedera). The code uses installed `@x402/hedera` and `@x402/core` 2.25.0 types and the standard v2 `PAYMENT-*` headers. No copied example's legacy header names are assumed.
