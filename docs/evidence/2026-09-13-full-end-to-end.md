# Live end-to-end audit — 13 September 2026

The live application at https://obolos.app was exercised through browser controls and actual private runners. Runtime commit **6f88bc2**, production deployment **dpl_3WmBKycWoGEoqSR3RwAyzUY3iWU5**. [Machine-readable receipts and observations](2026-09-13-full-end-to-end.json) accompany this report.

## What was real

The live browser used a fresh Playwright context, real application APIs and a software-wallet bridge that signed with the existing operator testnet accounts. No application responses, balances, outputs or transactions were intercepted with fixtures. This verifies the app's wallet-provider interface; it is not a browser-extension installation test. Ledger hardware alone used Speculos. Ring access, model inference, GitHub requests, PostgreSQL storage, Circle wallet execution, Arc/Hedera settlement, Blocky402, HCS and scheduled-payment proof checks used their actual services.

Buyer and seller roles were operated by the same authorized operator. These runs demonstrate functioning transactions, not independent market demand. No mainnet payments were made. Private credentials and durable payment journals remain outside this report and source control.

## Browser flows

- Signed in using the wallet button and an actual signature; signed out and verified session invalidation.
- Created **Market Scout — Live API Checks**, issued its scoped credential, verified cross-agent denial, issued and revoked a disposable credential, and verified the revoked credential returned 401.
- Created and cancelled a task before execution.
- Filtered the marketplace through all five resource categories, expanded exact terms, and used **Use in a task** to carry the actual selected service into the task composer.
- Submitted a coding task, used **Retry this task** after the initial invalid plan, reviewed the new exact two-call plan, and clicked **Approve 0.002 test USDC**.
- Expanded actual outputs, service terms, fingerprints and payment evidence. Opened all workspace sections and checked mobile layouts for overflow.
- Filled the complete seller form with an existing service's exact schemas and metadata. **Register service in wallet** recognized the existing on-chain terms; **Publish registered service** successfully republished without another registration transaction.
- Loaded actual delivered seller sales into production accounting. No invented cost statement or independent valuation was submitted.
- Used **Review paid request**, **Verify payment & request delivery**, and **Read order status** on a completed purchase. Payment hash and output remained unchanged; no wallet transaction was requested.
- Recorded a genuine output-quality dispute and a real completed refund through their respective buyer and seller forms.
- Clicked **Refresh data**, switched activity periods, opened closed-day economics, and refreshed marketplace purchases. Finalized payment, delivery-attestation and buyer-acknowledgment statuses were visible.

The live checks did not permanently retire an operating service, manufacture an independent review, or change the global economic policy simply to exercise a button. Those boundaries have isolated regression coverage. New agents still require private runner configuration, funding and an on-chain spending policy; creating an agent in the browser does not perform those steps automatically.

## Actual work and payments

A general coding task bought JavaScript source for `uniqueSortedNumbers(values)`, then passed the exact returned source to text statistics. Both paid calls completed. The returned source passed its three example assertions and separate checks for numeric ordering, duplicates, negatives, fractional numbers, empty input, a new returned array and unchanged input. The separate local review ran the inspected pure code in a bounded VM; the marketplace service delivered source text and does not claim arbitrary code execution.

The newly created agent then made five additional bounded purchases: fresh repository data, statistics on that response, a model-generated status note, SHA-256 integrity verification, and one-hour storage. Stored text was retrieved through the authenticated storage API and matched the original request. This five-call sequence was operator-orchestrated; the coding task's two-call plan was selected by the real private model planner.

Across these seven calls, principal was **0.007 test USDC**, split into **0.00665 seller allocation**, **0.00021 reserve**, and **0.00014 review pool**. Each finalized payment was checked against its exact service terms. All seller-delivery and buyer-acknowledgment hashes matched the actual output. A completed executor replay attempted **zero transaction writes**. Planner API charges and network fees are separate from service principal.

The prior 42-word delivery against a maximum-40-word request became a real dispute. The seller returned the full **0.001 test USDC** to the original Circle payer in transaction `0x43cc1cc9ea879d5301e97105e7c903e16dade20012b82cd477cdbaf50a0f5a16`; the refund form verified and recorded transfer log 34. Refunds are voluntary transfers, not automatic escrow arbitration.

