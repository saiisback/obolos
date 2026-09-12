# Workspace UI and end-to-end verification — 12 September 2026

The updated workspace is deployed at [Obolos Economy](https://obolos.app/app/economy). Production deployment `dpl_ADW8HWB6x2hhbGs9ZynsczRwY8AE` is aliased to `obolos.app`.

## UI and bugs fixed

- Economy uses a clearer payment ledger, distinct settlement/delivery/acknowledgment counts, balance context and flat 2D vector illustrations. The existing monochrome/coral identity now includes muted mint, blue and warm surfaces, with no added shadows or fictitious trend charts.
- Agents use a responsive two-column collection; Marketplace uses category illustrations and clearly visible per-order prices. Mobile payment amounts, service prices and receipt links appear in the first viewport. Exact periods, executor instructions and indexing explanations remain accessible through native details.
- Evidence previously read only repository research jobs and could incorrectly imply that a resource agent had no execution history. It now shows owned resource orders and source receipts alongside accurately labeled research history. Switching agents immediately clears the prior agent's data and aborts abandoned requests.
- A finalized but stale snapshot previously retained a reassuring status. Staleness and refresh failure are now explicit; saved data remains visible. Manual and periodic requests are serialized so a slower request cannot replace a newer response. Background checks pause while the page is hidden and resume on return.
- Empty totals after UTC rollover now explain the period boundary and link to lifetime activity. Missing basket/accounting data stays unavailable without crashing or inventing values.
- `/economy` previously returned 404. It now redirects to the authenticated `/app/economy` workspace.

## Fresh real workflow

Five same-owner specialist agents completed a second actual data → compute → inference → verification → storage workflow. Each paid 0.001 test USDC, for **0.005 test USDC in principal** in this pass. No budgets were reset or increased, and no new funding was performed. The existing immutable transaction journals were preserved; round-two intents and order IDs are distinct from the first round.

| Agent | Work | Finalized sources |
| --- | --- | --- |
| Atlas — Repository Scout | data | [Payment](https://testnet.arcscan.app/tx/0xd5009547afd6d124c7989153d36738790066aab731ca4c2346fca7fe4d1a0c73) · [Delivery](https://testnet.arcscan.app/tx/0xff1cab73de89f722c4318a06c5a4bc3e9dd58d078aa09cf842d3583d14dd7de1) · [Acknowledgment](https://testnet.arcscan.app/tx/0xc660deaebc329f04448d2aae5cf297031f02f48caa203766ee69cc463683eac0) |
| Vector — Compute Analyst | compute | [Payment](https://testnet.arcscan.app/tx/0x768559f45367db393eaf1398bf26d633d3b4e720c41c7d8ab9731cd5b26a41e9) · [Delivery](https://testnet.arcscan.app/tx/0xc32ae42b35d8885eae163d2b0c21bf0a9e64c11b6413e7fc9fd15cfd27a076d8) · [Acknowledgment](https://testnet.arcscan.app/tx/0x7e2eace9ff80a0cc4391300f81b6709c2661df3e483e81bd49542d28c704529e) |
| Sage — Research Writer | inference | [Payment](https://testnet.arcscan.app/tx/0xf1790c8fb3d4ba70fea1192f4973e6c60743c322257a835b8d8944bee5625708) · [Delivery](https://testnet.arcscan.app/tx/0xf16b81b74ad97bfcfab27bee316eb5e7c9c450fdea579b2d30302e32c0cc1b1e) · [Acknowledgment](https://testnet.arcscan.app/tx/0x0d27013f47ea9331b1c2d631860d662b000058dedaaad4e3714496ea33f17c72) |
| Sentinel — Integrity Verifier | verification | [Payment](https://testnet.arcscan.app/tx/0x7d234a6df334e7b5625be77b1f92200db768caba0e805c305c3a7e36f5783d37) · [Delivery](https://testnet.arcscan.app/tx/0x94fc828d1bd05fc202658212f80616bd838ce0bd2c5e8b399e351d1cfa1f7115) · [Acknowledgment](https://testnet.arcscan.app/tx/0x439341fd8c01be26db46e1a9cbdf099b3ea560ad90b6d449020b7342f9306378) |
| Vault — Artifact Archivist | storage | [Payment](https://testnet.arcscan.app/tx/0x879cd9fc7cd412764181d1be93b8cd363d8916cc1920f401b4c71e565c188193) · [Delivery](https://testnet.arcscan.app/tx/0xcb681cf7cd26e67bc11ea6a8d79bc881fcf4fef0516fec0fc5a036c62fd8f31f) · [Acknowledgment](https://testnet.arcscan.app/tx/0xdec849346f7d923a0ae3bc9d1de02684c72976c3bb4ca2708c265e3727aa1a30) |

Atlas fetched live GitHub repository data at 2026-09-12 16:55:33 UTC. Vector processed that exact record. Sage called `gpt-5-nano-2025-08-07` (198 prompt tokens, 193 completion tokens). Sentinel checked the resulting report's SHA-256 integrity, without claiming an independent quality assessment. Vault stored the 506-byte report; subsequent retrieval matched it byte-for-byte. The new one-hour lease expires **2026-09-12 18:07:10 UTC / 23:37:10 IST**. The first round's expired lease was separately verified to reject retrieval with `STORAGE_NOT_FOUND`.

The final live check observed **16 total resource orders**, five payments today totaling **0.005 test USDC**, lifetime gross payments of **0.016 test USDC**, seven resource offers and matching receipts for both orders of every specialist. The index was fresh and caught up at block **61762183**. Authenticated manual refresh succeeded without invoking a wallet. The UI's figures changed from zero payments at the start of the UTC-day check to five completed payments after this actual work.

## Verification and edge cases

- **561 application tests across 84 files passed**, including real isolated PostgreSQL tests. One concurrency test hit its five-second timeout during simultaneous application, browser and contract load; a fresh full run with two workers passed all tests in 31.53 seconds. No production code was weakened to accommodate the timeout.
- **38 browser tests passed** after the final changes, including desktop/mobile layouts, owner/agent switching, out-of-order responses, stale data, failed refresh with preserved values, UTC rollover, incomplete measurements, pending delivery, receipt mismatch, empty histories, and read-only recovery.
- The executable EVM contract suite, TypeScript, production build, and production HTTP smoke passed.
- Replaying the second Atlas job after its allowance was fully used returned the original payment and acknowledgment, with no new payment and 16 total orders afterward.
- Actual deployed guards rejected cross-agent keys, unauthenticated access, oversized spending and wrong categories without submitting payment. The operation lock also rejected an overlapping command while a live operation was active.
- Independent code review found no material auth, order identity or race regression. Visual review identified one mobile density issue; its bounded fix passed the final review (`disposition: ship`). The design detector returned no findings.
- Authenticated production checks verified final policy caps/spend, all new receipts, Economy period switching, Marketplace listings and purchase counts, Evidence orders, mobile layout and fresh storage retrieval. No browser page errors occurred.

[Machine-readable checks, measurements, outputs and receipts](2026-09-12-workspace-design.json).

## Operational boundaries

Only Ledger hardware is emulated; the GitHub fetch, model call, compute, integrity check, storage and Arc testnet transactions are real. Both existing Speculos apps responded ready, and the reference provider reported online. Test fixtures and local contract tests remain isolated from runtime data.

These are owner-operated, on-demand agents. After two paid orders apiece, each specialist has used its **0.002 test USDC total allowance**. Further paid jobs need explicit updated owner limits; this pass did not create indefinite execution or renew those limits. The provider and private executor still depend on the configured host being online.

Operational completion and observed transfers do not supply independent output valuations or complete resource-cost accounting. Paper metrics requiring those inputs remain honestly pending. No fake market participants, invented historical data, or unsupported valuations were added. The new storage purchase is a timed lease, not permanent retention.
