# Deployed self-service testnet run — September 9, 2026

The native public application at [obolos.app](https://obolos.app) completed a funded self-service run through Neon, a paired isolated runner, and the private local broker. Job `f2d61fa0-0561-4029-b150-99636cbe4795` finished **succeeded** at approximately 16:50 UTC: it purchased repository evidence, generated a model report, and passed all eight source and evidence checks. Both payments were independently checked on chain after the runner uploaded its result.

## Signed scope and execution

A fresh disposable EOA signed the actual public login challenge and a separate spending mandate. The test used the deployed APIs to create its agent, issue a scoped API key, pair its runner, approve the mandate, queue the job, and retrieve the persisted result.

| Bound | Authorized and observed |
| --- | --- |
| Repository | Only `octocat/Hello-World` |
| Maximum runs | 1 |
| Data budget and maximum repository price | 100000 tinybars = 0.001 HBAR |
| Verification budget | 50000 micro-USDC = 0.05 USDC |
| Mandate lifetime | One hour |
| Networks | Hedera testnet and Arc testnet |

These are purchase allowances; network fees are separate. The test used an explicitly authorized funded broker fixture. Connecting an ordinary account does not grant access to that broker or its funds.

## Settlement evidence

- **Hedera:** [transaction `0.0.7162784@1788972613.592452116`](https://hashscan.io/testnet/transaction/0.0.7162784%401788972613.592452116) returned `SUCCESS` in the mirror response. Its transfer list debited payer `0.0.10413599` by 100000 tinybars and credited recipient `0.0.10425234` by the same amount.
- **Arc:** [transaction `0xae2cc6a21928eddf1c8feb2aaa69bd068dc6ee7a46a5094f0bbb9d78e0ca3246`](https://testnet.arcscan.app/tx/0xae2cc6a21928eddf1c8feb2aaa69bd068dc6ee7a46a5094f0bbb9d78e0ca3246) returned receipt status `0x1`. The canonical USDC contract `0x3600000000000000000000000000000000000000` emitted a Transfer from `0x90602880dbee4158d96fddbdffe300c03d68e46c` to `0xc76e4cf85fceda68af2e5cae6d2fc5d054362c4c` for `0xc350` = 50000 atomic units.

The workspace still labels uploaded receipts **Runner-confirmed**. The independent chain checks above are evidence for this specific run, not an automatic verification feature of the workspace.

## Provenance and retained state

The owner signatures came from a generated EOA through `viem`; this was an API smoke fixture, not proof of a browser-wallet interaction or physical Ledger signing. The local broker used real Ledger Key Ring credential retrieval through the disclosed **Speculos emulator**, and its existing Circle Agent Stack testnet session handled the Arc payment. Physical-device security and hardware provenance are not claimed.

The private API result, chain responses, signed scope, runner journal and credentials remain under the ignored `data/paid-platform-smoke/` directory. Existing broker/payment journals were preserved. The [older unresolved Arc intent](2026-09-08-arc-reconciliation.md) was not retried or resolved by this new job.

The separate [public account smoke](2026-09-09-neon-accounts.md) passed 43 assertions without payments, covering signed login, actual Neon persistence, scope checks, revocation and logout.

Additional public checks passed:

- Repeating the paid job's original idempotency key returned HTTP 200 and the same completed job. Changing its payload with that key returned HTTP 409 `IDEMPOTENCY_CONFLICT`. Neither request created another payment.
- The native Vercel/Neon rehearsal flow passed session, CSRF, live-access gating, validation, pause, price shock, approval, completion, export and ownership checks. Rehearsal job `c36b8c39-b89b-4fca-a357-4469ba0eee49` was simulated and incurred no charges.
- Browser checks at 1440-pixel desktop and 390-pixel mobile widths passed for the landing, login and developer pages: HTTP 200, working navigation and anonymous redirects, with no horizontal overflow or browser errors. These checks did not exercise a physical wallet.
