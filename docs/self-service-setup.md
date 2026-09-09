# Self-service testnet setup

Obolos provides wallet sign-in (`/login`), user-owned agents (`/app`), scoped API access, private runner pairing, signed spending mandates, and persisted jobs with reports and runner-confirmed receipts. The landing page is `/` and the developer guide is `/developers`. The separate operator console remains at `/demo`.

The account, API, and runner flows are implemented. A fresh funded run through the deployed self-service path is still pending; the historical operator payments do not establish that result.

## Configure the application and Neon

1. Create a PostgreSQL project in the [Neon console](https://console.neon.tech) and copy its pooled connection string.
2. In your checkout, open the ignored `.env.local` with an editor. Set `DATABASE_URL` to that connection string and `APP_ORIGIN` to the exact browser origin, such as `http://localhost:3001` for development or `https://obolos.app` for that public deployment. The database URL contains a password: keep it server-side and never use a `NEXT_PUBLIC_` variable.
3. Apply the versioned migrations:

```sh
npm run db:migrate
```

The migration runner records checksums, serializes concurrent migrations, and rolls back failures without printing the database URL. Add new migrations instead of editing applied ones.

4. Start or restart the application. Open `/login` using the configured origin, choose an installed EVM wallet, and sign the identity message. Ordinary EOA wallets are supported through EIP-6963 discovery or an injected provider. On mobile, use your wallet’s browser. WalletConnect QR and contract-wallet sign-in are not implemented.

The sign-in challenge is bound to your address, this origin, Arc testnet chain 5042002, and a five-minute nonce. It creates a seven-day revocable account session. Signing in grants no spending authority and does not unlock an operator broker.

## Create an agent and API credential

Create an agent with a name, description, and separate data and verification budgets. The form converts decimal inputs exactly into tinybars and micro-USDC. Each per-run budget is capped at 1 HBAR and 1 test USDC. Payment execution requires positive budgets.

Choose **Manage agent** to access setup, jobs, and API credentials. Issue a named `ob_test_` credential and save the once-displayed secret. It expires after 30 days, is scoped to that agent, and is stored only as a hash. Revoke it from the same panel. API credentials can read and request jobs; they cannot pair runners or change mandates. Request examples are in `/developers`.

## Pair your own runner

Follow [private runner setup](runner-setup.md) for the exact local configuration and recovery procedure. Each owner needs an isolated credential environment and their own funded testnet broker. Changing Circle CLI directories alone does not isolate OS keychain sessions.

1. Choose **Pair a runner** in the agent panel. Save the one-time `ob_runner_` token in a private local file using an editor, with directory permissions `0700` and token-file permissions `0600`.
2. Copy the public owner, agent and platform pins shown by the workspace into `.env.runner`. Set `RUNNER_TOKEN_FILE` and a dedicated durable `RUNNER_DATA_DIR`. Keep tokens out of commands, URLs, browser storage, and source control.
3. Configure and start your own loopback broker using its private `.env.broker`. Never copy the operator’s credentials, funded accounts, or payment journal into a new user environment.
4. Start the runner:

```sh
npm run agent:runner
```

The command loads `.env.broker` and `.env.runner`. The runner checks local broker readiness before claiming jobs. The workspace shows its recent heartbeat; online status alone is not proof of funding or successful settlement.

## Sign a mandate and request work

In the agent panel, set 1–3 allowed repositories, a maximum data price per repository, 1–10 runs, and expiry within 24 hours. Review the exact message and separate total HBAR/USDC allowances before signing with the account owner’s wallet. This is spending approval, separate from identity sign-in. Signing a replacement mandate changes the scope for future work.

The server and runner enforce the signed origin, owner, agent, repository/provider scope, limits, and expiry. The API persists each job and reserves a run slot before execution. An owner session or scoped API credential can queue matching repositories when a recent runner heartbeat and signed allowance are available. Missing execution setup or mandate scope returns an explicit error, never a simulated fallback or an operator-wallet payment.

The workspace preserves the same idempotency key for retries of a run request with unchanged repositories. API clients must likewise keep a stable `Idempotency-Key` for each logical job. Active jobs refresh every five seconds while the panel is open and the page is visible.

Results include the runner’s report, purchased evidence, source checks, events, and receipts. Receipts are labeled **Runner-confirmed**; they do not imply independent chain verification by the workspace. A blocked quote requires review, not automatic allowance expansion. An uncertain execution requires local journal and receipt reconciliation and is never automatically requeued. Revocation stops future authorization but cannot undo a submitted payment.

A normal owner-wallet signature does not establish physical Ledger use. Speculos is an explicitly emulated development signer; physical-device security and sponsor acceptance require separate evidence.

## Verification and remaining release gates

- [Real Neon account verification](evidence/2026-09-09-neon-accounts.md) records 43 assertions against the local production server using the actual Neon HTTP transport. Those zero-budget checks did not move funds.
- Unit and integration tests cover tenant ownership, credential scope, signed mandates, queue reservations, and durable runner recovery. Runner tests use generated signatures and fake gateways; they do not prove settlement.
- Isolated browser fixture checks cover owner-wallet matching, exact-message signing, pairing, mandate totals, idempotent retries, revocation, visible-only active polling, and result/explorer rendering. Desktop and 390-pixel mobile layouts were checked without overflow.
- Fresh public deployment verification and a separately authorized, bounded funded self-service run remain release gates until their results are recorded. Preserve the historical unresolved Arc intent; do not retry it as part of this release.

The PostgreSQL integration suite uses a dedicated test database and creates/drops its own random schema:

```sh
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55439/obolos_test npm test -- tests/platform-postgres.test.ts
npm test -- tests/runner-journal.test.ts tests/runner-execution.test.ts tests/runner-transport.test.ts
```

Without `TEST_DATABASE_URL`, the dedicated PostgreSQL suite is skipped. Keep the test database separate from production.

## Hosting boundary

The root `vercel.json` supports native Next.js hosting. Neon provides durable account, job, and x402 service state; the public metered service is exposed under `/x402`. Configure its public Hedera recipient and independent service-operator control token on the server. Applying this configuration is distinct from verifying the deployed service with a funded payment.

The private runner and broker remain on the owner’s host. Wallet keys, Circle sessions, Ring passwords, inference credentials, and broker secrets belong there, never in Vercel or Neon. Keep the runner and broker journals private and durable. The old Mac/tunnel proxy is a legacy deployment option, not a requirement of the native account and x402 service implementation.
