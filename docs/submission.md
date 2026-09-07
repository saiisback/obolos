# ETHOnline 2026 submission evidence matrix

Targets: Ledger **AI Agents x Ledger**; Hedera **AI & Agentic Payments**; Arc **Best Agentic Economy Application with Circle Agent Stack**. One project, three partner selections. Multiple tracks for the same partner count once. No optional extra is represented as completed without evidence.

## Required evidence

| Requirement | Implemented surface | Evidence status / remaining gate |
|---|---|---|
| Ledger Agent Stack and wallet-cli ring central | Broker's encrypted secret bundle and scoped capabilities | Code implemented; physical provisioning and real upstream call still require operator device/credentials |
| Agent never receives raw API key | Separate broker, fixed model operation, no model tools | Architectural restriction and tests; production OS isolation still must be configured |
| Human Ledger approval before escalation | Hardware signing script + backend signature/nonce/expiry check | Cryptographic tests; physical Ledger recording still required |
| Start new during event | New implementation commit history and AI/prior-work disclosure | Prior September 3 paper eligibility must be resolved with organizers |
| Ledger tooling feedback | `feedback.md` | Code-integration feedback recorded; append actual hardware experience after device run |
| Live Hedera x402-gated service | Public data service discovery/quote/evidence endpoints | Local unpaid challenge verified; public HTTPS deployment remains |
| Blocky402 settlement | Fixed hosted testnet facilitator + native exact Hedera adapter | Supported endpoint verified; actual paid request still required |
| Consuming agent end-to-end payment | Planner → broker → x402 service → receipt | Rehearsal and boundary tests; live funded run remains |
| Public GitHub and setup/architecture/payment README | This repository and architecture diagram | Files provided; public remote URL remains |
| Arc + USDC + Circle Agent Stack | Agent Wallet CLI transfer and exact onchain check | Real adapter implemented; funded Arc transfer remains |
| Decisions tied to real signals | Cheapest allowed quote, price refresh, caps, expiry | Tested with controlled quotes; live price-shock demonstration remains |
| Working frontend and backend | Next console, routes, policy store, broker and service | Local build/browser verification recorded below |
| Architecture diagram | README Mermaid diagram | Present; include in presentation |
| Video and presentation | `docs/demo-script.md` and `docs/presentation.md` | Script provided; actual narrated recording remains |

## Extra-credit choices

Implemented: per-repository metering instead of a constant request price; public discovery directory with prices and invocation endpoints. Different requests can purchase one, two or three repository units. These are two pricing tiers of one service, not independent real companies.

Not implemented/claimed: A2A/ACP negotiation, ERC-8004/HCS-14 identity, UCP, HCS anchoring, Scheduled Transactions, streaming payments, custom HTS fee schedules, Circle Nanopayments or Paymaster. These are optional under the selected tracks.

## Submission package

- [ ] Public GitHub URL with incremental history, specs/plans and AI attribution.
- [ ] Public HTTPS Hedera data-service URL and unpaid 402 reproduction command.
- [ ] Export of a LIVE job containing both confirmed receipt transaction IDs.
- [ ] HashScan and ArcScan URLs matching amount, recipient and testnet.
- [ ] Physical Ledger Key Ring provisioning and approval demonstration.
- [ ] Deployment with broker OS isolation and durable journals.
- [ ] Actual device feedback appended to `feedback.md`.
- [ ] 2–4 minute narrated video; do not exceed 4 minutes even though Hedera says ≤5.
- [ ] Presentation with diagram, product flow, sponsor usage and trust boundaries.
- [ ] Organizer determination of prior-paper eligibility.

Deadline: September 13, 2026 at 12:00 EDT / **21:30 IST**.

## Local verification

Verified September 7, 2026:

- `npm test`: **62 tests across 7 files passed**.
- `npm run typecheck`: passed; `npm run build`: successful production build without the earlier private-path tracing warnings.
- `npm run test:smoke`: passed against the running application. Covered signed session, hostile-origin rejection, unauthenticated live rejection, malformed repository, pause/resume, price shock, approval, completed report, exactly two simulated receipts, export and owner isolation.
- Parent browser check at 1280×720: created a manual run; raised actual rehearsal quotes from 0.001/0.0012 to 0.004/0.0045 HBAR; observed an approval pause with zero receipts/spending; approved mandate version 2; automatic execution completed with 3 evidence records, 4 structural checks, 0.012 HBAR and 0.05 USDC simulated receipts. Report, receipt inspector, directory and export controls worked.
- Mobile at 390×844: navigation and mandate form accessible, no document horizontal overflow. Corrected illustration/headline overlap and visually rechecked. Subagent verified navigation focus trapping/restoration and receipt inspector focus/Escape behavior; parent confirmed drawer focus and live actions disabled until configured.
- Independent security review findings corrected and re-reviewed; see `docs/reviews/security-review.md`.
- Dependency audit after compatible overrides: 0 high/critical, 7 moderate and 9 low advisories remain.

No funded transactions, account login, physical hardware approval, public publishing or video recording has been performed by the coding run. These local checks do not complete the unchecked submission gates above.

## Sources

- https://ethglobal.com/events/ethonline2026/info/details
- https://ethglobal.com/events/ethonline2026/prizes
- https://developers.ledger.com/ethonline
- https://developers.ledger.com/docs/ai-tools/ledger-cli
- https://blocky402.com/docs/testnet/
- https://developers.circle.com/agent-stack/agent-wallets/quickstart
