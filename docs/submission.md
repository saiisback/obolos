# ETHOnline 2026 submission evidence matrix

Targets: Ledger **AI Agents x Ledger**; Hedera **AI & Agentic Payments**; Arc **Best Agentic Economy Application with Circle Agent Stack**. One project, three partner selections. Multiple tracks for the same partner count once. This is a coverage map, not confirmation of eligibility or qualification. Implementation and external demonstration are recorded separately.

## Required evidence

| Requirement | Implemented surface | Evidence status / remaining gate |
|---|---|---|
| Ledger Agent Stack and wallet-cli ring central | Broker's encrypted secret bundle and scoped capabilities | Code implemented; physical provisioning and real upstream call still require operator device/credentials |
| Agent never receives raw API key | Separate broker, fixed model operation, no model tools | Architectural restriction and tests; production OS isolation still must be configured |
| Human Ledger approval before escalation | Exact approval JSON, hardware signing script, backend signature/nonce/expiry validation and saved `run.authorizations` proofs | Code implemented; only a live signer/signature record counts as a controller proof, and a physical Ledger recording is still required |
| Start new during event | New implementation commit history and AI/prior-work disclosure | Prior September 3 paper eligibility must be resolved with organizers |
| Ledger tooling feedback | `feedback.md` | Code-integration feedback recorded; append actual hardware experience after device run |
| Live Hedera x402-gated service | Public data service discovery/quote/evidence endpoints | Local unpaid challenge verified; public HTTPS deployment remains |
| Blocky402 settlement | Fixed hosted testnet facilitator + native exact Hedera adapter | Supported endpoint verified; actual paid request still required |
| Consuming agent end-to-end payment | Planner → broker → x402 service → receipt | Rehearsal and boundary tests; live funded run remains |
| Public GitHub and setup/architecture/payment README | This repository and architecture diagram | Published at [saiisback/obolos](https://github.com/saiisback/obolos) with implementation history |
| Arc + USDC + Circle Agent Stack | Email-OTP agent-wallet CLI path, canonical USDC transfer and exact on-chain check | Code implemented; operator login/funding and actual Arc transfer remain; no Circle API key path is claimed |
| Decisions tied to real signals | Cheapest allowed quote, price refresh, caps, expiry | Tested with controlled quotes; live price-shock demonstration remains |
| Working frontend and backend | Foundation-referenced Next console, run controls, Connections wallet/readiness view, routes, broker and service | Current local tests/build/HTTP workflow and Connections browser check passed; live funded deployment still remains |
| Inspectable wallets and setup coverage | Operator-only public addresses, recipients, exact balance strings, sources/timestamps, explorers/faucets and recorded evidence counts | Implemented read-only view; positive balances/configuration do not establish settled service payments |
| Architecture diagram | README Mermaid diagram | Present; include in presentation |
| Video and presentation | `docs/demo-script.md` and `docs/presentation.md` | Script provided; actual narrated recording remains |

## What the Connections checklist proves

Readiness combines operator authentication, broker health, controller configuration, service identity, wallet snapshots and this browser's saved run history. It labels unresolved work as missing/action-required. HBAR and USDC remain separate; an unavailable network read is not a zero balance. Live payment counters exclude simulated receipts, and Ledger counters require saved live signatures/signers. A count does not replace transaction inspection, a device recording or organizer review.

An accepted live escalation retains the exact message, nonce, signer/signature, verification time and both mandates in the export after the pending request is consumed. It establishes the application's signature check, not hardware provenance by cryptography alone. The physical controller must still be demonstrated.

Only payments settle on-chain. The worker model, deterministic planner/verifier, capability broker, Blocky402 facilitator, Circle wallet infrastructure and local audit journal remain off-chain dependencies. The verifier performs structural/source consistency checks; it is not a third-party audit or certification of all model prose. Neither report digest anchoring nor fully decentralized orchestration is claimed.

## Extra-credit choices

Implemented: per-repository metering instead of a constant request price; public discovery directory with prices and invocation endpoints. Different requests can purchase one, two or three repository units. These are two pricing tiers of one service, not independent real companies.

Not implemented/claimed: A2A/ACP negotiation, ERC-8004/HCS-14 identity, UCP, HCS anchoring, Scheduled Transactions, streaming payments, custom HTS fee schedules, Circle Nanopayments or Paymaster. These are optional under the selected tracks.

## Submission package

- [x] Public GitHub URL with incremental history, specs/plans and AI attribution: https://github.com/saiisback/obolos.
- [ ] Public HTTPS Hedera data-service URL and unpaid 402 reproduction command.
- [ ] Export of a LIVE job containing both confirmed receipt transaction IDs and the saved authorization proof when an escalation was demonstrated.
- [ ] HashScan and ArcScan URLs matching amount, recipient and testnet.
- [ ] Physical Ledger Key Ring provisioning and approval demonstration.
- [ ] Deployment with broker OS isolation and durable journals.
- [ ] Actual device feedback appended to `feedback.md`.
- [ ] 2–4 minute narrated video; do not exceed 4 minutes even though Hedera says ≤5.
- [ ] Presentation with diagram, product flow, sponsor usage and trust boundaries.
- [ ] Organizer determination of prior-paper eligibility.

Deadline: September 13, 2026 at 12:00 EDT / **21:30 IST**.

## Current local verification — September 7, 2026

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
