# Obolos Ledger Speculos adapter

This is a **disclosed source adaptation of Ledger's `wallet-cli ring` commands**, not the stock published wallet-cli binary. It runs real Ledger Sync APDUs in Speculos and the real Ledger Key Ring Protocol SDK against Ledger's staging trustchain backend. It never enables `WALLET_CLI_MOCK`. It does not provide physical-device security or establish bounty eligibility.

## Provenance

`upstream.json` pins LedgerHQ/ledger-live commit `08be88be108394bf64ed0108dff9a53b8ffb14df`. The following upstream behavior is preserved: Ring member enrollment at application ID17, host member private-key encryption in the OS keychain, password PBKDF2, restored Ring key retrieval, scoped HKDF domains and AES-GCM ciphertext format.

The vendored command files `init.ts`, `encrypt.ts`, `decrypt.ts`, `shared.ts` replace only `@bunli/core` imports with a small command/options adapter. The vendored keychain replaces only state-dir discovery; the prompt's password-service help text is changed. Crypto, load-key-ring and secure-file implementations are unchanged. Runtime session/output/device/SDK adapters are explicitly local code. The Sync transport subclasses Ledger’s `@ledgerhq/hw-transport@6.35.5` and exchanges actual APDUs through Speculos `POST /apdu` using Node HTTP. It pins a loopback origin, disables redirects and environment proxies by construction, limits response size, validates response envelopes/status, and bounds each exchange to 120 seconds. It never presses emulator buttons or enables automatic approval. Session JSON and keychain service names are isolated from the stock CLI. `UPSTREAM-LICENSE` retains the Apache2 license. No stock CLI session is migrated or altered.

SDK dependency `@ledgerhq/ledger-key-ring-protocol@0.15.2` currently references a test-helper dependency chain ending in unpublished `@ledgerhq/live-dmk-speculos@0.10.0`. The isolated package override pins that unused helper `@ledgerhq/speculos-transport` to its last pre-DMK published version `0.2.15`; enrollment uses the disclosed local bounded HTTP APDU adapter, not that helper or its event-stream transport. The actual SDK is unchanged.

## Install and configure

Requires Bun and a running **Ledger Sync** Speculos app at `http://127.0.0.1:5001`. From this directory:

```sh
npm ci --ignore-scripts
./wallet-cli --help
bun test
```

`OBOLOS_SPECULOS_SYNC_URL` can select another loopback HTTP origin; remote origins are refused. `OBOLOS_SPECULOS_STATE_DIR` changes the private state location (default `~/.local/state/obolos-ledger-speculos`). Public session metadata binds the mode and staging URL. Private member credentials use OS-keychain service `obolos-ledger-speculos` and a state-path-derived account name. No chain private key or inference secret is persisted by enrollment itself.

Choose the password yourself using the hidden `ring init` prompt. For repeatable broker use, save it yourself in the macOS Keychain service `obolos-speculos-ring-password`, account `default`, then inject it as `WALLET_PASS` into the private process. Do not put it in source, terminal history or chat. Passwordless enrollment is explicitly disabled.

## Real authentication probe

```sh
bun src/probe-auth.ts
```

Review/approve the login request in the local emulator. Success means Ledger's staging backend accepted the real emulated Sync signature and test attestation. This probe creates no Ring/member credentials and never prints or persists its temporary token. It does **not** prove enrollment or encryption.

## Enrollment and broker-compatible crypto

```sh
./wallet-cli ring init --name obolos-speculos
```

After supplying your password, review the actual prompts in the emulator. This calls the unchanged upstream init handler, creates the member via the real SDK, signs the trustchain inside the emulated app, persists the encrypted member private key in the OS keychain and stores only public Ring metadata on disk.

Encrypt a locally prepared private bundle after successful enrollment:

```sh
./wallet-cli ring encrypt --key obolos-broker -i /absolute/private/secrets.json -o /absolute/private/obolos-secrets.enc
```

Broker-compatible decryption uses the same flags; plaintext goes to stdout when `-o` is absent. Run it only into the private broker or a private verification file, never into a logged terminal:

```sh
./wallet-cli ring decrypt --key obolos-broker -i /absolute/private/obolos-secrets.enc -o /absolute/private/verified-secrets.json
```

The parent project's `LEDGER_WALLET_CLI` can point at this executable only when the broker/UI explicitly indicate **Speculos development mode**. `LEDGER_RING_FILE`, `LEDGER_RING_KEY`, `WALLET_PASS`, and the same state-directory override must agree. This adapter is restricted to Ring init/encrypt/decrypt; hardware actions and Ethereum personal signing remain separate integrations.

## Limits

Use test accounts and bounded disposable provider credentials. An emulator has host-accessible seed material and a public development attestation; there is no secure-element isolation. Do not describe the result as genuine-device verification or hardware-backed security. The app's budget, signature and receipt checks remain necessary, but they cannot manufacture hardware provenance. Staging API availability is external; failures must remain failures rather than switching to a mock SDK.
