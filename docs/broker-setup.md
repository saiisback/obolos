# Trusted broker setup and reconciliation

The broker is a separate loopback HTTP process. Run it under a dedicated OS account with a private home/state directory and no agent shell access. The Next app receives only its bearer capability token and URL. A model receives repository evidence and can return report text; it never receives the token, bundle, shell, wallet tools or inference credentials. Key Ring protects stored secrets; decrypted values exist in the trusted broker’s memory. Processes with the broker account’s permissions can compromise that boundary. Merely starting two processes under the same unrestricted developer account is not OS isolation.

## Operator provisioning

Install project dependencies with `npm ci` in the private broker checkout. The repository pins the official `@ledgerhq/wallet-cli` 2.1.0 locally; a global install is not required. Use `./node_modules/.bin/wallet-cli` or add that checkout's `node_modules/.bin` to the operator shell PATH, and set `LEDGER_WALLET_CLI` to its absolute executable path. The private broker deployment must have its own installed dependencies. The operator, not an agent, provisions a password in an OS keychain and injects `WALLET_PASS` for ring operations. Connect/unlock a physical Ledger and run `wallet-cli genuine-check`. Use the **Ledger Sync** app for `wallet-cli ring init`; the separate mandate-signing flow below uses **Ethereum**. See the [Ring initialization implementation](https://github.com/LedgerHQ/ledger-live/blob/develop/apps/wallet-cli/src/commands/ring/init.ts). Do not use the unprotected ring option. Prepare a private, mode-0600 bundle with this structure, substituting actual credentials only outside the model workspace:

```json
{
  "inferenceApiKey": "operator-provided-key",
  "hedera": {
    "accountId": "0.0.123456",
    "privateKey": "operator-provided-testnet-key",
    "keyType": "der"
  }
}
```

