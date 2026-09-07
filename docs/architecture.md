# Architecture and trust model

The README contains the architecture diagram. This document explains what that diagram means.

## Actors and authority

The operator defines the mandate in the Next.js console and authenticates for live actions. The planner is deterministic orchestration using actual service quotes, allowed provider IDs, expiry and remaining purchase principal. The live worker calls a fixed OpenAI-compatible model with purchased evidence and no tools. The verifier is a deterministic paid capability that checks evidence integrity, sources, timestamps and coverage. It does not certify arbitrary model prose.

The broker uses Ledger Key Ring to decrypt its fixed secret bundle in memory. Ring enrollment uses the Ledger Sync app; subsequent runtime decryption uses the enrolled Ring state, password and network service. The bundle holds the inference credential and Hedera payer key. The broker owns Hedera signing and a separate Circle CLI agent-wallet session obtained by the operator through email OTP. Circle uses its own MPC signing infrastructure; its signing key is not part of the Ring bundle, and this CLI path does not use a Circle API key. The app can invoke narrow capabilities but has no raw wallet/provider keys; the model does not even receive the capability token. The broker journal binds the purchase to a run and prevents the caller from replacing a payment stage with another request ID. Global principal caps survive restarts. The app's allowed per-run amount cannot exceed those broker caps.

## Read-only setup and wallet visibility

`GET /api/live` combines broker health, safe service-health inspection, session-owned runs and authenticated broker `GET /wallets` snapshots. The browser never calls the broker directly. Without operator authentication, wallet snapshots, controller address and configured service URL are omitted. Public chain information is deliberately gated because these addresses belong to the operator's configured workspace.

The wallet capability reads only the fixed Hedera testnet mirror and canonical Arc testnet RPC. It checks account/chain/token precision and returns balance amounts as decimal strings, preserving integer precision. The UI formats HBAR with eight and USDC with six decimal places without floating-point conversion. It shows a source and check timestamp; the API uses the broker observation timestamp when present. Reads can lag or fail, and failed snapshots remain unavailable. Reading an Arc balance does not prove the Circle session can sign.

Connections shows wallets/recipients, copy/explorer actions, official resource links, setup checks and actual recorded live-evidence counts. Live-run counts include created live runs, not just completed work. Payment counts require live settled receipts with transaction IDs. Ledger counts require saved live signer/signature records. Hardware recording, public deployment and submission tasks stay explicit external actions; the UI does not infer them from configuration. `npm run preflight` is a read-only local setup diagnostic.

## Settlement

Hedera: fetch challenge from a pinned resource, validate x402 v2 exact network, native HBAR, fee payer from fixed Blocky402 endpoint, payee and amount. Persist intent, sign once, retry with the signed payload, require successful settlement tied to that transaction, and independently check mirror-node transfers. The service fetches GitHub evidence before settling so unavailable evidence is not charged.

Arc: select the configured Circle Agent Wallet on ARC-TESTNET, transfer canonical USDC to the verifier with a deterministic idempotency key, and independently verify chain, receipt success and the exact token transfer log. The report digest/request identity is bound in the broker journal; it is not claimed to be onchain metadata. No Nanopayments/Gateway batching is used in this MVP.

Only this settlement layer is on-chain. The model, orchestrator, deterministic verifier, broker, facilitator, Circle infrastructure and local store remain off-chain/trusted dependencies. Decentralized settlement does not make the whole application a decentralized agent runtime.

Both balances are funded independently. Display HBAR and USDC separately. Principal caps do not constrain network gas fees, and payment finality does not prove economic value.

## Human approval

A proposal includes run ID, mode, random nonce, five-minute expiry, previous version and complete next mandate. The downloaded JSON preserves its exact message bytes. The operator first derives and confirms the controller address on the device, then the script signs those bytes using the Ledger Ethereum app and the pinned derivation path; this is distinct from Sync-based Ring enrollment. The backend checks the signature against the pinned controller address, expiry and version, then consumes the pending request. After a successful approval, `run.authorizations` retains the message, nonce, verification timestamp, previous/approved mandates and, for live approvals, signer/signature. These records remain in the export after the pending request is consumed. Rehearsal uses a distinctly simulated approval without a claimed Ledger signature. An ECDSA signature alone does not prove hardware provenance; demonstrate the device and pin its account.

## Durable operation

One Next node process serializes run changes and atomically writes a local store. Before an action, a persisted in-flight marker makes an interrupted process fail closed on reload. One broker process serializes payments and fsyncs a pending intent before external side effects. Ambiguous operations preserve reservations and require manual reconciliation; they do not retry automatically. These are local-process guarantees, not a distributed execution architecture.

Audit events form a SHA-256 chain, useful for detecting accidental edits against a retained export. A trusted host could rewrite the entire chain or truncate it; no HCS/notarization or tamper-proof guarantee is claimed. Public chain receipts are independently inspectable.

## Deployment boundary

Run broker credentials under an isolated OS account or hardened container/private host. Two unrestricted processes under the same user are not isolation. The Next app is trusted to enforce user mandates; protecting against total app-host compromise would require a separate verified authorization layer in the broker. Compromise of the trusted broker exposes runtime plaintext and wallet authority. Emergency pause prevents future application actions but cannot undo settled transfers or stop an operation already submitted.

## Demonstration status

Implemented integration code and read-only setup checks do not establish actual funded payment, hardware provenance or sponsor qualification. Public HTTPS service/repository, actual Hedera/Arc receipts, physical device footage, tooling feedback and narrated video remain separate evidence gates in [submission.md](submission.md). Verification remains structural/source consistency, not independent validation of every generated statement.
