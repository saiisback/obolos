# Architecture and trust model

The README contains the architecture diagram. This document explains what that diagram means.

## Actors and authority

The operator defines the mandate in the Next.js console and authenticates for live actions. The planner is deterministic orchestration using actual service quotes, allowed provider IDs, expiry and remaining purchase principal. The live worker calls a fixed OpenAI-compatible model with purchased evidence and no tools. The verifier is a deterministic paid capability that checks evidence integrity, sources, timestamps and coverage. It does not certify arbitrary model prose.

The broker uses Ledger Key Ring to decrypt its fixed secret bundle in memory. It owns Hedera signing and the Circle CLI session. The app can invoke narrow capabilities but has no raw wallet/provider keys; the model does not even receive the capability token. The broker journal binds the purchase to a run and prevents the caller from replacing a payment stage with another request ID. Global principal caps survive restarts. The app's allowed per-run amount cannot exceed those broker caps.

## Settlement

Hedera: fetch challenge from a pinned resource, validate x402 v2 exact network, native HBAR, fee payer from fixed Blocky402 endpoint, payee and amount. Persist intent, sign once, retry with the signed payload, require successful settlement tied to that transaction, and independently check mirror-node transfers. The service fetches GitHub evidence before settling so unavailable evidence is not charged.

Arc: select the configured Circle Agent Wallet on ARC-TESTNET, transfer canonical USDC to the verifier with a deterministic idempotency key, and independently verify chain, receipt success and the exact token transfer log. The report digest/request identity is bound in the broker journal; it is not claimed to be onchain metadata. No Nanopayments/Gateway batching is used in this MVP.

Both balances are funded independently. Display HBAR and USDC separately. Principal caps do not constrain network gas fees, and payment finality does not prove economic value.

## Human approval

A proposal includes run ID, mode, random nonce, five-minute expiry, previous version and complete next mandate. The operator script signs its exact bytes on the Ledger Ethereum app. The backend checks the signature against the pinned controller address, expiry and version, then consumes the pending request. Rehearsal uses a distinctly simulated approval. An ECDSA signature alone does not prove hardware provenance; demonstrate the device and pin its account.

## Durable operation

One Next node process serializes run changes and atomically writes a local store. Before an action, a persisted in-flight marker makes an interrupted process fail closed on reload. One broker process serializes payments and fsyncs a pending intent before external side effects. Ambiguous operations preserve reservations and require manual reconciliation; they do not retry automatically. These are local-process guarantees, not a distributed execution architecture.

Audit events form a SHA-256 chain, useful for detecting accidental edits against a retained export. A trusted host could rewrite the entire chain or truncate it; no HCS/notarization or tamper-proof guarantee is claimed. Public chain receipts are independently inspectable.

## Deployment boundary

Run broker credentials under an isolated OS account or hardened container/private host. Two unrestricted processes under the same user are not isolation. The Next app is trusted to enforce user mandates; protecting against total app-host compromise would require a separate verified authorization layer in the broker. Compromise of the trusted broker exposes runtime plaintext and wallet authority. Emergency pause prevents future application actions but cannot undo settled transfers or stop an operation already submitted.
