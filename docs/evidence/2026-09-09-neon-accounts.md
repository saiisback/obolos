# Neon account and credential verification — 2026-09-09

The production Next.js server on port 3000 completed the real account and agent API smoke test against Neon using its HTTP transport. The local production check passed **43 assertions**. No database mock or local PostgreSQL proxy was used.

The reusable test is [`scripts/platform-smoke.ts`](../../scripts/platform-smoke.ts). It generates a fresh EOA private key in memory, signs the actual server-issued SIWE message with `viem`, and keeps all signatures, session cookies and API credentials in memory. Output contains check labels and HTTP statuses; it does not print those secrets.

## Verified behavior

| Check | Observed result |
| --- | --- |
| Anonymous account status | HTTP 200, database configured, no user |
| Anonymous agent listing | HTTP 401 |
| Challenge and real EOA signature | HTTP 200; Secure, HttpOnly, SameSite=Lax cookies |
| User persistence | Application API identity matched a direct query to the configured Neon database |
| Replayed challenge | HTTP 401 |
| Session identity lookup | HTTP 200 with the authenticated user |
| Create two disposable zero-budget agents | HTTP 201; `setup_required` |
| List owned agents | HTTP 200 with both newly created agents |
| Issue agent API key | HTTP 201 |
| Key persistence and listing | SHA-256 hash persisted; listing omitted raw key and hash |
| API-key run listing | HTTP 200, empty runs |
| Attempt run creation | HTTP 409, `RUNNER_REQUIRED`; no job persisted |
| Use key for another agent | HTTP 403, `KEY_SCOPE_MISMATCH` |
| Revoke key, then reuse it | HTTP 200 followed by HTTP 401 |
| Log out, then reuse saved session cookie | Logout HTTP 200; agent endpoint HTTP 401; account user null |
| Cleanup | Disposable user deleted with cascading tenant rows; its challenge and address rate-limit rows removed |

Both agents had zero data and verification budgets. Run creation remained blocked by the missing isolated runner. No payment was executed.

## Reproduction

The ignored `.env.local` must contain the same `DATABASE_URL` used by the running application. Its value is never written into this evidence file.

For the public HTTPS endpoint:

```sh
npx tsx --env-file=.env.local scripts/platform-smoke.ts
```

For a local production instance pinned to the public application origin:

```sh
PLATFORM_SMOKE_ORIGIN=http://127.0.0.1:3000 \
PLATFORM_SMOKE_APP_ORIGIN=https://obolos.app \
npx tsx --env-file=.env.local scripts/platform-smoke.ts
```

The local check manually sends cookies and the expected `Origin` header, so it validates the server/database behavior rather than browser cookie transport. A separate public HTTPS run is recorded below once hosting is restored.

## Public HTTPS verification

Pending restoration of the public tunnel. At 16:22 UTC, the public `/api/account` endpoint returned HTTP 502 while the local production server passed the smoke test.
