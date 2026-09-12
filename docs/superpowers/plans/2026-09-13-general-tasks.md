# General Tasks Implementation Plan

> For agentic workers: use superpowers:subagent-driven-development with independent review of task state, execution and UI. Work in the current isolated worktree.

**Goal:** Users describe general work, approve a concrete service plan, obtain real paid results, and publish services that earn seller revenue.

**Architecture:** Add a task orchestration layer over the existing schema-defined Arc service marketplace and private Circle executor. Keep repository research as an optional legacy workflow. A private planner chooses capabilities; owner approval pins the plan before any service payment.

**Tech Stack:** Next.js16.3.4, React19, TypeScript, Zod, PostgreSQL, existing Circle executor/SDK and Ledger Ring integration.

**Spec:** docs/superpowers/specs/2026-09-13-general-tasks-design.md

## Global constraints

No simulated providers or receipts. No mainnet execution. Retain exact payment journals and IDs; no silent budget escalation. No raw keys in browser/server task APIs. Read installed Next.js route/client docs before editing. Preserve user artifacts. Approval is already authorized for implementation and bounded testnet validation; do not pause for redundant process approval.

## Task1 — shared task model, persistence and scoped APIs

Files: new src/lib/tasks/model.ts; src/lib/platform/tasks.ts; db/migrations/017_general_tasks.sql; owner and scoped runner routes listed in spec; tests/general-tasks.test.ts and tests/general-tasks-postgres.test.ts.

- [ ] Write boundary tests for budget totals, input references, immutable plan hashes and deterministic order IDs.
- [ ] Implement `createTaskPlan`, `taskPlanHash`, `resolveTaskInput`, `taskStepOrderId`, `GeneralTask`, `TaskPlan` per spec. Reject forward/self references and unregistered service hashes.
- [ ] Add additive task persistence and owner-scoped create/read/approve/cancel/retry APIs. Idempotency uses owner+agent+key with exact request fingerprint.
- [ ] Implement planning/approved execution claims, sticky execution worker, conditional updates and sanitized public projections. Implement all task runner update actions; independently bind progress to actual economy order output and immutable request.
- [ ] Run meaningful real PostgreSQL tests including foreign-owner isolation, duplicate claims, approval tampering and partial paid recovery. Commit owned files.

## Task2 — private planner and task executor

Files: new src/lib/tasks/planner.ts, src/lib/tasks/runner.ts, services/task-runner.ts; tests/task-planner.test.ts and tests/task-runner.test.ts; docs/task-runner.md.

- [ ] Test planner responses with general task prompts, strict catalog/schema pinning, unsupported tasks and budget limits.
- [ ] Build bounded real inference planning with a pinned model endpoint and private Ring credential retrieval. Seller metadata is untrusted, never authority.
- [ ] Claim work through scoped APIs. Persist immutable local state before paid steps, use deterministic order IDs and runEconomyExecutor/liveExecutorDependencies. Resolve and validate each approved input template.
- [ ] Validate pinned owner/agent/origin, owner-approved plan hash/expiry, budget and existing on-chain spending policy. Resume existing executor state rather than replace payments. Planning API calls alone never transfer funds.
- [ ] Report progress/blocked/completed using actual order evidence. Provide once and bounded polling runner modes, clear setup instructions and no import-time execution.
- [ ] Test crash/retry, mismatched approval, expired approval, unsupported task, prior-output routing and absence of fabricated completion; commit owned files.

## Task3 — general task UI and seller UI

Files: new src/components/platform/general-tasks.tsx and CSS; modify workspace.tsx/resource-marketplace.tsx/economy-market-actions.tsx as needed; browser fixtures/tests for task and seller flows.

- [ ] Make free-form task creation the default agent action: agent, task, budget. Show examples from actual service capabilities. Keep repository research explicit and accessible.
- [ ] Display planning/approval/running/results with service titles, exact cost, input routing, errors and payment links. Approve sends planHash; retry preserves task. Refresh status while active, pause polling on unmount.
- [ ] Put generic named service publishing in seller desk. Support descriptive profiles and custom input/output schemas through existing wallet registration and API. Display actual seller economy earnings alongside legacy verification earnings.
- [ ] Add marketplace service-to-task entry points; preserve owner routing and no secret leakage. Follow existing flat black/off-white/orange, 2D icon and no-shadow style.
- [ ] Run browser tests for nonrepo tasks, approval, missing runner, errors, custom service publishing and narrow screens. Commit owned files.

## Task4 — catalog metadata, seller earnings, integration and release (parent)

Files: new src/lib/platform/service-profiles.ts, db/migrations/018_service_profiles.sql and profile API routes; economy-purchases/earnings additions; operator smoke script/release docs/README/package commands.

- [ ] Add owner-authorized profile writes validating examples against service input schema. Return accurate reference-provider fallback descriptions without claiming generic task abilities from names.
- [ ] Expose finalized generic seller earnings from existing settlement/index evidence, preserving gross vs95%allocation and incomplete evidence states.
- [ ] Wire runner/UI boundaries and run full typecheck, unit/PG/browser/build verification. Independent reviewers inspect execution and funds/replay semantics.
- [ ] Apply additive migration, deploy, run actual bounded general tasks and inspect their outputs/receipts/seller revenue. Preserve original live journals. Record remaining unavailable provider categories honestly.
- [ ] Merge/push verified implementation and summarize concrete outcomes with live proof links.
