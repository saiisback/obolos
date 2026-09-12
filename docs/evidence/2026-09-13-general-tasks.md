# General digital tasks: release verification

Released to https://obolos.app on September 13, 2026 (Asia/Kolkata). Runtime commit: `1b13704`. Production deployment: `dpl_Dgh3BxT17y6DhrKcayhUkj2eQedh`.

Agents accept freeform digital tasks with a maximum budget. A private model planner selects registered services and proposes one to five sequential calls, including references to earlier outputs. The owner approves the exact immutable plan and price before execution. The private runner checks spending policy, submits durable payments, obtains actual service output, and records delivery and acknowledgment receipts. Repository research remains an optional specialized workflow.

Sellers can publish HTTPS APIs with input/output schemas, pricing, descriptions, tags, and examples. The seller desk reports indexed, finalized payment allocations before refunds and costs. It does not label payments as profit.

## Actual paid runs

These were owner-operated testnet validation runs, not independent customer demand. Ledger hardware used Speculos; the service calls, model requests, database records, and Arc testnet transactions were real. No mainnet funds were used.

| Service call | Payment transaction | Principal | Seller allocation |
| --- | --- | --- | --- |
| English-to-Spanish translation | `0x2fa65b3d0f64371770727b8c8f4e2f429fa910ab2db0a2869ab29da5250c5a0b` | 0.001 test USDC | 0.00095 test USDC |
| Bakery announcement writing | `0x1805579ad01630fe9509e107a08e9a6d952d0f68f1e00d1db3edf125b3c6669b` | 0.001 test USDC | 0.00095 test USDC |
| Statistics on the exact generated announcement | `0xd2de785fadf0c435e352bc9605d3dff9f2270122f262fe6097c90b912e1a45dc` | 0.001 test USDC | 0.00095 test USDC |

Total service principal was **0.003 test USDC**: **0.00285** to the seller, **0.00009** to reserve, and **0.00006** to the review pool. Network and planner API fees are separate. Finalized `OrderPaid` and `OrderSettled` events, matching allocations, and buyer acknowledgments were checked independently. The earnings index contains all three orders.

The translation returned “Bienvenido a nuestra panadería vecinal. Abrimos a las 8 de la mañana.” The writing-to-statistics task passed the actual generated text byte for byte into the next service. Replaying the completed translation returned the original order and payment hash with **zero attempted transaction writes**.

An earlier unnecessary-storage proposal was cancelled before approval, with no paid steps. An unsupported physical-delivery request failed closed during planning with no paid steps; the model did not return a valid available-service plan.

### Observed output-quality limitation

The writing request asked for at most 40 words. Its delivered output contained **42 words**. This is a recorded quality failure, despite successful payment and service execution. The UI now explicitly says completed means all approved service calls finished and asks users to review outputs against their request. Receipts certify the recorded execution and delivery, not semantic correctness. The output was not rewritten to hide this failure.

## Validation

- Default application suite: **669 passed, 89 database-dependent tests skipped**.
- Actual PostgreSQL suites run separately: **16 new task/profile cases** and **16 existing authentication/Hedera cases** passed. This does not claim every skipped database case was run.
- **25 distinct affected browser fixture cases** passed; the six general-task cases were rerun on the final deployment. These mocked browser cases are separate from real payment evidence.
- Typecheck and production build passed. Additive migrations 017 and 018 were applied successfully.
- Actual signed-in desktop and mobile checks passed for tasks, marketplace, developers, economy, receipt links, and seller earnings, with no captured errors or horizontal overflow.
- Live unauthenticated task, scoped-task, and earnings requests returned 401. A cross-origin task mutation returned 403.

Release fixes include SQL NULL handling for blocked pre-plan tasks, the permitted planner model request alias with exact response-version validation, large-output and private-journal bounds, stable recovery and cancellation rules, hosted-provider profile binding, and readable text results. The planner was adjusted to delegate writing to a service and avoid unsolicited storage.

## Operational bounds

The platform supports tasks that available, registered services can perform within the owner's policy and budget. It does not automatically provide arbitrary shell execution, browser access, or physical services. Plans contain one to five sequential calls and undergo bounded schema validation; some deeply nested schemas exceed the complete plan's nesting limit and are rejected before payment.

A configured private runner must be online to plan and execute tasks. These verification runs used bounded one-shot runner invocations; they did not install an always-running general-task daemon. See [runner setup](../task-runner.md).

Sanitized transaction, replay, output-routing, quality, HTTP, and live UI evidence is in [the accompanying JSON](2026-09-13-general-tasks.json). It contains no private keys, API credentials, or worker claim tokens.
