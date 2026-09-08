# Speculos development setup

Obolos supports an explicit emulator mode while retaining USB Ledger support. This uses actual Ledger Sync and Ethereum applications in Speculos, a disclosed adaptation of upstream `wallet-cli ring`, and Ledger's real staging trustchain service. It does not enable the mocked SDK. Emulator approvals are labeled in the console and exported proof; the signed mandate includes the emulator disclosure. Changing signer mode while an approval is pending invalidates that approval.

**Verified on September 8, 2026:** actual Sync and Ethereum APDU identity, staging challenge authentication, password-protected Ring enrollment, and an encrypt/decrypt round-trip using harmless test data. Tampered ciphertext, a wrong key domain and a wrong password all failed without creating plaintext output. See [Ring execution evidence](../tools/ledger-speculos/ring-evidence.json). A real Ethereum emulator personal-message signature also verified; its message explicitly authorized no payment or permission change. The actual broker credential bundle is still missing. These checks do not establish paid Hedera/Arc requests or bounty eligibility.

## Start

From the repository root, with Docker Desktop running and Bun installed:

```sh
npm ci
npm ci --prefix tools/ledger-speculos --ignore-scripts
npm run speculos:up
```

Open [Ledger Sync](http://127.0.0.1:5001) and [Ethereum](http://127.0.0.1:5002). Screens and buttons are served by the actual emulator. `npm run speculos:down` stops these containers; it preserves private identity and Ring state. Do not delete `data/speculos/device.seed` after enrollment. The bootstrap never uses Speculos's publicly known default seed for the configured app.

The [pinned applications and startup configuration](../tools/speculos/README.md) document hashes, sources, licenses and the private test seed. All emulator state is software-accessible on its host. Use test wallets and disposable, tightly scoped inference credentials only.

## Local configuration

Set `LEDGER_SIGNER_MODE=speculos` in both app `.env.local` and private `.env.broker`. Set these broker values to your absolute checkout paths:

```dotenv
LEDGER_WALLET_CLI=/absolute/obolos/tools/ledger-speculos/wallet-cli
LEDGER_SPECULOS_URL=http://127.0.0.1:5002
OBOLOS_SPECULOS_SYNC_URL=http://127.0.0.1:5001
OBOLOS_SPECULOS_STATE_DIR=/absolute/obolos/data/local-broker/speculos-ring
LEDGER_RING_FILE=/absolute/obolos/data/local-broker/obolos-speculos-secrets.enc
LEDGER_RING_KEY=obolos-broker
```

Pin the Ethereum emulator's derived address as `LEDGER_CONTROLLER_ADDRESS` in app and broker. Its path defaults to `44'/60'/0'/0/0`. This controller is separate from the funded Circle payer, Hedera payer and recipients. Never fund the emulator controller for this workflow. Root app type checking excludes the standalone Bun adapter; that tool has its own tests and lockfile.

## Password and enrollment

Choose the Ring password yourself; the assistant must not choose, see or type it. Store it in macOS Keychain using the terminal's hidden prompt:

```sh
security add-generic-password -a default -s obolos-speculos-ring-password -w
```

Then, from the project root:

```sh
WALLET_PASS=$(security find-generic-password -a default -s obolos-speculos-ring-password -w) npm run speculos:ring -- ring init --name obolos-speculos
```

The npm command loads `.env.broker` so enrollment and broker decryption use the same isolated state directory. Review the displayed prompts at http://127.0.0.1:5001. Use the right arrow to read and both buttons to confirm only the expected enrollment. Do not initialize twice; the adapter refuses existing Ring/member state. Keychain member credentials are encrypted with the supplied password and are isolated from the physical Wallet CLI namespace.

## Encrypt the broker bundle

Prepare a private JSON file locally, using the shape in [live setup](live-setup.md#4-provision-ledger-ring-with-the-sync-app). It contains the inference API key and Hedera payer account/private key/key encoding. Never send that file through chat or commit it.

```sh
WALLET_PASS=$(security find-generic-password -a default -s obolos-speculos-ring-password -w) npm run speculos:ring -- ring encrypt --key obolos-broker -i /absolute/private/secrets.json -o /absolute/obolos/data/local-broker/obolos-speculos-secrets.enc
```

Verify a round-trip into a private file, compare locally without printing contents, then remove temporary plaintext after verifying recovery arrangements. Use the same password injection for decryption. Never run decryption into a logged terminal. Restart the broker with its Ring password injected through the same Keychain lookup. Broker decryption forwards only the approved profile variables in explicit Speculos mode.

## Mandate approval

Create a live job and download its pending approval JSON. Run:

```sh
npm run ledger:approve -- /absolute/path/approval.json
```

Confirm the pinned address and read the exact message in the Ethereum emulator at port5002. Paste only the resulting signature into Obolos. The script does not autoapprove button prompts. It verifies the resulting signature before returning it. The backend still checks signer, nonce, expiry, mandate version and configured signer mode. Emulator labels are configuration disclosures; a signature alone cannot prove the device type.

## Remaining submission evidence

Hedera and Arc settlement use real testnets independently of the emulator. They still require a complete paid run, live HTTPS service and recorded receipts. Ledger's published bounty does not explicitly confirm emulator-only acceptance; ask [official support](https://t.me/LedgerETHGlobal). Keep the source adaptation, development attestation, software-held seed and staging service disclosed. Do not claim hardware-backed secret protection from Speculos.
