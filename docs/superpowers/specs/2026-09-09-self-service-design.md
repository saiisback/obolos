# Obolos self-service testnet product

## Scope and authority

The user authorized a landing page, wallet connection/login, user-owned agents, an API, Neon storage and testnet shipping. Existing instructions authorize implementation with subagents and committing/pushing to saiisback/obolos. Work stays in the canonical ETHONLINE checkout. Hackathon submission is outside this task.

## Product flow

`/` introduces bounded agent spending using the existing Foundation-inspired visual language. `/login` connects an EVM wallet and requests a domain-bound sign-in signature. `/app` lists the authenticated user's agents, lets them create an agent and issue/revoke scoped API credentials, and displays onboarding requirements and run status. `/developers` documents executable API examples. `/demo` retains the existing operator demonstration and its separate authorization.

Authentication proves control of an identity wallet. It never unlocks the existing operator broker or grants spending permission. The platform is testnet-only. Account ownership comes from the server session, never a request's user ID.

## Storage and authentication

Use Neon Postgres through parameterized queries, with versioned migrations. Store users, single-use sign-in challenges, hashed sessions, agents, hashed agent API credentials and jobs. Never store wallet private keys, Circle sessions, Ring passwords or inference provider secrets in Neon. A missing database produces a clear setup/unavailable response; no in-memory production fallback.

Wallet sign-in uses EIP-4361 messages bound to configured APP_ORIGIN, chain 5042002, the requested address, a cryptographic nonce, five-minute expiry and a browser challenge cookie. Signature verification consumes the nonce atomically, creates a revocable session and sets an HttpOnly, secure-in-production SameSite cookie. Reject wrong origin, expired challenge, replay and address mismatch. Session lifetime is seven days. Logout revokes the stored session. Signed-in routes return private no-store responses.

## Agent API contracts

Responses use JSON directly; failures use `{error: string, code: string}` with appropriate HTTP status. All new paths are separate from legacy `/api/runs`.

- `GET /api/account`: `{user: {id, address} | null, configured: boolean}`.
- `POST /api/auth/challenge` body `{address}`: `{message}` plus a challenge cookie.
- `POST /api/auth/verify` body `{signature}`: `{user}` plus a session cookie; the exact message is loaded from the challenge record.
- `POST /api/auth/logout`: `{ok: true}`.
- `GET /api/agents`: `{agents: Agent[]}`.
- `POST /api/agents` body `{name, description, dataBudgetAtomic, verificationBudgetAtomic}`: `{agent}`. Integer atomic budgets, maximum 1 HBAR and 1 test USDC per run. Creation sets status `setup_required`; it does not authorize spending.
- `GET /api/agents/:id/keys`: `{keys: ApiKeySummary[]}`.
- `POST /api/agents/:id/keys` body `{name}`: `{key, token}`. Token displayed only once, SHA-256 stored, expiry 30 days, scoped to one agent.
- `DELETE /api/agents/:id/keys/:keyId`: `{ok: true}`. Immediate revocation.
- `POST /api/v1/agents/:id/runs` with Bearer credential and Idempotency-Key, body `{repos: string[]}`: a persisted job only when payment prerequisites are satisfied; otherwise explicit 409 `RUNNER_REQUIRED`. Never silently use the operator wallet or fall back to simulation.
- `GET /api/v1/agents/:id/runs`: scoped jobs; `GET .../runs/:runId` only within the credential's agent.

`Agent` has `id`, `name`, `description`, `status`, `dataBudgetAtomic`, `verificationBudgetAtomic`, `createdAt`. `ApiKeySummary` has `id`, `name`, `prefix`, `createdAt`, `expiresAt`, `revokedAt`.

## Payment execution decision

Recommended: each workspace pairs an isolated outbound runner, with independent local mandate verification and durable payment intents. Circle CLI directories alone share keychain entries and are not tenant isolation. Hosted managed wallets are an alternative requiring different credentials and a defined custody model. The user's pending choice determines this part of onboarding; account, agent and API work is independent of that choice.

No new multi-tenant endpoint may call the global broker. Payment execution remains unavailable until a real isolated execution path, signed mandates, atomic budget reservations and receipt reconciliation are implemented and tested. Do not describe disabled execution as completed self-service support.

## Preservation and release

Preserve all legacy journals, run IDs, receipts, sessions and the unresolved Arc intent. No migration retries or clears it. Preserve the previous video-documentation corrections. Root reviews subagent code, tests signatures/ownership/token scoping and database transactions, checks desktop/mobile UI, and runs the existing suite/build before publishing. Live Neon verification requires DATABASE_URL. WalletConnect QR support, if included, requires a Reown project ID; injected wallets remain independently usable.

The public site currently proxies a Mac through temporary tunnels. Native Vercel hosting of the account product must retain a separate protected legacy demo/data-service route or clearly disclose its runtime dependency. A full end-to-end release also requires a fresh user-owned funded testnet run; no such run is claimed by UI-only checks.
