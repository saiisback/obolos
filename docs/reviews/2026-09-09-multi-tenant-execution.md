# Multi-tenant Obolos execution research

Checked September 9, 2026 (Asia/Kolkata). This is an architecture proposal, not an implemented onboarding flow. No wallets, sessions, payment intents, or deployments were changed.

## Recommendation

For the current hackathon implementation, retain Circle Agent Stack and Ledger Ring inside an isolated runner for each workspace. Make the website a multi-tenant control plane for accounts, agents, API credentials, mandates, jobs and receipts. Start with **user-owned runners** if the priority is preserving user-controlled secrets and existing code. A platform-hosted runner can offer smoother onboarding, but it is a separate operational commitment: the host acquires access to an authorized spending session, and tenant credentials must be isolated at the OS/secret-store boundary.

Wallet login to Obolos establishes identity; it does not authorize the backend to spend from that browser wallet, create a Circle session, or prove that wallet came from Ledger. Keep identity wallets, agent payment wallets, and mandate controllers as distinct bindings. Require explicit authorization for each binding and any spending mandate.

## What Circle officially supports

Circle Agent Wallets are operated through Circle CLI and use Circle's user-controlled MPC wallet infrastructure. This is the existing Obolos integration. A Circle Agent Stack session is not a generic WalletConnect session. [Agent Wallets](https://developers.circle.com/agent-stack/agent-wallets).

The supported CLI login flow accepts email OTP interactively or in two steps: `wallet login <email> --init --testnet`, then `wallet login --request <request-id> --otp <otp>`. Request IDs expire after ten minutes and are single-use; sessions last 28 days and are stored separately by environment. Login provisions agent wallets automatically. Therefore a supported hosted onboarding bridge can invoke the CLI in an isolated runner; it need not reverse-engineer Circle's proxy endpoints. The user must see and accept the applicable terms, and OTPs/session values must not enter logs or database records. [Agent authentication](https://developers.circle.com/agent-stack/agent-wallets/wallet-operations/authenticate).