Encrypt with `wallet-cli ring encrypt -i /private/secrets.json -o /private/agentgdp-secrets.enc --key agentgdp-broker`. Remove the plaintext provisioning file after securely recording any required recovery material. At runtime the broker uses `execFile` with `ring decrypt -i <file> --key <name>`; stdout is parsed in memory, and child errors/output are never logged or returned. Password injection, ring provisioning and device requirements follow [Ledger Wallet CLI documentation](https://developers.ledger.com/docs/ai-tools/ledger-cli).

Copy `.env.broker.example` to a private `.env.broker`. Pin the public data service URL, Hedera recipient (the adapter discovers the fee payer from the fixed Blocky402 HTTPS endpoint), plus inference HTTPS origin/model. Protect the file, Circle session directory and broker journal from other accounts. Inject the ring password only into the broker launch environment; never expose it to the Next process. Start with `npm run broker`. The listener binds `127.0.0.1:4319`; expose it remotely only through an authenticated private tunnel. `/health` also requires `Authorization: Bearer <BROKER_TOKEN>`.

For Circle, set `CIRCLE_CLI_HOME` to the private session directory in the operator shell, then run the installed binary’s `wallet login <email> --type agent --testnet` and complete the OTP yourself. This Agent Wallet CLI path uses its own authenticated session; it needs no Circle API key, developer-controlled-wallet entity secret or exported Circle signing key. List wallets with `wallet list --type agent --chain ARC-TESTNET --output json`. Pin the chosen address and a separately controlled verifier payee. Fund testnet USDC explicitly with `wallet fund --address <address> --chain ARC-TESTNET`. No login, faucet or payment runs automatically during installation. [Agent wallet quickstart](https://developers.circle.com/agent-stack/agent-wallets/quickstart)

## Payment and report behavior

Both purchase caps are integer principal units: tinybar (1e8/HBAR) and micro-USDC (1e6/USDC). Broker caps cover **all requests in the persisted journal**, including uncertain reservations. They do not reset when a process restarts or a new run ID is supplied. The app’s per-run approved maximum is a second, lower limit. The current verification contract is fixed at 50,000 micro-USDC (0.05 USDC): any other `ARC_VERIFICATION_FEE_ATOMIC` value disables Circle readiness and is rejected before a verification payment. Changing this fee requires a coordinated contract change, not an environment-only override. Network fees are separate operator expenses; these caps are not a guarantee on total wallet debit. Circle CLI does not expose a hard gas-fee cap for this transfer command. Do not represent the principal allowance as one.

The Arc adapter checks that the selected source is a Circle **agent** wallet, transfers explicitly designated Arc testnet USDC to the pinned verifier, and passes a stable UUID idempotency key. It validates the CLI’s echoed key, chain, source, destination and hash, then independently checks Arc chain ID 5042002, successful receipt status, and the canonical USDC `Transfer` event’s sender, recipient and exact amount. CLI output is narrowed to the public receipt; raw session, challenge and fee-debug objects are not returned. The command and JSON shape were checked against installed `@circle-fin/cli@1.0.0` help and source. [Circle command reference](https://developers.circle.com/agent-stack/circle-cli/command-reference)

The verifier service in this MVP is the broker’s deterministic verification capability. Its configured fee recipient earns a separate Arc payment for the job. It checks purchased-evidence integrity, canonical GitHub API sources, freshness and repository coverage. This is not an external third-party attestation or proof that every model sentence is correct. The journal binds the request body digest (including report), request ID and returned chain transaction to that job; the transfer itself does not place the report digest onchain.

`/data`, `/report` and `/verify` accept only their declared schemas. Both financial requests require an ISO `mandateExpiresAt`. The broker checks it on entry, after queueing, and immediately before the adapter call; Circle checks again after wallet preflight, immediately before launching its transfer command. Expiry blocks new submissions, but cannot cancel a transfer already handed to Circle or the network. Pending journal reservations remain conservative if expiry is detected after reservation; reconcile them rather than replacing the request ID. Reports must use that run’s previously purchased evidence. Verification requires the exact summary emitted by the scoped worker. The worker has a fixed provider/model, a bounded response, no tools, and cannot change payment configuration.

## Physical mandate approval

First derive and confirm the controller using the Ethereum app: run `wallet-cli account discover ethereum`, then `wallet-cli receive <returned-label>`, selecting the account that matches `LEDGER_DERIVATION_PATH` (default `44'/60'/0'/0/0`). Verify the address on the device before pinning `LEDGER_CONTROLLER_ADDRESS` in both the app’s configuration and the operator signing environment. Ring enrollment does not perform this pinning. Export the pending approval JSON from the app; it contains the **exact** `message` string, whose whitespace must be preserved. Connect the Ledger, open Ethereum, then run:

```sh
npm run ledger:approve -- /absolute/path/approval.json
```

The script displays the derived address on the device, compares it to the pinned controller, and asks the physical Ethereum app to sign the UTF-8 personal message. It locally verifies the returned signature before emitting JSON. Paste its signature into the run’s approval form; server verification also binds the saved nonce, run, expiry and proposed mandate. The script refuses rehearsal messages. After acceptance, the app retains the exact message, nonce, signer/signature, verification time and previous/approved mandates in `run.authorizations`; these records are included in the run export. Simulated approvals retain their mode but do not claim a Ledger signature.

This uses the official LedgerJS `hw-app-eth` and Node HID transport. Ledger labels LedgerJS legacy; migration to DMK is future work, not a claim of present DMK use. Hardware provenance comes from the demonstrated physical signing flow and pinned address, not from the ECDSA signature alone. A browser EOA signature is not labeled hardware. [Ledger message-signing documentation](https://developers.ledger.com/docs/device-interaction/dmk-ts/ledgerjs/beginner/personal-message)

## Interrupted payments

Before either financial call the broker atomically saves and fsyncs a pending intent. Concurrent capabilities serialize through one journal. Repeated identical settled requests return saved results; changed payloads, replacement stage IDs, reused transaction receipts and uncertain retries are rejected. Do not delete the journal or relaunch with a fresh state directory to retry a failed job.

After a crash, stop the broker and inspect its private journal alongside the Hedera adapter journal, Circle transaction history, and chain explorers. The Circle idempotency UUID can be recomputed from `sha256("agentgdp:arc:" + runId + ":" + requestId)` using the code in `circle.ts`. If a transfer settled, reconstruct and validate its receipt before any operator-managed state repair. If status cannot be proven, preserve the reservation and do not resubmit. There is intentionally no automatic repair endpoint. A stale `broker.lock` requires confirming the old process is gone and reconciling pending intents before removing the lock.

Local tests do not establish funded accounts, physical Ledger approval, a live Blocky402 request, or Arc settlement. Capture those external demonstrations separately before submission.

## Operator setup and read-only diagnostics

The [live setup guide](live-setup.md) maps all public values, private credentials and process locations. Connections provides authenticated read-only balance snapshots and links; `npm run preflight` inspects local configuration and paths without CLI execution, bundle decryption or network calls. Run the latter only in the private management context that already has access to the three environment files. Do not weaken process isolation to satisfy a diagnostic. Neither surface proves a live settlement or hardware demonstration.