## Agent communication and Hedera bonus paths

A fresh buyer discovered the public A2A Agent Card, proposed a bounded repository purchase, accepted the seller's signed offer and completed its paid x402 request through Blocky402. Transaction **`0.0.7162784@1789245077.226006093`** settled **100,000 tinybar / 0.001 test HBAR** for one actual repository record.

The following previously executed paths were reverified against network and service records without resubmitting their payments: both HCS-14 profile anchors, HCS payment audit, native HTS payment, and both native Scheduled Transactions with associated deliveries. Live HTTP checks also confirmed insufficient-budget counteroffers, unpaid HTS gating, malformed/oversized A2A rejection, original receipt recovery, scheduled-delivery replay and rejection of resource rebinding.

This demonstrates all seven listed Hedera extra-credit directions through their implemented alternatives: per-repository metering, A2A, HCS-14, discoverable directory, HTS, HCS audit and finite native recurrence. It does not claim UCP, ACP, custom HTS fees, continuous streaming or automatic HCS publication for every new payment. The current A2A negotiation service is specifically for repository data. General tasks discover and purchase generic registered APIs through the Arc service catalog; they do not automatically negotiate every arbitrary task over A2A.

Circle Agent Stack performed the Arc payments. Ledger Ring supplied private credentials with the accepted Speculos device setup. These technical checks do not claim sponsor approval or satisfy the separately required Arc mainnet deployment milestone.

## Economy reconciliation

| Since-deployment measure | Before | After |
| --- | ---: | ---: |
| Finalized payments | 19 | 26 |
| Seller deliveries | 19 | 26 |
| Buyer acknowledgments | 19 | 26 |
| Gross payments, test USDC | 0.019 | 0.026 |
| Seller allocations before refunds, test USDC | 0.01805 | 0.0247 |
| Recorded refunds, test USDC | 0.001 | 0.002 |
| ARPI | 100 | 100 |

The final index was fresh and caught up. Prices were unchanged, so a flat ARPI is correct. Daily inflation still needs two comparable complete closed days after the basket baseline. Trading activity alone does not change the price index.

**GAP/GDP remains unavailable:** the current window has 15 revenue-bearing eligible orders but no complete production-input accounts. Surplus lacks complete resource costs, and productivity lacks independent output valuations. The paper supplies formulas, not those observations. These are real remaining data requirements; no random numbers, invented invoices or fabricated independent valuations were added to make the chart move. The separate payment/refund measurements above do update from actual records.

## Failures fixed and validation

The first coding proposal selected an integrity-verification hash for text generation and failed schema validation before payment. The planner now sees shorter category-labelled selectors and a compact capability catalog; the private process maps exact selectors back to validated immutable definitions, then retains the existing schema, routing, budget and approval checks. A fresh real model call produced the correct inference-to-compute plan and the original task completed after UI retry. This improves selection reliability without guaranteeing all model plans or outputs will be correct.

Developers still advertised repository-only API/runner examples. The deployed guide now presents general task discovery, scoped task reads and private task-runner setup first, with repository flows explicitly optional. An independent review found no P1/P2 issues in these changes.

- **670 application tests passed**; 89 database-dependent cases were skipped in that invocation and **all 89 passed separately against real isolated PostgreSQL**. Two five-second database timeouts under concurrent load passed in an isolated rerun.
- **45 distinct browser regression cases passed**, including three older fixtures updated for the new task/profile reads. **14 cases were rerun against the final deployment**. These intercepted regression cases are separate from the real browser flows above.
- Executable contract test, typecheck and production build passed.
- Live policy reads rejected over-budget and unauthorized-category consumption without a transaction. Live routes rejected missing idempotency, zero budgets, cross-origin mutation, stale plan hashes, cancelling completed work, malformed provider requests and revoked/cross-agent credentials.
- Expired storage returned 404 without renewing its lease or disclosing ownership. Production smoke rejected new rehearsal runs and verified the operator boundary.

These results cover the listed scenarios and observed failure paths, not every conceivable edge case. The provider must remain available, and general task execution requires an online configured private runner. No unbounded agent loop or automatic top-up was installed by this audit.
