# General tasks and an open service marketplace

The user wants people to describe arbitrary work, buy suitable services, publish their own capabilities and receive payment. Repository research must be one optional workflow. Build a general digital-task interface backed by actual registered services; never promise capabilities that the available providers cannot perform.

## Product and execution

The default agent view contains a free-form task request and a maximum test-USDC budget. A private task runner plans against the actual service catalog and its input/output schemas using real model inference. The owner sees the concrete plan, providers, exact total and proposed input routing before approving it. Then the same private runner executes the fixed plan through the existing Circle executor, preserving policy enforcement, payment journals, seller delivery, acknowledgment and fees. Results and real receipts appear on the task. A task without a suitable provider is blocked with a useful reason, never sent blindly to the repository API.

A plan supports one to five sequential steps. Inputs can contain exact references to earlier step outputs, shaped `{ "$from": 0, "path": ["text"] }`; no executable expressions, arbitrary network tools or shell evaluation. References are resolved before each service input is validated. Each step pins its complete registered service definition and fixed price/quantity. The owner-approved hash and expiry cannot be changed by the planner. Order IDs derive deterministically from task ID, plan hash and step index; retries retain these IDs and private journals. A runner never escalates on-chain allowances, seller allowlists or human spending limits by itself.

The existing repository workflow remains accessible under an explicit repository-research section. Current agent identities, economic history, Ledger and Hedera integrations remain valid. No migration rewrites historical research records.

## Sellers

Keep `obolos.service.v1` and existing on-chain registration. Add owner-editable service profile metadata (title, description, tags and example inputs) separately from immutable payment terms. General service publishing belongs in the marketplace seller desk, with straightforward fields and advanced schema editing. Sellers may expose any schema-valid digital service through the existing paid provider protocol; the five accounting categories classify resources, not the user's task domain. Earnings display finalized seller allocation and payment evidence, including generic economy service orders.

## Interfaces

Task shared model lives in `src/lib/tasks/model.ts`. `TaskPlan` has version1, summary, steps (serviceHash, exact definition, input template), totalAtomic. Raw planner output contains only summary and steps(serviceHash,input); `createTaskPlan(value,services,budgetAtomic)` binds definitions and totals. Export `taskPlanHash(plan)`, `resolveTaskInput(template,outputs)`, `taskStepOrderId(taskId,planHash,index)` and public `GeneralTask` type. Statuses: queued, planning, needs_approval, approved, running, completed, blocked, cancelled.

User API: GET/POST `/api/tasks` (create agentId,instruction,budgetAtomic with Idempotency-Key); GET/POST `/api/tasks/[id]` (approve with planHash, cancel, retry). Scoped runner API: POST `/api/v1/agents/[id]/tasks` action claim with stable workerId returns `{task,claimToken,phase:'plan'|'execute'}` or null; GET returns pinned ownerAddress plus tasks. POST `/api/v1/agents/[id]/tasks/[taskId]` accepts plan, progress, complete, or blocked, always with claimToken. Plan updates require a planning claim. Progress references actual existing economy order IDs and server checks owner, agent, deterministic ID, input/service hashes, successful paid delivery and output. All owner-facing records strip claim tokens. Runner heartbeats/status are truthful.

Execution claims are sticky to their stable workerId: an expired lease cannot give uncertain paid work to a different execution host. Planning-only claims may expire and retry because they carry no payment. Duplicate create/approve/claim/progress calls cannot replace immutable terms. Completion requires every approved step's actual paid/delivered order. Failed or pending execution remains recoverable with original IDs, not a new task/payment.

Service profiles: `GET /api/economy/service-profiles` returns `{profiles: ServiceProfile[]}`; `PUT /api/economy/services/[id]/profile` requires the signed-in registered seller. `ServiceProfile` is `{serviceHash,title,description,tags,examples}`. Default reference-provider profiles accurately describe current text inference, text statistics, integrity checks, storage and repository data. Seller-supplied prose is untrusted planner input.

## Validation and release

Test non-repository writing/translation, a multi-step text-processing task, custom input/output schemas, unsupported capabilities, budget rejection, owner and API-key isolation, stale approval, duplicate claims, partial paid recovery, same-ID retries, and actual seller earnings. Use real isolated PostgreSQL constraints plus unit/browser tests. Deploy additive migrations and code, run bounded real testnet tasks with existing authorized accounts, verify chain receipts and actual outputs, inspect desktop/mobile UI, and publish truthful release evidence. Only Ledger hardware may be emulated.
