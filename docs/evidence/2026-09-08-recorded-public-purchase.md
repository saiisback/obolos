# Public paid request — interrupted recording

Run `5aba28e9-6392-4e3b-9a0e-5ff676e47fa0` was created specifically to record a public data purchase. It bought one `sveltejs/kit` repository record for **0.001 test HBAR**, settled via the public Obolos x402 endpoint and Blocky402.

- [Hedera receipt](https://hashscan.io/testnet/transaction/0.0.7162784%401788892272.518998400)
- [Public execution export](2026-09-08-recorded-public-purchase.json)

The payment settled, but recording was interrupted before encoder finalization. The available clip does not establish a visible settlement transition and is excluded from the demo. The run was then paused before inference/Arc. It did not clear or bypass the separate uncertain Arc reservation. This request is distinct from the earlier public data-only purchase `0bd729c3-be2c-4637-b40e-7e6f5851fdb2`, the completed first two-rail run, and the partially completed escalation run.

Public deployment remains Vercel → temporary Cloudflare tunnels → persistent Mac processes; the Mac and tunnels must stay online. The export was scanned against private environment and local credential values before publication.
