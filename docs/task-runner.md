# Private general task runner

The runner plans free-form digital work against the actual registered service catalog, then waits for the owner to approve the fixed plan in the app. Planning does not submit Circle transactions. Approved execution uses the existing testnet executor, scoped agent API key, policy checks, payment journals, provider delivery verification and buyer acknowledgment.

A task supports one to five sequential service calls. Unsupported capabilities produce a blocked task; a writing service is not treated as a browser, video generator, account operator or shell. Seller descriptions and examples are untrusted planning context. Every selected definition and fixed quantity/price is pinned and checked; input references must match prior output schemas before approval. Actual resolved inputs are checked again before each step.

## Private setup

Use an already enrolled agent and its existing scoped key. The owner must already have an active on-chain mandate, seller allowlist and spending limits for the Circle payer. The runner never funds wallets, enrolls agents, issues keys or changes spending policy.

Keep the existing Circle CLI home, wallet address, Ledger controller and encrypted Ring configuration used by the private economy executor. The Ring bundle supplies `inferenceApiKey` through `decryptBrokerSecrets`; no plaintext model key belongs in app APIs or source files.

Create a private environment file (mode `0600`) with these explicit pins:

```dotenv
TASK_RUNNER_ORIGIN=https://your-platform.example
TASK_RUNNER_AGENT_ID=<existing-platform-agent-uuid>
TASK_RUNNER_OWNER_ADDRESS=<platform-owner-wallet-address>
TASK_RUNNER_WORKER_ID=<one-stable-uuid-for-this-execution-host>
TASK_RUNNER_DATA_DIR=/absolute/private/task-runner-state
ECONOMY_AGENT_KEY=<existing-ob_test_scoped-key>
CIRCLE_WALLET_ADDRESS=<existing-circle-payer-address>
CIRCLE_CLI_HOME=/absolute/private/circle-cli-home
LEDGER_CONTROLLER_ADDRESS=<existing-ledger-controller-address>
ECONOMY_OPERATION_DIR=/absolute/private/existing-economy-operations
```

The owner and Circle payer may be different addresses. Generate the worker UUID once and retain it. Use the same `ECONOMY_OPERATION_DIR` as existing purchases made by this wallet; its shared executor reservation prevents concurrent unresolved allowances. State directories must be owned by the current user with no group or world permissions (`0700`). Existing files remain private (`0600`). Private journal reads allow up to 8 MiB because the executor preserves formatted JSON whose whitespace can expand a valid bounded output; HTTP response limits are separate. The authenticated platform origin must be canonical HTTPS with no path, query or credentials.

Run one bounded claim:

```sh
npx tsx --env-file=.env.broker --env-file=/absolute/private/task.env services/task-runner.ts --once --execute-testnet
```

Or poll at most 60 times, with ten seconds between claims:

```sh
npx tsx --env-file=.env.broker --env-file=/absolute/private/task.env services/task-runner.ts --polls 60 --interval-ms 10000 --execute-testnet
```

Polling accepts 1–360 claims and a 5–60 second interval, stops on a failure, and stops before the next claim after SIGINT/SIGTERM. In-flight durable executor work finishes its bounded attempt before shutdown. Each claim handles either one planning call or the approved plan's at most five paid steps. Run again after approving a plan, or leave bounded polling active. Importing the runner or executor modules performs no network, decryption or wallet action.

## Approval and recovery

The app displays the exact providers, input routing and total before approval. Approval currently expires after one hour. The runner independently checks owner, agent, payer, origin, plan hash, expiry and budget; the live executor checks current chain policy and exact active service terms before payment. The model has no payment authority or tools.

The local `pins.json` fixes the runner's authority and executor directory. `tasks/<task-id>.json` preserves the original request, successful planner result and owner-approved execution terms. Those records are fsynced before funds. Before approval, a cached proposed plan is revalidated against the current catalog on each retry: valid proposals are replayed after lost responses, while retired offers can be replanned. Approved execution terms never change. `ECONOMY_OPERATION_DIR/executor` retains the original per-order executor state and allowance reservation; Circle's operation journals stay in `ECONOMY_OPERATION_DIR`. Order IDs derive from task ID, approved plan hash and step index.

If delivery, acknowledgment or an API update is interrupted, keep all these files and retry the same task from the same execution host. Use the app's **Retry** action for a blocked task, then rerun the identical command. Completed earlier steps are verified again against their existing journals and chain evidence; their verified output supplies the next input. The runner never accepts a server result as a replacement for a missing local payment journal. An uncertain Circle submission is recovered using its existing operation, never submitted under a fresh order ID. An expired approval still allows recovery of already submitted/paid work, but it does not authorize the next unpaid step or a new payment.

Do not delete journals, change the worker UUID, switch executor directories or copy a partial state directory onto a second host. Execution claims stay bound to their original worker after a lease expires. A process crash may leave a lock file; inspect the owning process and all relevant operation evidence before an operator removes a stale lock. The runner never removes a lock it did not acquire.

The UI reports real paid results and receipts only after server verification. Failure messages contain fixed recovery guidance; raw upstream errors, Ring output, keys and model responses are not logged. Task instructions and selected catalog schemas/descriptions are sent to the pinned inference API for planning. Planning inference is billed to the private API account separately from the task's service-purchase test-USDC budget.

## Planning bounds and verification

The planner makes one request to `https://api.openai.com/v1/chat/completions`, using the fixed request alias `gpt-5-nano` and requiring the exact response snapshot `gpt-5-nano-2025-08-07`, with a 60-second timeout, `store:false`, minimal reasoning and at most 4,000 completion tokens. It sends no tools. JSON mode constrains the response format; strict local validation rejects extra fields, unregistered service hashes, invalid references, unsupported schema routing and over-budget plans. Truncated or unpinned model output fails closed. The combined planning payload is limited to 128 KiB and response body to 64 KiB. The complete plan also has the existing canonical JSON depth limit of 12, including its wrappers; deeply nested service schemas can exceed that limit even when individually valid and will be rejected before approval or payment. Runner identity reads contain only the owner; subsequent authority reads request only the claimed task. Single-task API responses are bounded to 1 MiB to accommodate five paid output records without downloading historical task outputs; catalog responses remain capped at 512 KiB. No automatic model retries, endpoint substitution or model fallback occurs. See the official [Chat Completions API reference](https://developers.openai.com/api/reference/resources/chat) and [GPT-5 nano model documentation](https://developers.openai.com/api/docs/models/gpt-5-nano).

Run offline focused checks:

```sh
npx vitest run tests/task-planner.test.ts tests/task-runner.test.ts tests/economy-executor.test.ts
npx tsc --noEmit
```

Tests inject transport and external effects, run the actual durable economy executor, and exercise real live dependency authentication and Circle payer pinning without network access, credentials or funds. They cover non-repository planning, prior-output routing, unsupported requests, malformed plans, approval tampering, immutable authority, partial paid recovery, uncertain submissions, missing journals and bounded CLI options. These tests do not constitute live seller or testnet execution evidence.
