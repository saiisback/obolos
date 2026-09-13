# Production accounting workflow — 13 September 2026

Runtime commit `14b02c4`, production deployment `dpl_BmEzFL12awRwKSjANGhq2GyaAqRS`, aliased to https://obolos.app. [Actual receipt-backed observations](2026-09-13-accounting-workflow.json) were collected at `2026-09-13T05:55:05.663Z`.

## Implemented

- Seller-only cost observations bind the order, actual output, canonical finalized seller delivery event and the seller's transaction fee. Native 18-decimal USDC gas is retained exactly and rounded up once to six-decimal accounting units.
- The accounting form loads these measured gas costs and retains historical inference token usage without claiming an invoice amount. Unknown external inputs and resource allocations remain unfilled.
- An authenticated independent-review queue exposes outputs with complete positive production costs and a closed-day delivery/acknowledgment window. It paginates, normalizes decoded event addresses before signing, and verifies output integrity.
- Reviewers sign their valuation method, value and source evidence with the exact production-account hash. In this format, cost is the producer's consumed inputs and resources, not the buyer's payment for the finished output. Existing evidence retains its original format and semantics.
- Server checks reject untrusted and related signers, changed cost/account/output bindings and conflicting immutable evidence. Changing or advancing the selected sale clears its prior cost observations.

## Live verification

The signed-in seller used **Load my sales**, selected one existing delivered sale in each category, and clicked **Load measured costs** for data, compute, inference, verification and storage. All five loaded actual finalized gas receipts and matching output identities. The inference observation retained 197 prompt tokens and 179 completion tokens from `gpt-5-nano-2025-08-07`; billed cost and unretained cached-token usage remained unknown.

The gas observations ranged from `1129485000000000` to `1129737000000000` native atomic units, each rounded up to **0.001130 test USDC**. This exceeds the **0.000950 test USDC** seller allocation on these low-priced demo sales even before other costs. A negative surplus would be a valid accounting result, not a reason to change observations.

The seller's valuation-queue request correctly returned `trusted:false`; it could not self-authorize as an independent reviewer. An unauthenticated cost request returned 401. There were no page errors, new payments, simulated approvals, fabricated invoices or live valuation submissions. The browser used actual app APIs and existing software-wallet login signatures; Ledger device emulation remains separately disclosed.

## Validation

- 690 application tests passed; 90 database-dependent cases were skipped in that invocation.
- 31 targeted real PostgreSQL cases passed separately. The account-bound valuation test produced numeric GAP, surplus and productivity from isolated fixture records and signed evaluator evidence. Those numeric test results are not live economic observations.
- 13 browser regression cases passed locally and against the deployed UI. These fixture-based cases are separate from the actual seller workflow above.
- Typecheck, local production build, deployed production build and public HTTP smoke passed.
- Independent review found three issues, all fixed and regression-tested; follow-up review found no remaining P1/P2 issues.

The first deployment attempt with CLI 58.9.0 returned “Not authorized.” The authenticated account and project were verified; retrying with the previously working CLI 58.7.1 and explicit project scope deployed successfully.

## Remaining external evidence

The software paths are implemented and verified. Live aggregate GAP and productivity are **not yet populated**: complete actual producer input/resource accounts and an independent evaluator's monetary assessment have not been supplied. No external invoice or evaluator is replaced by an invented zero or a second team-controlled wallet. Follow the [seller and evaluator workflow](../production-accounting.md) when those records are available.
