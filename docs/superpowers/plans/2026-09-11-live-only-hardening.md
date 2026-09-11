# Live-only hardening implementation plan

> Execute with superpowers:subagent-driven-development and independent review. User approved implementation in the existing checkout.

**Goal:** Permit only Ledger hardware emulation in the deployed runtime, and connect the real execution and evidence paths.
**Architecture:** Preserve the deployed contracts; local wallet execution, public paid provider delivery, append-only evidence and bounded indexing remain separate. Extend recovery without creating replacement payment intents.
**Tech Stack:** Next.js 16.3.4, TypeScript, Neon PostgreSQL, viem, Circle CLI, Speculos.
**Spec:** ../specs/2026-09-11-live-only-hardening-design.md

## Global constraints

- Read installed Next route/component docs before code changes.
- No generated receipts, fixture data, template model responses, invented accounting or unverified payouts in runtime paths.
- No secrets in public artifacts or logs; no uncertain payment retries; preserve historical evidence.
- Work on existing codex/obolos branch and leave preexisting output/ and brand image untouched.

### Task 1: Real evidence and indexing

Own new migration 012, evidence validation/ingestion modules and routes, indexer and indexing scheduler, associated tests and documentation. Add authenticated signed evidence with exact order/deployment/window binding; real resource valuations and denominators feed metrics. Fixed baskets select exact service hashes and explicitly record quote selection. Add bounded cron indexing, safe failure diagnostics and freshness metadata. Reject untrusted, contradictory, self-verified and cross-window evidence. Write failing behavioral tests, implement, run PostgreSQL integration and indexer tests. No fabricated sample evidence.

### Task 2: Runtime rehearsal retirement

Own legacy demo page, gateway, engine guard, run routes, links and test-only fixtures. Move the fixture gateway into tests; runtime creation and advancement must reject rehearsal even via direct API. Redirect the demo to the live workspace, preserve historical read/export. Test rejected creation and advancement, real-mode receipt rejection and live failure without fallback. Update smoke and setup guidance.

### Task 3: Generic real execution and providers

Own local economy executor with durable order identity and exact pinned limits; paid provider execution for all categories. Reuse Circle operation journaling and service receipt verification. Add real source fetch, deterministic verification, durable bounded storage and private model execution. Tests must cover fail-closed readiness, immutable retries, cross-agent rejection and no second payment after delivery failure. Retain bounded live receipts when credentials and provider readiness allow.

### Task 4: Review and recovery

Own new migration 013 and separate recovery modules/routes. Add owner/seller access-controlled disputes, seller retirement that does not strand paid delivery, and refund receipt verification with globally unique canonical-USDC transfer proof. Independent reviews require a distinct verified reviewer identity and order/output binding. Never call a refund paid without chain evidence. Tests cover replay, unrelated transfers, unauthorized changes and delivery preservation.

### Task 5: Integration, release and independent review

Review each task against its requirements and actual diff, resolve defects. Run complete application/PostgreSQL tests, executable contracts, typecheck, production build and browser checks. Migrate/deploy with existing project configuration after validation. Verify public rehearsal rejection, real category policy, provider readiness, index freshness and receipts. Record actual remaining external requirements without treating disabled or unavailable functions as completed.
