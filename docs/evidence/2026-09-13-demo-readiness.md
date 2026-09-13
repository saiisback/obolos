# Demo readiness recheck — 13 September 2026

Checked the deployed application at https://obolos.app at approximately **05:29 UTC / 10:59 IST**, after the full paid [end-to-end audit](2026-09-13-full-end-to-end.md). Runtime source remained `6f88bc2`; this follow-up changes documentation and copies the user-supplied README banner unchanged.

## Fresh checks

| Check | Result |
| --- | --- |
| Application suite | 670 passed; 89 database-dependent cases skipped in this invocation |
| Targeted real PostgreSQL suites | 22 production-accounting and measurement-indexing cases passed against the isolated test database |
| TypeScript | Typecheck passed |
| Production HTTP smoke | Session, cross-origin rejection, operator boundary, rehearsal rejection and workspace redirect passed; no jobs or payments created |
| Actual signed-in browser | Login, five workspace pages and their section links, developer examples, Hedera proof display and sign-out passed; no page errors |
| Mobile layout | Five workspace pages checked at 390 pixels without horizontal overflow |
| Completed general coding task | Actual source output, downstream statistics and both payment links rendered |
| Arc evidence | All seven previously paid orders rechecked against finalized receipts; seller delivery and buyer acknowledgment output hashes matched |
| Executor replay | Zero transaction writes attempted |
| Hedera checks | Eight live input, budget, unpaid-request and paid-delivery recovery checks passed |
| README assets | All local Markdown links resolve; banner is byte-for-byte identical to the supplied PNG |

The browser used actual application APIs and real login signatures through the existing software-wallet bridge. No application response fixtures were used in these browser checks. This still does not establish browser-extension installation or physical Ledger use. No new payments were sent in this follow-up. The previous audit records the actual paid execution, full database suite, browser regression suite, contract execution and production build; these were not all repeated for documentation-only changes.

## Current service and economy state

The reference provider reported **online**, last seen at `2026-09-13T05:28:36.000Z`. The economy index was fresh and caught up: index age 34 seconds and chain age 44 seconds at the observation.

Since-deployment totals remained **26 payments**, **0.026 test USDC gross**, **0.0247 test USDC seller allocations**, **0.002 test USDC recorded refunds**, and **26 deliveries / 26 buyer acknowledgments**. No new payments had occurred in the current UTC day, so today's zeros were correct. Use **Since deployment** to show cumulative activity during the recording.

Production accounts remained **zero**. GAP needs complete intermediate-input accounting; surplus needs complete resource costs; productivity additionally needs independent output valuation. Passing calculation/intake tests does not supply these real-world observations. No synthetic cost accounts or independent valuations were inserted.

## Recording boundary

The current app, existing outputs and receipts are ready to show. A fresh paid take additionally requires an online private task runner, valid spending policy, remaining allowance and a funded payer. Existing test agents have consumed some or all of their configured allowances. This recheck does not raise limits, top up wallets or install an unbounded worker loop.

Follow the updated [recording walkthrough](../demo-script.md). Ledger hardware alone is emulated with Speculos. The paid service and settlement evidence is real testnet evidence.
