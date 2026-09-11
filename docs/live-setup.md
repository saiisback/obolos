# Live setup: credentials, wallets and evidence

The live integrations are implemented. Completing this guide requires your own testnet accounts, an inference credential, a Ledger signer (physical hardware or explicitly configured Speculos) and a private broker host. This document is a procedure, not a record that provisioning, funding, signing or payment has happened.

For the current wallet-owned workspace, start with [account setup](self-service-setup.md), [the economy executor](economy/executor.md) and [live provider operation](economy/live-provider.md). The former Connections/operator dashboard has been retired. Historical rehearsal records are read-only; only actual configured providers can run new work. An unavailable balance or external assessment remains unavailable.

## 1. Gather the right values

Configure these locally. Public addresses can be recorded in your setup notes; credentials belong only in the stated private store. Do not paste secrets, OTPs, recovery phrases, a Ledger PIN or the Ring password into chat or the dashboard.

### Public addresses and ordinary configuration

| Value | Obtain it from | Configure it in |
|---|---|---|
| Hedera payer `accountId` | Your funded Hedera **testnet** account, in `0.0.N` form | `hedera.accountId` inside the encrypted broker bundle |
| `HEDERA_PAY_TO` | A separate testnet account that receives data-service payments | Evidence service and broker; the values must match |
| `CIRCLE_WALLET_ADDRESS` | Circle CLI's **agent** wallet list for `ARC-TESTNET` | Broker configuration |
| `ARC_VERIFIER_ADDRESS` | Your chosen separate Arc testnet verification recipient | Broker configuration |
| `LEDGER_CONTROLLER_ADDRESS` | The Ethereum address you confirm on the physical Ledger | App, broker and local signing environment; use the same address |
| `DATA_SERVICE_URL` | Local service during setup; its public HTTPS URL for submission | App and broker; match `DATA_SERVICE_PUBLIC_URL` in the service |
| `INFERENCE_BASE_URL`, `INFERENCE_MODEL` | Your supported OpenAI-compatible inference provider | Broker; the HTTPS base ends in `/v1` |
| `BROKER_URL` | Private loopback listener or authenticated private tunnel | App only; never expose the broker to the public internet |

The HBAR payer, Circle agent wallet, Ledger controller and two service recipients have distinct roles. A controller address does not identify the Circle wallet. Public addresses are not signing credentials.

### Private credentials and sessions

| Secret | Purpose | Storage and access |
|---|---|---|
| `SESSION_SECRET` | Signs application session cookies | App `.env.local` or app secret manager |
| `OPERATOR_TOKEN` | Authenticates the legacy private operator API | App secret configuration; normal workspace accounts use wallet sign-in |
| `BROKER_TOKEN` | Authenticates narrow app-to-broker capabilities | Same strong value in app and private broker configuration; never give it to the model/browser |
| `DATA_SERVICE_OPERATOR_TOKEN` | Allows changing your own service quotes for the live intervention demo | Same value in service and app; at least 24 random characters; optional for normal research |
| `inferenceApiKey` | Authorizes the fixed worker model call | Encrypted Ledger Ring bundle, decrypted only inside the broker |
| `hedera.privateKey` and `hedera.keyType` | Signs HBAR payments from the designated testnet payer | Same encrypted bundle; use the actual key encoding (`der`, `ecdsa` or `ed25519`) |
| `WALLET_PASS` | Unlocks the password-protected Ring | Operator OS keychain, injected into the broker process environment at launch; not a committed file |
| Circle authentication/session material | Authorizes the Circle agent wallet | Private Circle session/keychain under the broker OS account and `CIRCLE_CLI_HOME` |
| `GITHUB_TOKEN` | Optional public-metadata rate allowance | Evidence-service configuration only; no private-repository access is needed |

