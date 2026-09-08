# Self-service testnet preview

Obolos now has a landing page (`/`), wallet sign-in (`/login`), an agent workspace (`/app`) and a developer guide (`/developers`). The original operator console is at `/demo`, with its original sessions, payment journals and separate operator authorization.

## Connect Neon

1. Open the [Neon console](https://console.neon.tech), create a project named `obolos`, and choose a region close to the application deployment. See [Neon's project instructions](https://neon.com/docs/manage/projects).
2. On the project dashboard, click **Connect** and copy the PostgreSQL connection string with connection pooling enabled. See [Neon's connection guide](https://neon.com/docs/guides/vercel-manual).
3. Open the ignored local configuration file:

```sh
cd /Users/saikarthik/Desktop/Projects/workspace/ETHONLINE
nano .env.local
```

Add `DATABASE_URL=` followed by the connection string. Keep it server-side; it contains a database password. For public use set `APP_ORIGIN=https://obolos.app`. For local testing set APP_ORIGIN to the exact URL used in the browser, such as `http://localhost:3001`.

4. Apply migrations:

```sh
npm run db:migrate
```

The migration runner records checksums, serializes concurrent migrations with a transaction lock, and rolls back failures. It never prints the database URL. Do not edit a migration after applying it; add a new numbered migration.

5. Restart the app, visit `/login`, connect an installed EVM wallet and sign the identity message. This first version supports ordinary EOA wallets through EIP-6963 or the injected provider. On a phone use your wallet's in-app browser. WalletConnect QR and contract-wallet sign-in are not implemented in this preview.

## Create an agent and credential

Create an agent with a name, description and separate data/verification budgets. The form converts decimal inputs exactly into tinybars and micro-USDC. Current maximums are 1 HBAR and 1 test USDC per run.

Open the agent's API credentials, issue a named credential and copy the once-displayed `ob_test_` token. Credentials expire in 30 days, are scoped to one agent, and are stored only as hashes. Revoke them from the same panel. The developer guide has request examples.

Wallet login grants account access only. It never unlocks the operator broker. New agents have `setup_required` status, and run creation returns `409 RUNNER_REQUIRED` without a payment or a simulated job.

## Payment onboarding still required

The account/API preview is implemented; self-service payment execution is not complete. The pending architecture choice is an isolated user-owned runner versus platform-managed wallets. The recommended runner approach preserves the Circle Agent Stack CLI and Ledger Ring integration and keeps payment credentials with the user. A runner must verify its own signed mandate and journal immutable payment intents before execution is enabled.

Each Circle runner needs a distinct credential environment. Changing `CIRCLE_CLI_HOME` alone does not isolate OS keychain sessions. The operator's existing funded accounts are not available to newly connected identities. The unresolved historical Arc intent remains reserved and must not be retried during this migration.

## Verification performed

- Real PostgreSQL tests cover concurrent challenge replay, account isolation, credential scope/revocation/expiry, concurrent agent/key quotas and rejection of run requests without a runner.
- Signature tests use fresh test accounts; no funded wallet or payment is used.
- Desktop and phone browser checks cover landing, sign-in, workspace and developer pages. Mocked provider/API tests cover the browser handshake and credential controls and are not claimed as live Neon verification.

Run the PostgreSQL suite against a **dedicated test database**:

```sh
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55439/obolos_test npm test -- tests/platform-postgres.test.ts
```

The suite creates and drops its own random schema. It does not truncate production tables. Without TEST_DATABASE_URL the integration suite is skipped; the ordinary unit/route tests still run.

## Hosting boundary

The existing public deployment proxies this Mac through temporary HTTPS tunnels. Adding Neon does not make the payment broker or data service always-on. Native Vercel app deployment and a durable execution/data-service host are separate release work. Never place Circle sessions, Hedera keys, Ring secrets or inference keys in the Vercel frontend environment or in Neon.
