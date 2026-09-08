# Approved price increase — partial paid execution

Run `61be389c-ab9a-4ea4-8b02-957aa4bd2b5e`, September 8, 2026. [Sanitized public export](2026-09-08-approved-price-increase.json).

The user authorized the spending increase in chat. The assistant reviewed the exact message and operated the Ethereum app in Speculos. The backend verified the signature from pinned controller `0xA7a1C8b8d1aa6c5B32aECB56F4396A353c5f81fa` at `2026-09-08T18:08:07.085Z`, retained the signature and both mandates, and advanced the mandate from version 1 to version 2.

- Repository unit ceiling: **0.001 → 0.004 HBAR**.
- Total evidence allowance: **0.002 → 0.008 HBAR**, for two repositories.
- Verification allowance: unchanged at **0.05 USDC**.
- Signed message explicitly identifies **Speculos emulation**, the run ID, nonce, expiry and complete proposed mandate. No physical Ledger security is claimed.

After approval, the resumed purchase settled **0.008 test HBAR** through Blocky402. [Inspect the Hedera transaction](https://hashscan.io/testnet/transaction/0.0.7162784%401788890889.523865223). The report was generated.

**The run did not complete verification.** The Arc transfer attempt became uncertain. No confirmed Arc receipt is attached to this run, and the broker retains a **50,000 micro-USDC pending reservation**. A zero confirmed-spend counter does not prove that no transfer occurred. Do not retry, delete the pending intent, or create a new request ID to bypass it; reconcile the existing transfer first.

This establishes approved mandate escalation and a subsequent settled Hedera purchase. It does not establish completed verification for this run. The [earlier first paid run](2026-09-08-first-paid-run.md) independently completed both settlement rails and all eight checks.

The export uses a public field allowlist and was checked in memory against configured private environment values and local inference/Hedera credentials before writing. It contains public mandate/signature/receipt evidence and no session cookies, bearer tokens, API keys or private keys. `sourceExportAuditChainValid` records the source export's observed audit check; it is not public-chain anchoring or a hardware attestation.