Generate independent app/operator/broker/service tokens locally, for example with `openssl rand -hex 32`; paste each output directly into its private configuration field. This project does **not** require a Circle API key, developer-controlled-wallet entity secret or an exported Circle private key. Its Circle path is CLI agent-wallet login with email OTP, using the resulting private session. [Circle agent-wallet quickstart](https://developers.circle.com/agent-stack/agent-wallets/quickstart)

## 2. Prepare the process boundary

Use Node.js 22.12+ and run `npm ci`. The project pins `@ledgerhq/wallet-cli` 2.1.0 and includes Circle CLI; a global Wallet CLI install is not required. A private broker deployment installs its own dependencies. Run the broker under a dedicated private OS account, with private state and session directories outside the agent workspace. Running the app and broker as unrestricted processes under the same user is not credential isolation.

The templates divide configuration by process:

- `.env.example` → app `.env.local`.
- `.env.services.example` → service `.env.services`.
- `.env.broker.example` → broker's private `.env.broker`.

For a local development bootstrap, run `npm run setup:local` before any of the three destination env files exist. It creates matching app/broker/service authentication tokens in mode `0600` files, preserves a valid existing application `session.key`, and fills installed CLI paths and ignored state directories under `data/local-broker`. It prints statuses only, refuses existing configuration without overwriting it, and rolls back its own files if setup fails. This same-user setup is **not OS credential isolation**. It does not create wallet keys, a Ring password, an encrypted bundle or Circle login; public addresses and provider credentials remain for you to configure locally using the steps below. Use the dedicated broker account procedure for private deployment.

The npm scripts load these exact filenames from their working directory. Under a separate broker account, use a private deployment checkout or a service manager that injects the broker environment. Restrict private directories to that account and configuration/bundle files to mode `0600`. Keep application, broker and evidence-service journals on durable volumes; do not reset them between demo takes.

## 3. Set up Hedera testnet accounts

Use the [Hedera developer portal and faucet](https://portal.hedera.com/) to obtain testnet HBAR for the payer. Select a separate numeric recipient for `HEDERA_PAY_TO`. Keep the payer's private key for the encrypted bundle in step 4; the public evidence service does not need it.

In `.env.services`, set `HEDERA_PAY_TO`, `DATA_SERVICE_PUBLIC_URL`, a persistent `DATA_SERVICE_DATA_DIR`, and the quote-management token. Use `http://127.0.0.1:4402` for local setup. Then start the service:

```sh
npm run data-service
```

Discovery and an unpaid HTTP 402 challenge can be inspected without transferring funds. For submission, deploy this service at its own public HTTPS URL and use that same URL in the app and broker. The service uses hosted Blocky402 on Hedera testnet. See [Hedera service setup](hedera-setup.md) and [Blocky402 testnet documentation](https://blocky402.com/docs/testnet/).

For the user-selected emulator route, follow [Speculos development setup](speculos-setup.md). The physical-device procedure below remains available; Speculos uses a separately disclosed source adapter, isolated identity and staging backend.

## 4. Provision Ledger Ring with the Sync app

Use the project-local official Wallet CLI under the broker/operator account. From that account's deployment checkout, either invoke `./node_modules/.bin/wallet-cli` directly or expose only that checkout's installed binaries for the following commands:

```sh
export PATH="$PWD/node_modules/.bin:$PATH"
wallet-cli --version
wallet-cli ring decrypt --help
```

Connect and unlock the physical Ledger, and run `wallet-cli genuine-check`. Ring provisioning uses the device's **Ledger Sync** app and the CLI's device prompts; it is separate from Ethereum personal-message signing. [Ring initialization source](https://github.com/LedgerHQ/ledger-live/blob/develop/apps/wallet-cli/src/commands/ring/init.ts)

Provision the Ring password yourself in your OS keychain. Inject `WALLET_PASS` using your local secret manager, then run:

```sh
wallet-cli ring init
```

Use the protected Ring flow. The official guide provides macOS Keychain and Linux Secret Service injection examples; do not put a literal password into commands or use the unprotected Ring option. Later encryption/decryption can run without the device but still relies on network access and the enrolled Ring state. [Ledger Wallet CLI setup](https://developers.ledger.com/docs/ai-tools/ledger-cli)

Create this JSON in a private temporary file outside the repository, replacing placeholders locally:

```json
{
  "inferenceApiKey": "YOUR_PRIVATE_INFERENCE_KEY",
  "hedera": {
    "accountId": "YOUR_NUMERIC_TESTNET_PAYER",
    "privateKey": "YOUR_PRIVATE_TESTNET_PAYER_KEY",
    "keyType": "der"
  }
}
```

With `WALLET_PASS` supplied privately, encrypt the file:

```sh
wallet-cli ring encrypt -i /absolute/private/secrets.json -o /absolute/private/obolos-secrets.enc --key obolos-broker
```

Set `LEDGER_RING_FILE`, `LEDGER_RING_KEY=obolos-broker` and `LEDGER_WALLET_CLI=/absolute/path/to/your-private-checkout/node_modules/.bin/wallet-cli` in the broker configuration. After verifying your encrypted copy and recovery arrangements, remove the temporary plaintext file. Do not print decrypted output as a diagnostic. At runtime the broker invokes Ring decryption and parses its output in memory; neither the app nor model receives the bundle.

## 5. Pin the Ledger controller using Ethereum

Switch the device to its **Ethereum** app. Discover its public accounts, then verify the intended address on the device:

```sh
wallet-cli account discover ethereum
wallet-cli receive YOUR_RETURNED_ACCOUNT_LABEL
```

Replace the label with the actual result. Select the account corresponding to `LEDGER_DERIVATION_PATH`; the approval script defaults to `44'/60'/0'/0/0`. Verify both account and path before copying the address into `LEDGER_CONTROLLER_ADDRESS` for the app and the broker/signing environment. This is a public address lookup and a later personal-message authorization; the script does not send an Ethereum transaction. [Ledger account and address commands](https://developers.ledger.com/docs/ai-tools/ledger-cli)

Ring enrollment does not automatically pin the controller. The controller authorizes larger mandates; the native HBAR payer and Circle wallet make the service payments.

## 6. Log in to the Circle agent wallet yourself

Use the installed Circle CLI under the broker OS account. Set `CIRCLE_CLI_HOME` to the same private absolute directory that the broker will use. From the deployment checkout:

```sh
./node_modules/.bin/circle wallet login YOUR_EMAIL --type agent --testnet
./node_modules/.bin/circle wallet list --type agent --chain ARC-TESTNET --output json
```

Complete any first-use terms and the email OTP prompt yourself. Use testnet explicitly; mainnet and testnet sessions are separate. Login provisions agent wallets, so this path does not need a separate local-wallet creation/import command. Record the returned Arc agent address as `CIRCLE_WALLET_ADDRESS`. Pin `CIRCLE_CLI` to this installed executable and choose `ARC_VERIFIER_ADDRESS` separately. [Circle CLI commands](https://developers.circle.com/agent-stack/circle-cli/command-reference)

Fund the chosen wallet with testnet USDC using the official [Circle faucet](https://faucet.circle.com/) or its CLI faucet command, which you execute yourself:

```sh
./node_modules/.bin/circle wallet fund --address YOUR_PUBLIC_AGENT_ADDRESS --chain ARC-TESTNET
```

Use the [Arc connection details](https://docs.arc.io/arc/references/connect-to-arc) when checking the network. The implementation pins Arc testnet chain ID `5042002` and canonical USDC `0x3600000000000000000000000000000000000000`, using six decimal places for ERC-20 transfers and balances. HBAR uses eight decimal places. Fund enough for purchase principal and network fees; a positive balance alone does not establish that a complete run can finish.

The Ring bundle does not contain Circle's private signing key. Circle Agent Wallet uses its own MPC infrastructure and the broker's authenticated CLI session; Ledger does not sign the Circle transfer.

### Circle device registration errors

If wallet listing works but creation returns `Provided device ID is not found in the system`, listing alone has not verified signing readiness. The installed CLI uses the saved device ID when executing signing challenges; a fresh email login creates a new device registration. Reauthenticate using the same `CIRCLE_CLI_HOME`, email and `--testnet`, enter the OTP privately in the terminal, then list wallets before retrying creation. Preserve the existing wallet and funding. This is a recovery step to test, not a guarantee that a backend error is resolved.

### GPT-5 nano compatibility

The report worker supports `gpt-5-nano` and its dated snapshots using `max_completion_tokens=1000` and `reasoning_effort=minimal`. Other configured models retain the existing `max_tokens=1000` request. A live OpenAI probe on September 8, 2026 rejected the old nano request with `unsupported_parameter` for `max_tokens`; the compatible request returned HTTP 200 with nonempty text. Broker HTTP regression tests cover nano and the existing non-nano request. Model listing alone does not prove generation quota; this check included a small generation request.

## 7. Start the broker and app

Finish the private broker configuration: inference origin/model, service URL, recipients, controller address, Circle CLI/session paths and persistent `BROKER_DATA_DIR`. Keep `ARC_VERIFICATION_FEE_ATOMIC=50000` (0.05 USDC), which is the current fixed verification contract. Set broker lifetime principal caps deliberately: defaults are 10,000,000 tinybar (0.1 HBAR) and 1,000,000 micro-USDC (1 USDC). They apply across the complete retained journal, not per run.

Inject `WALLET_PASS` from the local keychain into the broker launch environment and run:

```sh
npm run broker
```

Configure the app's `.env.local` with the public controller/service values, private broker connection and app tokens. Use the exact `APP_ORIGIN` in the browser; enable `COOKIE_SECURE=true` behind public HTTPS. In the app process:

```sh
npm run dev
```

Open `/app` and sign in with the owning wallet. Inspect the agent’s runner connection and mandate, the economy’s finalized receipts and freshness, and the provider health endpoint. Broker availability, wallet funding and external submission evidence are separate checks. The application never asks for a seed phrase or private key.

Run `npm run preflight` from a **trusted operator setup context**. It inspects `.env.local`, `.env.broker` and `.env.services` in its working directory, validates field relationships and configured executable/file presence, and reports names/statuses without secret values. It does not execute a CLI, open the encrypted bundle, call the network or sign/pay. It checks only whether `WALLET_PASS` is present in that process environment, never its value or ability to decrypt.

This diagnostic expects access to all three configuration files. In a properly isolated deployment, the app account should not have that access. Do not copy broker files or inject its password into the app/model account to make the checker green; run it from the already-authorized private management context. Its static result cannot confirm Circle login, sufficient funding, service reachability or hardware use. Use the authenticated runner status and provider health checks, and resolve each missing prerequisite separately.

## 8. Produce real execution and authorization evidence

Use [account setup](self-service-setup.md) to create an agent, pair its private runner, sign a bounded mandate and request real research. For contract service purchases, use [the reusable economy executor](economy/executor.md) with an existing owner-authorized agent and exact published service definition. An expensive quote must stop before payment; it must never trigger automatic spending approval.

Global economy policy changes use `npm run economy:policy -- <private-action.json> --execute-testnet`. Review the exact limits, then verify the pinned address and digest on the Ledger or Speculos display. The same signed action and Circle operation journal must survive retries. A signature alone does not establish physical device provenance; disclose Speculos when used.

Inspect actual receipts and source timestamps in `/app/evidence` and `/app/economy`. Match amounts, recipients and networks in [HashScan testnet](https://hashscan.io/testnet) and [ArcScan testnet](https://testnet.arcscan.app/). The economy records separate seller delivery and buyer acknowledgment; independent quality and economic value require their own authentic evidence. No simulated receipt qualifies as live evidence.

## 9. Finish the external submission package

The [public repository](https://github.com/saiisback/obolos) is published. The public service URL, actual paid Hedera and Arc receipts, physical device demonstration, developer-experience feedback and narrated video are still external completion gates. Follow the [submission matrix](submission.md), [demo script](demo-script.md) and [presentation outline](presentation.md). Configuration is not qualification.

Settlement occurs on Hedera and Arc. The model, deterministic orchestration, broker, facilitator, Circle infrastructure and local audit store remain off-chain/trusted dependencies. No fully decentralized agent runtime, bridge, atomic cross-chain settlement or tamper-proof local history is claimed.

Preserve the prior-work disclosure: the September 3 PDF predates the event, and whether it affects the intended new-project track is an organizer decision. Do not silently relabel that work as new.
