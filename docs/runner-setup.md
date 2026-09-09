# Pair a private isolated runner

The deployed application queues work and stores results. A runner on your own computer executes signed jobs through your existing local broker. It opens outbound connections only; no public broker port, hosted wallet secret, or incoming tunnel is needed. Keep the broker, its Ledger Key Ring bundle, Circle session, and all wallet/provider credentials on that computer.

Use one runner process and a separate durable directory for each agent. Do not copy a runner directory to another computer or run cloned directories concurrently: a local journal cannot coordinate independent machines. Keep the directory and its backups private and never delete it to reset a signed mandate's run allowance.

## Prepare your own broker first

Using the hosted workspace does not require your own Vercel account, Neon database, `.env.local`, or local web server. You do need a private local checkout, your own Hedera testnet payer, your own Circle Arc testnet agent-wallet session, an inference-provider credential, and a provisioned Ledger Key Ring. A browser wallet used for account sign-in does not provision any of these payment capabilities.

1. Install Node.js 22.12 or newer, clone [the repository](https://github.com/saiisback/obolos), and run `npm ci` in the checkout. Use a private OS account/environment for your broker and wallet sessions. Separate folders alone do not isolate OS keychains. The installed dependencies include the Wallet CLI, Circle CLI and `tsx`.
2. Copy the examples in that checkout, preserving any existing private configuration:

```sh
umask 077
cp -n .env.broker.example .env.broker
cp -n .env.runner.example .env.runner
chmod 600 .env.broker .env.runner
```

Edit the files locally. Generate a new random `BROKER_TOKEN` for your own broker and keep it only in `.env.broker`; the runner command reads that same file. Do not copy a demo operator's token, wallet, Circle session or retained journal. Keep `BROKER_PORT=4319` aligned with the runner's `BROKER_URL=http://127.0.0.1:4319`.

3. Follow [live setup: Hedera testnet accounts](live-setup.md#3-set-up-hedera-testnet-accounts) to create and fund your payer, and [Ledger Ring provisioning](live-setup.md#4-provision-ledger-ring-with-the-sync-app) to encrypt your payer key and inference key. Set your own absolute `LEDGER_WALLET_CLI`, `LEDGER_RING_FILE` and private state paths in `.env.broker`. Set `INFERENCE_BASE_URL` and `INFERENCE_MODEL` for your credential. Physical enrollment uses the Ledger Sync app. The separately disclosed [Speculos development procedure](speculos-setup.md) requires its own emulator dependencies and does not establish physical-device use.
4. Follow [Circle login and funding](live-setup.md#6-log-in-to-the-circle-agent-wallet-yourself) under the broker account. Export the same private `CIRCLE_CLI_HOME` while logging in that the broker configuration uses; complete the email OTP yourself. Pin your returned Arc **agent** wallet as `CIRCLE_WALLET_ADDRESS`, choose the verification recipient as `ARC_VERIFIER_ADDRESS`, and fund testnet USDC. Keep `ARC_VERIFICATION_FEE_ATOMIC=50000`, the fixed 0.05-USDC verification principal. The browser owner EOA, Hedera payer and Circle wallet have separate roles and can have different addresses.
5. To buy from the hosted service, set `DATA_SERVICE_URL=https://obolos.app/x402` in **both** `.env.broker` and `.env.runner`. The broker example initially points to a local service; replace that value. Obtain and inspect the hosted service's public recipient and current quote with this unpaid request:

```sh
curl --fail-with-body --silent --show-error \
  https://obolos.app/x402/quote \
  -H 'Content-Type: application/json' \
  --data '{"providerId":"repo-standard","repos":["octocat/Hello-World"]}'
```

Copy the response's public `payTo` into `HEDERA_PAY_TO` in `.env.broker` after reviewing the intended service recipient. It must match the hosted service, not an arbitrary address of your own. Confirm `network` is `hedera:testnet`, `asset` is `HBAR`, and review the atomic amount. This quote endpoint does not purchase evidence or transfer funds. If it is unavailable, wait for the service to recover; do not guess the recipient. You do not need to start `npm run data-service` or configure `.env.services` when using the hosted service.

6. Choose broker lifetime principal caps deliberately. `BROKER_MAX_DATA_ATOMIC` and `BROKER_MAX_USDC_ATOMIC` cover every reservation in that broker's retained journal; the signed per-run allowance is an additional limit. Network fees and inference-provider charges are separate. Keep `BROKER_ALLOWED_PROVIDERS=repo-standard,repo-economy`, and use durable private paths for `BROKER_DATA_DIR`, the Ring bundle and Circle session. Inject `WALLET_PASS` from your local secret manager into the **broker launch** environment, then start `npm run broker` in its own terminal. Do not inject the Ring password into the runner terminal.

The detailed [broker guide](broker-setup.md) covers private provisioning and uncertain-payment reconciliation. Its legacy operator-console approval flow is separate from this guide's owner-signed runner mandate; you do not need an operator token or `/demo` to pair a self-service runner.

## Pairing

1. Sign in with your owner wallet, create an agent, and choose **Pair a runner**. Copy the agent UUID and the one-time runner token. An API key is a separate credential and cannot pair a runner or change a mandate.
2. Save only the raw runner token in a private file using your local editor. For example, first create the directory and empty file (these commands contain no token):

```sh
mkdir -p "$HOME/.local/share/obolos/my-agent"
chmod 700 "$HOME/.local/share/obolos/my-agent"
(umask 077; touch "$HOME/.local/share/obolos/my-agent/runner.token")
chmod 600 "$HOME/.local/share/obolos/my-agent/runner.token"
```

Open that file in your editor and paste only the once-displayed token. Use a different directory for every agent. Do not put the token in shell arguments, source control, chat, or browser URLs. The runner rejects symlink token files, other owners, and group/world-readable permissions.
3. Fill the copied `.env.runner` template using your real values. Replace every placeholder, and write full absolute paths; do not use `~` or shell variables inside the env file:

```dotenv
RUNNER_PLATFORM_URL=https://obolos.app
RUNNER_AGENT_ID=YOUR_AGENT_UUID
RUNNER_OWNER_ADDRESS=YOUR_OWNER_EOA_ADDRESS
RUNNER_TOKEN_FILE=/absolute/private/path/agent-runner.token
RUNNER_DATA_DIR=/absolute/private/path/agent-runner-state
BROKER_URL=http://127.0.0.1:4319
DATA_SERVICE_URL=https://obolos.app/x402
```

The owner address must be the wallet you independently intend to authorize spending. Do not derive it from a claimed job. The platform origin, owner address, and agent ID are all pinned locally and every signed mandate must match all three. HTTPS is required for a public platform; HTTP is accepted only for loopback development. The broker must use loopback HTTP. The configured data-service URL is the only discovery endpoint; provider-supplied destinations are ignored.

4. With your own configured broker running, use a second terminal in the same private checkout. Ensure `RUNNER_DATA_DIR` is distinct from `BROKER_DATA_DIR`, and run:

```sh
npm run agent:runner
```

The command loads `.env.broker` and `.env.runner` and starts `services/agent-runner.ts`. Node.js with `tsx`, the repository dependencies, and the existing broker's wallet integrations must be installed. A locked Key Ring or unavailable Circle session may leave broker health unready; the runner will wait without claiming a job. Normal operation emits only generic state messages; private configuration and credentials are never logged. Remove conflicting exported configuration from your shell before launch: existing process environment variables take precedence over env-file values. Keep both terminals running while jobs execute, and wait for the workspace to show a recent runner heartbeat before requesting work.

5. In the agent setup panel, prepare the spending mandate, inspect its exact message, and sign with your owner wallet. The message binds the platform, agent, mandate nonce, repositories, providers, per-repository price cap, separate per-run HBAR/USDC caps, maximum run count, derived total allowances, and expiry. It authorizes Hedera and Arc **testnet** execution only, for at most 24 hours and 10 runs. Queue a job only after you have checked these limits and the available testnet funds.

A normal wallet signature proves control of that owner address; it does **not** prove a physical Ledger was used. The broker's Ledger Key Ring integration remains local. Hardware provenance requires separate evidence and is never inferred from pairing or an owner signature.

## Delivery and recovery

Before claiming, the runner authenticates to the pinned local broker and requires a ready health response. It independently checks the job's signature, local pins, exact repository scope, expiry and signed limits before work. Every data purchase, inference request and verification rechecks the scope and expiry, then asks the platform for fresh authorization. Network failure, a revoked token, a revoked mandate, or a rejected job stops the next capability before submission. The runner rechecks the signed expiry again after this round trip. It uses the queued job UUID as the engine run ID, so broker request identities remain stable. No remote job can provide commands, a broker URL, a discovery URL, or credentials.

The runner exclusively creates `runner.lock`, then writes and fsyncs its journal and containing directory before execution. Each engine stage is saved durably. Reservations consume the mandate's local run count permanently, including interrupted or failed jobs. Reusing a job ID with changed parameters or a mandate nonce with changed signed contents fails closed.

Completed, failed and approval-blocked results remain in the journal until the platform acknowledges delivery. Upload retries resend only the saved result, including the original receipts and evidence; they do not rerun any operation. Results and receipts stay in the local journal after acknowledgment for reconciliation. The platform labels uploaded receipts as runner-confirmed unless it independently verifies them on chain.

If a quote rises above the signed allowance, the runner stops with `awaiting_approval`. It never approves the engine's proposed increase. Inspect the blocked job and sign a new mandate before creating a new job.

Use Ctrl-C or SIGTERM for a normal stop. A hard crash deliberately leaves `runner.lock`. Before removing that lock, verify that its recorded PID and every runner using that directory have stopped, inspect the local broker journal for unresolved intents, and preserve a private backup of the runner and broker journals. Only after this manual reconciliation, remove **only** the stale `runner.lock` and restart. Never remove or edit `journal.json` to bypass an uncertain payment or run limit.

On reopening, every durable `started` entry becomes a failed result explicitly marked **uncertain**, preserving all saved evidence and receipts. The runner uploads that result and will never execute the job again. A broker call may have settled between its own journal write and the runner's next checkpoint; inspect the broker journal and chain records for that gap. A lost claim response can also leave a claimed job without a local journal entry. The platform never automatically requeues claimed jobs; these cases require manual reconciliation.

Revoking the runner token stops future claims, capability authorization checks and result uploads once the server observes revocation. The runner requires fresh platform authorization before every paid capability. A payment already submitted cannot be cancelled by revocation, and a narrow race remains between a successful authorization response and broker submission. Stop the local runner to halt its next capability immediately. Offline or rejected result delivery stays pending locally. Re-pairing issues a new private token and requires restarting with that token file.

## Local verification

```sh
npm test -- tests/runner-journal.test.ts tests/runner-execution.test.ts tests/runner-transport.test.ts
npm run typecheck
```

These tests use temporary private directories, generated fixture signatures and fake gateways. They prove local scope enforcement, receipt retention, no re-execution after interruption, durable run counts, loopback binding, token isolation, and readiness gating. They do not spend funds or establish real testnet settlement. A dedicated, separately authorized limited testnet run is still required to verify the deployed system end to end.
