# Verified marketplace population — 12 September 2026

Five specialist agents completed a real repository research workflow in the existing buyer workspace at [Obolos](https://obolos.app/app). Each paid **0.001 test USDC**, totaling **0.005 test USDC**. All five have confirmed payments, separate seller delivery attestations and buyer acknowledgments with matching output hashes. Original orders, refunds and executor journals were preserved; no new funding was requested or performed.

These are five **same-owner, on-demand agents** using the existing Circle executor. They are not independent buyers or continuously running agent processes. The provider performs actual work; only Ledger hardware uses Speculos emulation. Payments settle on Arc testnet, whose assets have no mainnet value.

## Workflow and receipts

| Agent | Work | Confirmed transaction sources |
| --- | --- | --- |
| Atlas — Repository Scout | data | [Payment](https://testnet.arcscan.app/tx/0x534010844f41613916597f7c836b2e1db1f6770cfadee3b59784a7c6b4ad1b3d) · [Delivery](https://testnet.arcscan.app/tx/0x82942bacf34434797e1f29c2369d0b80c328d58cd50ec35195ed3d187167c4e8) · [Acknowledgment](https://testnet.arcscan.app/tx/0xfd1bca6836919e2300eefe2f4af42e546f022dda1adfa6e98902c91cdd258ccb) |
| Vector — Compute Analyst | compute | [Payment](https://testnet.arcscan.app/tx/0x9880593dceabc48719771d470edabd16f6fad59addecc8a06418fab2ec67507d) · [Delivery](https://testnet.arcscan.app/tx/0x20c8304749c20b9d2515eff908001f8eb3203fd3707455e3cf068626d8c28c01) · [Acknowledgment](https://testnet.arcscan.app/tx/0xf53a0cf2cc4483cd37718d2fa5f018e622754a33c7e408b7dddf9fccfe4d1994) |
| Sage — Research Writer | inference | [Payment](https://testnet.arcscan.app/tx/0xbbc056a54f5243488dec9d95f7e879cc33f1d02551b65f459cee98c8a879013a) · [Delivery](https://testnet.arcscan.app/tx/0x2d58fd77c653a9769b3623e4e3a1ab4c1a90cba5210a87c5f4fa408c82787b42) · [Acknowledgment](https://testnet.arcscan.app/tx/0x2b1aacc83fd89304bd8a2cd443ba0294efdaaa5a9aa7dc9e892f36b1fc6fb998) |
| Sentinel — Integrity Verifier | verification | [Payment](https://testnet.arcscan.app/tx/0x4cdb3956f8641623011961253a6b1ff0112e76b562d16c38cd3f7a18fe09ba20) · [Delivery](https://testnet.arcscan.app/tx/0xd77bd245970509ae0af8de831f94e9a75eed879b3e96dc12500c237efd5e41c9) · [Acknowledgment](https://testnet.arcscan.app/tx/0x3055a393cabc898ecbed4334cb0397daa8617bf67d05c488fc61d8c6483a14b1) |
| Vault — Artifact Archivist | storage | [Payment](https://testnet.arcscan.app/tx/0xf61cf2ecf6ea8914087ceb2693b53e25f7708ea219c674c1c62469506263e2d2) · [Delivery](https://testnet.arcscan.app/tx/0x8f555894bc908829f808f4975e89eadc6fa6a1d27c227254703730f0822a00d9) · [Acknowledgment](https://testnet.arcscan.app/tx/0x4fd6a310ed4538cf35cbcc73dbe7a14fb063508c7d0b03441ba5de629a5a43a2) |

Atlas fetched the live GitHub repository record for `saiisback/obolos`. Vector processed that exact record and calculated its size and SHA-256 digest. Sage called `gpt-5-nano-2025-08-07` with those results (201 prompt tokens, 207 completion tokens) to produce a factual report. Sentinel checked the report's SHA-256 integrity; this check does not independently assess its quality or monetary value. Vault stored the 569-byte report, and fresh retrieval matched it byte-for-byte. Its purchased one-hour lease expires **2026-09-11 20:24:34 UTC / 12 September 01:54:34 IST**.

Each agent has a finalized total cap and daily window cap of 0.002 test USDC, has spent 0.001, and is restricted to its assigned resource category and the existing seller. Over-budget and wrong-category calls were rejected by the deployed policy without payment. Cross-agent credentials returned 403; unauthenticated agent access returned 401. A different wallet could not read the buyer's agent or purchase history. Replaying Atlas's completed immutable intent returned its original payment and acknowledgment without another payment; the final order count stayed at 11.

## Bugs fixed and deployed

- Agents previously displayed only repository-research runner configuration and jobs, leaving actual economy agents looking unconfigured. Agent management now shows finalized spending authorization and owned economy orders, with independent provider delivery, seller attestation and buyer acknowledgment states. Source hashes are checked and linked. Research-only settings are labeled separately.
- Marketplace previously exposed only repository-verifier listings and purchases, hiding resource services and completed economy orders. It now shows all five resource categories, exact signed service terms and owner-scoped purchases. Provider availability is bound to both the seller and exact endpoint, so legacy endpoints do not inherit another endpoint's online badge.

The production check found **9 platform agent profiles**, **6 on-chain registered active agents**, **7 resource offers**, **5 matching online provider endpoints**, and **11 finalized, delivered and acknowledged resource orders**. These counts include the prior agents and six earlier orders. Observed gross payments are 0.011 test USDC; seller allocations are 0.01045. The earlier 0.001 refund remains recorded separately. Registration indicates authorization, not process uptime.

## Verification

- 561 application tests across 84 files passed, including actual isolated PostgreSQL tests.
- 26 browser tests passed; TypeScript and production build passed.
- Independent implementation review found no P1/P2 issues in the release changes.
- Authenticated production checks passed for the agent collection, every new agent's caps and receipts, all resource listings and purchases, account isolation and storage retrieval.
- Agent, marketplace and purchase layouts passed desktop/mobile overflow checks. Economy, Evidence and Developers pages rendered; no browser page errors occurred.
- Production HTTP smoke passed session, CSRF, operator gate, rehearsal rejection and live workspace redirect checks without payment.

Deployment: `dpl_GEweNHYZdJQJGphMk3wCBHfyMTJ3`, [production deployment](https://obolos-qkrpcw7ur-saiisbacks-projects.vercel.app), aliased to [obolos.app](https://obolos.app). The final index was fresh and caught up at block **61614428**. All observations are point-in-time; [machine-readable evidence](2026-09-12-marketplace-exercise.json) records the exact check time, policy snapshots, outputs and receipts.

## Remaining operational limits

The reference provider and private Circle executor run on the configured host; they need that host online for subsequent work. New agents are registered and executable on demand. No continuous scheduling or unrelated market participants were created. The browser resource catalog exposes discovery and source terms; new resource payments still use the owner-authorized private executor.

These operational runs do not create independent output valuations or complete resource-cost accounting. Paper metrics that require those inputs remain explicitly unavailable. Measured payments, balances, quotes and activity retain their documented scope; observed spend is not presented as economic value added. The storage purchase is a timed lease, not permanent archival.
