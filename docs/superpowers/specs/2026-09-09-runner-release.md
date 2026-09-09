# Isolated runner release contract

The user requested immediate execution after providing Neon credentials. Proceed with the previously recommended user-owned runner. No platform-managed wallet custody is introduced. A runner is one locally trusted process tied to one agent and an explicitly pinned owner wallet. It calls that user's loopback broker; the web service never receives broker or wallet secrets.

## Signed mandate

Use a versioned, exact, human-readable message containing origin, mandate UUID, agent UUID, owner address, allowed repositories (1–3), allowed providers, maximum price per repository, separate per-run HBAR/USDC limits, maxRuns (1–10), derived total allowance, expiry (at most 24 hours), and signing provenance `wallet` (no inferred physical Ledger provenance). The server stores the exact message, verifies the owner signature, and allows API-created jobs only within this signed scope. The runner independently reconstructs/verifies the message and pins owner/agent/origin from local configuration. It enforces maxRuns in a durable local journal before invoking any capability. A browser identity signature is not itself spending approval.

## Delivery and failure

Persist each queued job and stable UUID before execution. Reserve one run slot atomically under the mandate row lock; unique(agent_id,idempotency_key) replays return the same job and changed inputs fail409. Require a valid unrevoked runner and active signed mandate before queuing. Claim each job once with FOR UPDATE SKIP LOCKED. Never requeue an expired lease; interruption requires manual reconciliation. The runner fsyncs an execution-start record before work; restart may upload an already saved result, but never execute a started job again. Existing broker journal keeps its own immutable data/report/verification intents and holds uncertain payments.

Jobs carry only exact repos, signed mandate and stable job ID. Execute using existing createRun/advanceRun with run.id replaced by job.id before any side effect. Gateway methods independently enforce mandate fields at the runner before broker calls. Stop on price increases above allowance; report blocked status with no unauthorized transfer. Report original engine events, report and receipts to the control plane. Receipt status is explicitly runner-confirmed until independent chain verification exists; never synthesize a transaction hash or attach the old Arc receipt. No existing legacy run or intent is migrated/retried.

## UI and API

Agent setup panel: pair runner (one-time token), show local command/config, define allowed repositories/quote cap/maxRuns/expiry, inspect exact mandate, sign with owner wallet. Display runner heartbeat/offline status. Once active, owner or scoped API key can queue jobs. Show run status, blocked reason, purchased evidence, report, receipt explorer links and source-check result. New API keys cannot alter mandates or enrollment.

Routes: GET/POST `/api/agents/:id/runner`, DELETE same to revoke; GET/POST `/api/agents/:id/mandate` (POST phase prepare or approve), DELETE revoke; GET/POST `/api/agents/:id/runs` owner session; existing `/api/v1/agents/:id/runs` Bearer credential. Runner Bearer endpoints POST `/api/runner/claim` and POST `/api/runner/jobs/:id/result`; heartbeat piggybacks claim. No arbitrary remote command, destination URL or broker capability supplied by jobs.

## Release gates

Real Neon auth/tenancy checks; signed-mandate tamper/replay/expiry/maxRuns tests; concurrent queue/claim tests; local journal crash/no-replay tests; public API end-to-end with a dedicated test identity and explicitly limited local testnet broker. Preserve the prior unresolved Arc intent. Keep limitations and runtime dependencies visible. Frontend/Neon should deploy natively to Vercel so login no longer depends on the Mac.
