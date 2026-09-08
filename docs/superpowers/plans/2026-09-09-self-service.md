# Obolos self-service implementation plan

**Goal:** Deliver wallet-authenticated account and agent onboarding backed by Neon, then connect the selected isolated testnet execution model.

**Architecture:** A Next.js control plane owns identity, agent settings and scoped credentials. Payment credentials and signing remain outside the web process. Legacy demo records and payment journals retain their original identities.

**Tech stack:** Next.js 16.3.4, TypeScript, viem, Neon Postgres, native CSS.

**Spec:** ../specs/2026-09-09-self-service-design.md

## Constraints

- Work in canonical ETHONLINE checkout on codex/obolos.
- Foundation-inspired black/white UI, orange actions, existing original flat artwork.
- No shared operator-wallet access from new accounts; testnet only.
- No payment retries or hackathon submission actions.
- Missing external configuration must remain visible and fail closed.

## 1. Account storage and wallet authentication

- [ ] Root: create `db/migrations/001_accounts.sql`, `src/lib/platform/db.ts`, auth/domain helpers and new auth/account routes.
- [ ] Write signature tests before implementation: wrong wallet, wrong domain, expired message, browser binding and replay; use generated test accounts, no real wallet funds.
- [ ] Verify parameterized SQL, one-use challenge consumption and revocable hashed sessions against local Postgres if Neon is not configured. Add migration command that never logs DATABASE_URL.
- [ ] Test missing DB/configuration responses; no anonymous-session promotion or operator-cookie changes.

## 2. Landing page and authenticated workspace

- [ ] UI subagent: implement `/`, `/login`, `/app`, `/developers`, `/demo` and scoped CSS; use the API contracts in the spec.
- [ ] Connect a discovered injected wallet via EIP-6963, request accounts, obtain challenge, sign exact message and verify through backend. Surface user rejection and configuration errors.
- [ ] Agent creation, once-only credential display/copy and revoke call real API routes. Loading, empty, disconnected and unavailable states are distinct.
- [ ] Root reviews desktop/mobile renders and checks keyboard flow and absence of invented claims.

## 3. Agent persistence and scoped API

- [ ] Backend subagent: add agent/key tables and parameterized ownership queries, validations and agent/API routes based on shared auth interfaces.
- [ ] Write tests proving tenant A cannot list, mutate or issue keys for B; revoked/expired/wrong-agent tokens cannot use API; integer budgets reject invalid values.
- [ ] Run requests without configured authorized execution must return RUNNER_REQUIRED with no broker call and no payment intent.
- [ ] Root verifies DB-backed ownership and revocation with two test identities.

## 4. Testnet execution and release

- [ ] Resolve pending runner/custody choice and Neon access; implement the selected adapter with independently checked mandates and immutable intent IDs.
- [ ] Test duplicate jobs, expired/revoked authority, concurrent budget reservation and uncertain external submission without retransmission.
- [ ] Run existing tests/typecheck/build and independent review; fix blocking findings.
- [ ] Commit and push reviewed changes, configure live Neon and deploy only the verified surfaces; complete a funded end-to-end run under the correct user's authority.

## Execution notes

The user has already asked for implementation, delegation and shipping. Reversible implementation proceeds without another generic approval prompt. The pending custody choice and external credentials remain actual dependencies for payment onboarding and production verification.

### September 9 progress

Tasks 1–3 are implemented and reviewed. Validation: 158 tests passing, including five real PostgreSQL cases, successful TypeScript and production build, successful initial/repeated migrations, legacy rehearsal HTTP smoke passing. Isolated browser checks passed desktop/mobile routes and mocked wallet/credential interactions. The authentication rate-limit storage finding was reproduced, fixed and independently re-reviewed.

Task 4 remains incomplete: DATABASE_URL is absent locally and on the linked Vercel project; no Neon production login was performed. The user's runner/custody answer is pending. No multi-tenant payment executor or runner pairing exists yet, and all new run requests fail closed. The public release is a preview, not a completed self-service payment product.