Circle CLI spending-policy commands are **mainnet only**. Obolos must enforce testnet budgets itself; do not present testnet allowance values as Circle-enforced limits. [CLI command reference](https://developers.circle.com/agent-stack/circle-cli/command-reference).

Other Circle products are supported alternatives but change the execution model:

| Product | Relevant behavior | Impact on Obolos |
| --- | --- | --- |
| User-controlled Wallets Web SDK | App users authenticate with email/social/PIN and approve transactions | Good embedded wallet UX, but not a drop-in unattended replacement for the current CLI agent session. Requires a developer app configuration/API key. |
| Developer-controlled Wallets | Backend creates wallets and initiates transfers | Suitable for explicitly platform-managed agent wallets; requires a Circle API key and registered entity secret, a new payment adapter and clear custody disclosure. |

Sources: [user-controlled wallet onboarding](https://developers.circle.com/wallets/user-controlled/build-a-wallet-app), [wallet product selection](https://developers.circle.com/wallets/account-types), [developer-controlled quickstart with Arc testnet](https://developers.circle.com/wallets/dev-controlled/create-your-first-wallet). Switching to a different wallet product should not be assumed to satisfy the precise **Agent Stack** bounty requirement without checking the final integration against that wording.

## Important local-code constraints

1. **Separate CLI directories do not isolate keychain credentials.** Installed Circle CLI 1.0.0 changes file paths using `CIRCLE_CLI_HOME`, but keychain entries use service `circle-cli` and account `${profile}-session-${env}`; for example, `agent-session-testnet`. Multiple tenant logins sharing one OS keychain collide. Source: `node_modules/@circle-fin/cli/dist/index.js`, `keychainAccount`, `loadEnvSlot`, `sessionFile`. Use separate OS users/keychains or isolated runner environments with a deliberate protected secret store. A directory-per-tenant web worker is insufficient.
2. `src/lib/gateway.ts` uses one global `BROKER_URL`/`BROKER_TOKEN`. `services/broker.ts` caches one decrypted bundle and selects all payers, recipients, paths and limits from a process-wide environment. Do not mutate `process.env` per HTTP request. A distinct immutable runner context/process is required.
3. The current broker trusts its authorized application to supply the per-run mandate maximum. It independently enforces only its fixed provider/recipient/lifetime limits. A user-owned runner needs to validate the original signed mandate itself before accepting remote control-plane jobs; otherwise a compromised platform could bypass a user allowance within the runner's lifetime cap.
4. The app's current controller address/signer mode are process-global. Controllers must become workspace/agent bindings. Authentication by an ordinary browser wallet cannot be labeled physical Ledger approval; preserve `usb`, `speculos`, and any ordinary-wallet provenance separately.
5. Current journals serialize a single process and are durable local files. Moving app records to Neon does not itself make payment execution safe across workers. Keep one payment writer per runner and introduce transactional tenant budget reservations in the control plane.

## Proposed interfaces and boundaries

These are proposed contracts, not existing endpoints:

| Boundary | Required fields/behavior |
| --- | --- |
| `ExecutionContext` | Server-resolved `workspaceId`, `agentId`, `runnerId`, payment-wallet binding IDs, controller binding/version, execution mode. Never accept tenant identity solely from request JSON. |
| `PaymentIntent` | Immutable run/stage identity, asset/network, payer/payee, atomic principal, quote digest, mandate digest/version, expiry, stable idempotency key; states `reserved`, `submitted`, `settled`, `uncertain`, `failed_final`. |
| `RunnerJob` | Stable job ID and intent ID, narrow capability (`buy_evidence`, `generate_report`, `verify_report`), exact input digest, expiration, signed mandate and authorized controller binding. No arbitrary shell commands, URLs, private keys or provider tokens. |
| `RunnerResult` | Same job/intent/input binding, state, external transaction/challenge identifiers when available, validated receipts, sanitized failure phase/code. A receipt alone cannot transfer ownership of a run. |
| `Agent API credential` | Hashed token, workspace/agent scope, expiry/revocation, allowed capabilities and rate limits. It may request work inside an existing mandate; it cannot raise a mandate, replace a controller or expose runner secrets. |

Suggested API surfaces: authenticated `POST /api/agents`, `POST /api/agents/:id/runs`, `GET /api/runs/:id`, `POST /api/runs/:id/approvals`; scoped external `POST /api/v1/agents/:id/runs`; runner-only `POST /api/runner/jobs/claim` and `POST /api/runner/jobs/:id/result`. A runner should connect outbound, so user computers need no publicly exposed broker port.

Neon should hold ownership, public wallet bindings, controller bindings, agent settings, hashed API credentials, mandates, job reservations and safe evidence. Circle login sessions, Ring passwords, decrypted Hedera keys and inference credentials remain in the runner's protected store. Browser clients access an authenticated API, never a privileged database connection.

Job delivery is at least once; payment submission must remain at most once per intent. A lease expiring permits a **status query**, not automatic signing by a replacement worker. A unique `(workspace_id, run_id, stage)` constraint and atomic budget reservation prevent duplicate scheduling; the runner's durable journal prevents retransmission after an ambiguous network result. Keep infrastructure job retries separate from payment retries.

## Onboarding choices

**User-owned runner:** user signs into Obolos, creates an agent, pairs a runner using a short-lived single-use code, authenticates Circle locally, provisions Hedera/Ring locally, reports only public bindings and readiness, funds the displayed testnet addresses and signs a mandate. Existing payment adapters remain useful with tenant context added around them. Runner-offline and login-expired states must be visible; this is not an always-on hosted promise.

**Hosted isolated Agent Stack runner:** platform allocates a workspace sandbox with its own credential boundary, then uses documented two-step CLI login for that user's Circle email. User authorizes the session/mandate through the onboarding UI. Runtime reauthentication is required when the session expires. Ring enrollment/key storage remains a separate step; a shared platform Ring is platform-controlled security and must not be described as the user's Ledger. Do not host all user sessions under the current Mac keychain.

**Platform-managed wallets via Circle Developer APIs:** use the official developer-controlled SDK and registered entity secret inside a dedicated signing service, assign verified Circle wallet IDs to tenants, and fund per-agent wallets with explicit policy. The entity secret is scoped to the Circle account, not to each API key, so tenant isolation must be enforced by the broker as well as storage. [Entity-secret model](https://developers.circle.com/wallets/dev-controlled/entity-secret-management). This path requires new credentials and wallet/payment code, and is not the smallest preservation-first migration.

For Hedera, each private runner can retain the existing Ring-protected payer. A hosted per-user wallet path additionally needs supported account provisioning and a per-tenant protected Hedera key lifecycle; simply reusing the founder's payer would instead be an explicitly sponsored/shared-funds demo. Keep actual token ownership separate from application credit accounting.

## Migration and release gates

- Preserve the current founder workspace and its original run, request, journal and transaction IDs. Do not rename the legacy Circle idempotency namespace while importing records.
- Import run `61be389c-ab9a-4ea4-8b02-957aa4bd2b5e` verification as **uncertain/reserved 50,000 micro-USDC**, retaining key `3e3383b1-12ed-40a3-a54c-d46e3d4e5fdc`. Do not turn import into job execution, clear the reservation, or attach the earlier run's receipt. See the [reconciliation record](../evidence/2026-09-08-arc-reconciliation.md).
- Replace global app operator access with tenant authentication/authorization, while retaining a separate platform-admin role. Link legacy anonymous run owners explicitly; never assign every historical run to any newly connected wallet.
- Prove tenant A cannot read, change, sign for or spend from tenant B. Test concurrent reservation, duplicate delivery, expired mandates, revoked runner keys, controller rotation, session expiry and failure after an external submission.
- Before claiming self-service live support, complete one new user's funded end-to-end run using that user's selected execution model. Rehearsal remains clearly labeled until prerequisites are ready.
