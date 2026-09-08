# Arc verification intent awaiting reconciliation

Run: `61be389c-ab9a-4ea4-8b02-957aa4bd2b5e` — the [approved price increase](2026-09-08-approved-price-increase.md).

The accepted Speculos mandate enabled a confirmed 0.008 HBAR purchase. Report generation completed. The subsequent Circle verification operation failed with an ambiguous result; the broker retains its **50,000 micro-USDC (0.05 USDC) pending reservation**. This is an intent, not a proven transfer or settled receipt.

The first run's [0.05 USDC transaction](https://testnet.arcscan.app/tx/0x4d97395a52897a1b9c1255b1a9ba8023cec742ef64cb838a65962001930b81fe) remains a separate completed payment. It must not be reused as evidence for this second job.

## Read-only investigation

- Circle idempotency key: `3e3383b1-12ed-40a3-a54c-d46e3d4e5fdc`.
- Request ID: `61be389c-ab9a-4ea4-8b02-957aa4bd2b5e:verify`.
- Chain: Arc testnet, `5042002`; canonical USDC `0x3600000000000000000000000000000000000000`.
- Payer: `0x90602880dbee4158d96fddbdffe300c03d68e46c`.
- Recipient: `0xc76e4cf85fceda68af2e5cae6d2fc5d054362c4c`.
- Amount: `50000` in six-decimal USDC units.
- Report drafted at `2026-09-08T18:08:43.387Z`; workflow stopped at `18:09:15.233Z`.
- Circle CLI transaction history showed the first completed payment and funding, with no second payment. Its lowest pending transaction query returned null.
- Arc USDC transfer logs for blocks `61107827–61110709` contained no further payer-to-recipient transfer.
- The installed CLI's authenticated client attempted the documented read-only challenge-list endpoint through the Agent Stack proxy; that proxy returned HTTP 404.
- A second read-only history check at approximately `2026-09-08T18:27Z` still showed only the first completed transfer and original funding.
- Circle readiness succeeded after the incident. The 31.846-second failure interval is consistent with the CLI's 30-second HTTP timeout, but this is an inference. The adapter suppressed the original error, so the failing phase is unknown.

No new transfer, challenge, journal rewrite or retry was performed during reconciliation. Absence of an observed transfer does not establish that a remote challenge cannot still execute. The reservation remains pending.

## Required resolution

Obtain a definitive Circle-side status for this idempotency key and any associated challenge or transaction. If it settled, independently verify the exact chain, token, sender, recipient and amount before adding a recovered receipt. If Circle proves it failed or can no longer execute, retain that evidence and implement an explicit audited reconciliation before authorizing any replacement. Do not delete journals, reset the data directory, reuse a different request ID for this same job, or mark the reservation settled from a balance alone.

Future adapter work should persist remote challenge and transaction identifiers as soon as they are issued and retain sanitized failure-phase/error-code diagnostics. The current implementation intentionally stops on uncertainty; it has no automatic reconciliation or retry path.

## Circle support question — prepared, not sent

> On Arc testnet, Circle CLI 1.0.0 Agent Wallet transfer with idempotency key `3e3383b1-12ed-40a3-a54c-d46e3d4e5fdc` failed around September 8, 2026, 18:09 UTC. It requested 0.05 USDC from `0x90602880dbee4158d96fddbdffe300c03d68e46c` to `0xc76e4cf85fceda68af2e5cae6d2fc5d054362c4c`. No new transaction appears in history or the inspected chain logs. Can you identify the associated challenge/transaction and confirm whether it settled, is executable/pending, or definitively failed? We have preserved the pending intent and have not retried. Please provide the supported read-only reconciliation path for Agent Stack; the documented user challenge-list route returned 404 through its proxy.

Reference: [Circle list user challenges](https://developers.circle.com/api-reference/wallets/user-controlled-wallets/list-user-challenges). No external support message has been sent by this project agent.
