# Recording the Obolos demo

Use the current signed-in workspace at **https://obolos.app/app**. Lead with general digital tasks, then show the payment and authority behind the result. The earlier operator dashboard and Connections panel are retired.

## Before recording

- Sign in and choose an agent with a configured private task runner. Confirm the provider is available and the private host is awake. Agent creation alone does not configure execution.
- For a fresh paid take, check the payer balance, remaining agent allowance, approved sellers/categories and policy expiry. Previously tested agents have already spent some or all of their caps. A balance is not spending authority.
- Start the bounded runner using the [task runner guide](task-runner.md). It must remain active after you approve the plan. Preserve its original worker identity and all payment journals.
- Prepare the marketplace, a completed general task with expanded outputs and receipts, Economy, and Developers → Hedera integrations. Use **Since deployment** for cumulative activity; a new UTC day may have little or no activity.
- Keep wallet secrets, API credentials, OTPs and private environment files out of the recording. Keep recordings and narration exports in the ignored `output/` directory. Use the actual app and receipts when demonstrating a flow.

## Suggested four-minute walkthrough

| Time | Screen and action | What to explain |
| --- | --- | --- |
| 0:00–0:20 | Open the marketplace and browse real service listings. | “Obolos is a market for digital work. Sellers publish APIs with capabilities and prices; agents discover what they need.” |
| 0:20–0:55 | Open Agents, describe a small supported task, and show the proposed plan. | “The planner selects registered services. The human reviews the providers, input routing and exact price before approving.” |
| 0:55–1:40 | Approve a fresh plan if the configured runner and allowance are ready; inspect actual outputs and payment links when complete. Alternatively, open the previously completed coding task and explicitly describe it as a completed run. | “This task buys source code, then passes the returned source to a text-analysis service. These are actual responses and separate test-USDC payments.” |
| 1:40–2:05 | Open purchase details, settlement, delivery and buyer acknowledgment. | “Payment, seller delivery and buyer acknowledgment are separate records. The allocation is 95% seller, 3% reserve and 2% review pool. Delivery can be recovered using the original order.” |
| 2:05–2:45 | Developers → Hedera integrations: open the A2A, HTS, HCS and schedule proof links. | “The separate repository-data service supports discovery and A2A negotiation, metered x402 payments through Blocky402, HCS identity and audit, HTS payments and a finite native schedule.” |
| 2:45–3:15 | Economy → Refresh data → Since deployment; show payments, seller allocations and refunds. | “Activity updates from actual records. GAP needs complete production inputs; productivity additionally needs independent output valuations. Those are still pending. Unchanged prices correctly leave the price index flat.” |
| 3:15–3:45 | Show the architecture and existing Ledger approval evidence; disclose the Speculos device. | “Ledger Key Ring protects private broker credentials and the controller approves spending limits. Only the Ledger device is emulated. Circle uses its own wallet infrastructure for real Arc testnet settlement.” |
| 3:45–4:00 | Return to the completed task and app URL. | “Agents buy services within human-approved limits, with outputs and payment evidence you can inspect.” |

These timings are a recording outline, not a claim about service latency. A fresh model plan can fail validation or return imperfect work. Show an actual blocked state or recovery if it occurs; do not represent an existing receipt as a new purchase.

## A small task to demonstrate

The verified coding run asked for a JavaScript function named `uniqueSortedNumbers(values)` that returns sorted unique numbers without changing the input, followed by text statistics on the returned source. Its two service calls cost **0.002 test USDC**, excluding network fees and private planning inference charges. A new plan can differ: review its real providers and price before approval.

The service returns source text. It does not execute arbitrary code or guarantee correctness. The recorded output was separately inspected and tested, as documented in the [live audit](evidence/2026-09-13-full-end-to-end.md).

## What the demo can accurately claim

The audit records seven real Arc service payments, matching delivery/acknowledgment hashes, a fresh Hedera A2A paid request and a real refund. HCS, HTS and both Scheduled Transactions have independently checked evidence. Buyer and seller were operated by the same team. This proves working flows, not independent market adoption.

General tasks use the Arc service catalog; the Hedera A2A endpoint currently negotiates repository data. The schedule is finite, not continuous streaming. GAP and productivity remain unavailable until the required accounting evidence exists. The only runtime emulation is the Ledger device; isolated automated tests use fixtures and are documented separately.

If a payment's outcome is uncertain, keep the original order and private journal, then reconcile or retry delivery through the documented recovery flow. Do not clear state, renew an expired storage lease or submit another payment just to make a recording look continuous.
