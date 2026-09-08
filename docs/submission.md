# ETHOnline 2026 submission evidence matrix

Selected tracks: **AI Agents x Ledger**; Hedera **AI & Agentic Payments**; **Best Agentic Economy Application with Circle Agent Stack** on Arc. One project targets these three partner selections. This matrix separates observed execution from external qualification decisions.

## Current evidence — September 8, 2026

The [first paid testnet run](evidence/2026-09-08-first-paid-run.md) completed through the Next.js HTTP workflow, private broker, real Ledger staging Ring decryption in explicit Speculos mode, hosted Blocky402, GPT-5 nano and Circle Agent Wallet. It purchased three repository records for **0.003 test HBAR**, paid **0.05 test USDC** on Arc for verification, passed eight structural/source checks and exported a valid local audit chain. It did not include price escalation. A subsequent [live price-increase export](evidence/2026-09-08-blocked-price-increase.json) proves the planner paused with zero receipts and zero spend after the approved provider changed from 0.001 to 0.004 HBAR per repository. That export does not include an accepted signature or resumption. The [expired-approval negative check](evidence/2026-09-08-expired-approval.json) returned HTTP 400, retained mandate version 1, and recorded zero receipts. It establishes rejection of an expired request, not a signed approval.

| Requirement | Actual implementation and evidence | Remaining gate |
|---|---|---|
| Ledger Agent Stack / wallet-cli ring central | Broker decrypts its inference/Hedera bundle through a disclosed adaptation of upstream Ring commands and the real staging SDK. [Ring execution evidence](../tools/ledger-speculos/ring-evidence.json); [paid workflow](evidence/2026-09-08-first-paid-run.md). | Ledger must confirm whether Speculos plus the source adapter satisfies the bounty. This is not the stock CLI binary or physical-device security. |
| Agent uses secrets without receiving raw keys | Fixed broker capabilities; the model receives no inference key, payer key or capability token. | Production OS isolation and trusted broker operation remain deployment responsibilities. |
| Human approval before escalation | Exact expiring message, pinned controller, version/nonce/signature validation and retained authorization proofs implemented. Real harmless Ethereum emulator signing verified. | [Actual signed escalation and post-approval Hedera settlement](evidence/2026-09-08-approved-price-increase.md) are exported. Arc verification became uncertain; reconcile before retry. Recording remains. |
| New work during event | New implementation history and [AI/prior-work disclosure](ai-disclosure.md). | Organizer determination for the September 3 concept paper. |
| Ledger tooling feedback | [Actual emulator/SDK experience, reproducible environment and exact sponsor question](ledger-feedback.md). | Team review and external delivery; physical hardware experience is not claimed. |
| Live x402-gated Hedera service | Metered repository API executes actual native HBAR x402 requests. | [Public HTTPS challenge and paid purchase verified](evidence/2026-09-08-public-data-purchase.md). Mac/tunnels must remain online. |
| Blocky402 settlement and consuming agent | Real paid request with [Hedera receipt](https://hashscan.io/testnet/transaction/0.0.7162784%401788889605.646083348) and saved export. | A later [public data-only purchase](evidence/2026-09-08-public-data-purchase.md) also settled; it paused before inference/Arc. |
| Public repository, setup, architecture and payment flow | [saiisback/obolos](https://github.com/saiisback/obolos), README and setup docs. | Keep deployment URL and latest evidence synchronized. |
| Arc + USDC + Circle Agent Stack | Circle Agent Wallet CLI paid actual canonical USDC on Arc testnet; [Arc receipt](https://testnet.arcscan.app/tx/0x4d97395a52897a1b9c1255b1a9ba8023cec742ef64cb838a65962001930b81fe). | No extra Circle API-key path, Nanopayments or Paymaster is claimed. |
| Decision logic tied to real signals | Quotes, provider allowlist, expiry, separate currency budgets and current evidence drive the workflow. | Actual increase, zero-spend pause, signed mandate version 2 and resumed Hedera settlement exported. Arc reconciliation and recording remain. |
| Working frontend/backend and diagram | Next.js console, broker, data service and first paid HTTP workflow; [visible SVG diagram in the presentation](presentation/index.html#slide-3). | Public service and final narrated product recording. |
| Video and presentation | [Seven-slide browser/printable deck](presentation/index.html), [talk track](presentation.md), [demo script](demo-script.md). | [Narrated edited evidence demo](presentation/obolos-testnet-demo.mp4) combines actual saved app views and recorded emulator signing. Includes a [fresh public request visibly executing](evidence/2026-09-08-final-recorded-public-purchase.md). Separate runs are explicitly labeled; it is not a single continuous two-rail recording. |

### Approved escalation with a pending Arc transfer

A fresh [approved price-increase run](evidence/2026-09-08-approved-price-increase.md) records the user-authorized Speculos signature, backend acceptance of mandate version 2, and a settled **0.008 HBAR** purchase after the increase. The report was generated. Its **0.05 USDC Arc verification attempt became uncertain**, with a 50,000 micro-USDC pending reservation and no confirmed Arc receipt for this run. Reconciliation is required before any retry. This partial run does not replace the earlier complete two-rail run.

### Public deployment

[obolos.app](https://obolos.app) and its `/x402` service completed a [public paid one-record request](evidence/2026-09-08-public-data-purchase.md) for 0.001 HBAR. This separate run paused before inference/Arc. Vercel currently proxies through temporary Cloudflare tunnels to persistent Mac processes; the Mac and tunnels must remain online. Durable VPS deployment remains separate.

## Submission package

- [x] Public GitHub URL with source, setup, architecture and AI attribution.
- [x] Completed live export with both confirmed transaction IDs.
- [x] HashScan and ArcScan receipt links attached to the first paid run.
- [x] Real Ledger staging Ring enrollment, encryption/decryption and negative checks under disclosed Speculos mode.
- [x] Presentation artifact with visible architecture, product flow, track roles, evidence links and trust boundaries.
- [x] Developer feedback and sponsor/organizer questions drafted from actual execution.
- [x] Public HTTPS Hedera data service at https://obolos.app/x402, recorded unpaid challenge and actual paid request.
- [x] Live quote increase, Speculos controller approval and resumed Hedera purchase exported with signature.
- [ ] Reconcile the uncertain Arc verification transfer in the escalation run; its pending reservation must remain intact.
- [x] Recorded actual Speculos signing and disclosed the partial escalation outcome in the narrated demo.
- [ ] Deployment with broker OS isolation, durable journals and continuing availability for review.
- [ ] Developer feedback sent by the team; sponsor response on emulator/source-adapter eligibility recorded.
- [x] Narrated edited application/evidence demo with synthetic voice disclosed; includes actual recorded Speculos signing.
- [x] Finalized actual screen recording of a fresh public x402 paid request: mandate, discovery, purchase and settled receipt visible.
- [ ] Team review/upload of the narrated video and submission package.
- [ ] Organizer determination of the disclosed prior-paper eligibility.

No physical Ledger was used. Do not mark a physical demonstration complete from emulator execution. The [prepared sponsor question](ledger-feedback.md#exact-sponsor-question--ready-to-send) requests a clear determination of what additional evidence, if any, is required.

## Trust boundaries and optional features

Only payments settle on-chain. Inference, deterministic orchestration/verifier, capability broker, Blocky402, Circle infrastructure and the local journal remain off-chain. Circle uses its separate MPC/session infrastructure; Ring does not hold or sign the Circle wallet key. The broker holds plaintext secrets in memory while using them. The local audit hash chain is not publicly anchored or tamper-proof against a compromised host.

HBAR and USDC budgets are independent; there is no bridge or atomic cross-chain settlement. Caps constrain payment principal, not gas fees. The verifier checks source integrity, freshness, coverage and structure; it does not independently certify every generated narrative claim.

Implemented extra-credit directions: per-repository metering (one, two or three records) and discoverable provider directory. The pricing tiers belong to one service, not independent businesses. Optional protocols not claimed: A2A/ACP, ERC-8004/HCS-14, UCP, HCS audit anchoring, Scheduled Transactions, streaming, custom HTS fee schedules, Circle Nanopayments or Paymaster.

Connections readiness and positive balances establish configuration observations, not successful transactions. Saved live receipts and verified authorization records supply execution evidence. Keep the historical checks below distinct from current paid-run evidence.

## Historical local verification — September 7, 2026

- `npm test`: **79 tests across 11 files passed** after the final implementation and Ledger CLI dependency change.
- `npm run typecheck` and `npm run build`: passed, including the new `/api/live` route.
- `npm run test:smoke`: passed the rehearsal HTTP workflow, unauthenticated wallet visibility restrictions, saved simulated authorization export, CSRF and ownership checks.
- Browser inspection confirmed the Connections screen renders its operator gate, nine unresolved setup/evidence checks, official links, and zero real-payment counters without fabricated balances.
- `npm run preflight`: correctly exits 1 because the real environment files, wallet configuration and Ring password have not been supplied. This expected result is an honest incomplete setup report.
- Local official Ledger Wallet CLI 2.1.0 version and `ring decrypt --help` succeeded. No hardware provisioning or signing command was executed.
- Independent review resolved the authorization-proof retention, approval-download format and overstated verifier wording findings; see [track audit](reviews/track-audit.md).
- Public repository published to `saiisback/obolos` on `main` with the complete implementation history.
- No live payment, Circle login, physical device operation, public service deployment or video is established by these checks.

## Historical local verification checkpoint

The following September 7, 2026 record predates the new live Connections/readiness and saved-authorization additions. It is preserved as earlier evidence, not a claim that the current changes have been reverified:

- `npm test`: **62 tests across 7 files passed**.
- `npm run typecheck`: passed; `npm run build`: successful production build without the earlier private-path tracing warnings.
- `npm run test:smoke`: passed against the running application. Covered signed session, hostile-origin rejection, unauthenticated live rejection, malformed repository, pause/resume, price shock, approval, completed report, exactly two simulated receipts, export and owner isolation.
- Parent browser check at 1280×720: created a manual run; raised actual rehearsal quotes from 0.001/0.0012 to 0.004/0.0045 HBAR; observed an approval pause with zero receipts/spending; approved mandate version 2; automatic execution completed with 3 evidence records, 4 structural checks, 0.012 HBAR and 0.05 USDC simulated receipts. Report, receipt inspector, directory and export controls worked.
- Mobile at 390×844: navigation and mandate form accessible, no document horizontal overflow. Corrected illustration/headline overlap and visually rechecked. Subagent verified navigation focus trapping/restoration and receipt inspector focus/Escape behavior; parent confirmed drawer focus and live actions disabled until configured.
- Independent security review findings corrected and re-reviewed; see `docs/reviews/security-review.md`.
- Dependency audit after compatible overrides: 0 high/critical, 7 moderate and 9 low advisories remain.

This historical checkpoint does not establish funded transactions, account login, physical hardware approval or video recording. The public repository was published in the current checkpoint. The new read-only preflight, wallet view and saved proof surfaces also do not supply those external records. These local checks do not complete the unchecked submission gates above.

Use the [live setup guide](live-setup.md) to prepare credentials locally. Append a separate current verification record after running the new checks; do not mark external gates complete from a successful preflight.

## Sources

- https://ethglobal.com/events/ethonline2026/info/details
- https://ethglobal.com/events/ethonline2026/prizes
- https://developers.ledger.com/ethonline
- https://developers.ledger.com/docs/ai-tools/ledger-cli
- https://blocky402.com/docs/testnet/
- https://developers.circle.com/agent-stack/agent-wallets/quickstart
