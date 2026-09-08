# Public HTTPS data purchase

[Obolos is publicly accessible](https://obolos.app). Public data-service origin: `https://obolos.app/x402`.

Run `0bd729c3-be2c-4637-b40e-7e6f5851fdb2` purchased one repository record for **0.001 test HBAR** through the public HTTPS endpoint and hosted Blocky402. [Hedera receipt](https://hashscan.io/testnet/transaction/0.0.7162784%401788891734.336478878). The unpaid x402 v2 challenge identifies native HBAR (`0.0.0`), testnet, recipient `0.0.10425234`, fee payer `0.0.7162784` and an amount of 100,000 tinybar. [Sanitized export and challenge](2026-09-08-public-data-purchase.json).

This run was paused before inference and Arc. It establishes a real public paid data request, not another completed verification workflow. The separate pending Arc reservation from the approved escalation run was not bypassed or cleared.

The current deployment routes Vercel requests through two temporary Cloudflare tunnels to persistent app/data processes on the Mac. **The Mac and tunnels must stay online.** This is public HTTPS availability verified at the recorded check time, not durable VPS hosting or an availability guarantee. No credential-bearing files are included in the exported evidence.
