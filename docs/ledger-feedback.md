# Ledger Agent Stack developer feedback

Prepared September 8, 2026 for the Obolos ETHOnline submission. This records actual local development and staging execution. It is a draft for operator review; no message has been sent to Ledger or the event organizers.

## Environment and implementation

- macOS on Apple Silicon, Docker-hosted Speculos, two loopback-only emulator endpoints for Sync and Ethereum.
- Official Ledger Sync 1.2.2 Nano S+ API26 and Ethereum 1.22.3 application binaries; upstream sources and checksums are retained in [the emulator manifest](../tools/speculos/README.md).
- Official `@ledgerhq/wallet-cli` 2.1.0 was installed and its version/help validated. The exercised Ring path is a **source adapter**, not the unmodified published binary.
- The adapter preserves the upstream Ring command and crypto implementation from ledger-live commit `08be88be108394bf64ed0108dff9a53b8ffb14df`; [its manifest](../tools/ledger-speculos/upstream.json) identifies the files. Transport/session/output integration is adapted for Speculos and isolated state.
- Real Ledger staging trustchain service, application ID17, SDK `@ledgerhq/ledger-key-ring-protocol` 0.15.2. The mocked SDK is disabled. Speculos uses the official development attestation.
- Test seed stored privately in ignored local state, reused across restarts. This is software-held material, not hardware-backed protection.

## What we executed

1. Read actual application identity over APDU and authenticate a staging challenge through Sync.
2. Review the Sync “Connect” and “Turn on sync” prompts, then enroll a password-protected Ring. Member credentials are password-wrapped in macOS Keychain.
3. Encrypt and decrypt harmless test data using the named `obolos-broker` domain. The result matched exactly. Tampered ciphertext, wrong domain and wrong password were rejected without writing plaintext output.
4. Derive the separate Ethereum controller and sign a harmless personal message; verify the signature against the configured address. The test message authorized no payment or permission change.
5. Encrypt the actual broker bundle and decrypt it inside the trusted broker for the [completed Hedera/Arc paid workflow](evidence/2026-09-08-first-paid-run.md). The model never receives the inference key or Hedera payer key.

Evidence: [Ring execution](../tools/ledger-speculos/ring-evidence.json), [Ethereum signing](../tools/speculos/signing-evidence.json), [paid workflow](evidence/2026-09-08-first-paid-run.md). Evidence files are dated checkpoints; later execution does not change what an earlier checkpoint established.

6. After explicit user authorization in chat, the assistant reviewed and operated the Speculos controller to sign a real price-increase mandate. The backend accepted version 2 and the resumed Hedera purchase settled 0.008 HBAR. The subsequent Arc verification transfer became uncertain, so that run is partial and must be reconciled before retry. [Signature and partial-execution evidence](evidence/2026-09-08-approved-price-increase.md).

## Actionable developer experience feedback

| Observation | Impact on this build | Suggested improvement |
|---|---|---|
| The published Wallet CLI path we inspected assumes USB/HID; the upstream Ring SDK has a usable staging/Speculos route. | We maintained a disclosed source adapter to exercise the required Ring protocol without a device. | Document an official `wallet-cli ring` Speculos profile, including approved staging URL, application ID and development attestation expectations. |
| Ring enrollment and subsequent decryption have different device/runtime requirements. | It was easy to conflate a device signing every action with one-time Ring enrollment and later broker decryption. | Provide a complete encrypted bundle → isolated broker → scoped capability example, with plaintext and authority boundaries labeled. |
| The tested Sync binary came from a pinned CI artifact; temporary artifact availability complicates reproduction. | We retained the unmodified ELF, digest, source commit and license. | Publish versioned Sync emulator binaries with API level, checksums and a compatible Speculos image. |
| A dependency helper in the SDK tree referred to an unavailable version during setup. | The adapter required a pinned dependency override for the unused helper while preserving the actual SDK. | Add a clean-install CI check for the documented emulator example and publish a known compatible lockfile. See the adapter lockfile and setup notes for our concrete dependency selection. |
| Resetting an emulator seed changes the enrolled identity. | We implemented private seed creation once, reuse, permission checks and refusal to silently replace corrupt state. | Make identity persistence and recovery/reset consequences explicit in the quickstart; distinguish emulator seed from real wallet recovery material. |
| Long application mandates require careful message review. | The app retains the exact message, both mandate versions, nonce, expiry, signer and signature; emulator provenance is disclosed inside the message. | Offer a reference for readable structured approval of provider, price ceiling, currency budgets and expiry. Physical-device readability remains untested in this project. |

## Exact sponsor question — ready to send

> We are building Obolos for ETHOnline's AI Agents x Ledger track. Our required Ring integration uses a disclosed source adaptation of `wallet-cli ring` from LedgerHQ/ledger-live commit `08be88be108394bf64ed0108dff9a53b8ffb14df`, with the real Ledger Key Ring SDK and staging trustchain service (application ID17). Official Ledger Sync and Ethereum apps run in Speculos. We have executed enrollment, encryption/decryption, negative checks, and a real Hedera/Arc testnet workflow using the Ring-encrypted broker bundle. The demo clearly labels software emulation; we do not claim physical-device security. Does this Speculos + source-adapter implementation qualify for the bounty's Ledger Agent Stack / `wallet-cli ring` requirement, or must we also demonstrate the unmodified CLI and/or a physical Ledger device? If an official supported emulator setup is preferred, please point us to it. Our repo and reproducible evidence: https://github.com/saiisback/obolos.

Send through the [official Ledger ETHGlobal support channel](https://t.me/LedgerETHGlobal) only after operator approval. Record the actual response and its date before changing eligibility status. Silence, functional tests, and a successful signature are not sponsor approval.

## Separate organizer question

> We disclosed a September 3, 2026 concept paper, before the event began, and built the submitted Obolos implementation during ETHOnline. Can you confirm whether the disclosed prior conceptual work is consistent with the event's “start something new” eligibility rule? We can provide the original paper, implementation history and AI-assistance disclosure.

The team must obtain an organizer determination; this document does not infer eligibility from code completion.
