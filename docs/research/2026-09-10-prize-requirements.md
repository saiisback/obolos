# Current prize requirements: Obolos

Checked 10 September 2026 against live first-party pages. This note separates published requirements from eligibility decisions and implementation evidence. No organizer was contacted, no submission was uploaded, and no payment was initiated for this research.

## What changed or needs attention

1. **Arc's requested agentic prize is now $3,500, with $2,500 conditional on the same project reaching Arc Mainnet by September 30.** This replaces the earlier $1,667 figure; testnet does not satisfy the mainnet condition. [Arc prize page](https://ethglobal.com/events/ethonline2026/prizes/arc)
2. **The event video limit is 2–4 minutes**, stricter than Hedera's maximum of five minutes. The existing synthetic-narration preview cannot be the final submission. [Event submission rules](https://ethglobal.com/events/ethonline2026/info/details)
3. **Speculos is official development tooling, but emulator-only prize acceptance is not explicitly granted in the reviewed Ledger track pages.** It demonstrates the software flow; it cannot establish physical device security. [Ledger event details](https://developers.ledger.com/ethonline), [Speculos README](https://github.com/LedgerHQ/speculos)
4. **The September 7 code start itself is compatible with the published September 4 event start.** The unresolved prior-work issue is the September 3 project-specific paper already disclosed in this repository. [Ledger event dates](https://developers.ledger.com/ethonline), [local disclosure](../ai-disclosure.md)

## Hedera: required versus optional

The AI & Agentic Payments category remains a $6,000 pool, with up to three $2,000 awards. Required: a public, live x402 service on Hedera testnet or mainnet using Blocky402 settlement; a consuming application completing a real paid call; public GitHub source with setup, architecture and payment-flow documentation; and an execution video no longer than five minutes. Testnet is explicitly acceptable. [Hedera prize page](https://ethglobal.com/events/ethonline2026/prizes/hedera)

Additional credit covers usage metering; A2A/ACP negotiation; ERC-8004/HCS-14 identity; UCP or discoverable directory; HTS/custom fees; HCS audit evidence; and scheduled recurring/streamed settlement. These are enhancements, not a requirement to implement every listed technology. [Hedera prize page](https://ethglobal.com/events/ethonline2026/prizes/hedera)

Audit implication: demonstrate the actual public paid repository-data service, its unit count, facilitator proof and consuming job. Keep inference-key usage distinct: the purchased data endpoint can be keyless even though the trusted broker separately uses a paid inference provider. The current code and live-payment evidence require independent assessment in the product audit.

## Arc: required versus conditional

The selected **Best Agentic Economy Application with Circle Agent Stack** category seeks decisions grounded in actual signals, autonomous Arc USDC payments and Agent Stack integration. Nanopayments, Paymaster and App Kits are contextual options. Required artifacts: functional frontend/backend, architecture diagram, video, presentation, Circle integration documentation, repository link and identified bounty. [Arc prize page](https://ethglobal.com/events/ethonline2026/prizes/arc)

By subtraction, $1,000 falls outside the mainnet condition; this interpretation does not guarantee an award. The separate $3,000 Continuity category requires Continuity registration and has a $2,000 mainnet condition. Do not silently switch categories. [Arc prize page](https://ethglobal.com/events/ethonline2026/prizes/arc)

Audit implication: distinguish genuine Circle USDC transaction evidence from funding/setup checks, and an orchestration role from an independently autonomous economic counterparty. A simple paid verifier can fit the payment direction while still being a limited marketplace product.

## Ledger: required integration and remaining uncertainty

The new-project category remains $3,500 split $2,000/$1,000/$500. It emphasizes device-backed trust, bounded secret access, safe payments and explicit approval. The preferred broker and remote-host directions specifically require Ledger Agent Stack and `wallet-cli ring`. A separate Continuity category exists for extending previous work. [Ledger prize page](https://ethglobal.com/events/ethonline2026/prizes/ledger)

The sponsor additionally requires tooling/DX feedback with actual experience, documentation gaps and concrete improvements. It values clear autonomy/approval boundaries, functional Ledger primitives and a reproducible repository or recorded walkthrough. Its event page lists September 4–16 and submission closure September 13. Neither that page nor the ETHGlobal Ledger prize page explicitly says that Speculos alone qualifies for the hardware-centered award. Acceptance therefore remains unconfirmed rather than proven or definitively rejected. [Ledger event details](https://developers.ledger.com/ethonline)

Official Speculos documentation supports hardware-free app testing and agent-controlled execution. Its README explicitly distinguishes emulator behavior and isolation from physical firmware. Those statements establish development legitimacy, not a hackathon exemption. [Speculos agent guide](https://speculos.ledger.com/user/agent.html), [Speculos README](https://github.com/LedgerHQ/speculos)

Official CLI documentation says Ring provisioning uses a device once; later encrypt/decrypt operations restore the trustchain over the network without a device. Therefore the absence of a device during each secret retrieval is normal for the Ring model. Whether the project's source adapter and emulated provisioning satisfy this prize is a separate question. [Ledger Wallet CLI documentation](https://developers.ledger.com/docs/ai-tools/ledger-cli)

Audit implication: present Speculos, staging protocol, source adapter and plaintext-in-broker-memory honestly. Existing feedback is in [ledger-feedback.md](../ledger-feedback.md). A valid account signature alone does not prove physical human confirmation.

## Shared submission and provenance rules

Up to **three partner organizations** can be selected; multiple categories under one partner count once. Thus Hedera, Ledger and Arc fit the limit. Deadline: **13 September 2026, noon EDT / 16:00 UTC / 21:30 IST**. Required video: 2–4 minutes, at least 720p, with no sped-up footage, phone recording or synthetic voiceover. Editing out waits is allowed. [Event submission rules](https://ethglobal.com/events/ethonline2026/info/details)

Classic requires project-specific code/design/assets to start during the event. Continuity requires disclosed earlier work and substantive event-time additions; partner eligibility varies. Preserve incremental history and reused-source attribution. AI use needs disclosure of assisted files/assets and meaningful human contribution. Spec-driven projects must include specs, prompts and planning artifacts. Judging evaluates technicality, originality, practicality, usability and impact of the demonstration. [Event submission rules](https://ethglobal.com/events/ethonline2026/info/details)

Local evidence: the first repository commit is `44185c9`, timestamp `2026-09-07T22:26:34+05:30`. The [AI disclosure](../ai-disclosure.md) says the supplied paper predates the event and contains architectural concepts. A fresh implementation and a rename do not resolve whether those concepts count as prohibited prior design. This is an organizer classification question; no affirmative determination is recorded here.

The repository's disclosure records human decisions on scope, architecture flow, UI direction and configuration, plus extensive AI implementation/review. Those are facts to explain, not grounds to invent additional human coding or claim that eligibility has already been approved.

## Audit handoff

The code/live-state audit should classify every criterion as demonstrated, implemented without current proof, pending artifact, optional enhancement, or externally unconfirmed. It should not collapse all of these into a percentage or a blanket “all tracks met.” Particularly verify final human narration, current public availability, all transaction receipts, precise Ledger provenance, prior-work classification and current documentation consistency.

Research limitations: the main ETHGlobal event homepage repeatedly timed out in this tool. Event-specific rules and all three sponsor prize pages loaded successfully; event start/end dates came from Ledger's official event page, while the precise submission deadline came from ETHGlobal. No private registration state or selected categories were inspected.
