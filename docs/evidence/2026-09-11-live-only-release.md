# Live-only release verification

Verified 2026-09-11T09:27:16.431Z against successful canonical finalized Arc testnet receipts. All five original paid orders completed, with distinct seller delivery and buyer acknowledgment. Only Ledger hardware is emulated through Speculos.

Each purchase paid 1,000 atomic test USDC (0.001 USDC): 950 to the seller, 30 to reserve and 20 to the review pool. All three exact token transfers were checked in each payment receipt.

| Service | Payment | Seller proof | Buyer proof |
| --- | --- | --- | --- |
| data | [Payment](https://testnet.arcscan.app/tx/0x88a87c5151faa81bee1514dcd3f094898a853d998828398b0f7a43189375c2a3) | [Seller delivery](https://testnet.arcscan.app/tx/0xb398d788ab1b0f6dc7a2fa4d00bd35af392262b3bab9c50471224b2eb44a2045) | [Buyer acknowledgment](https://testnet.arcscan.app/tx/0x44dcf6e3c08c2012ca93003d08e745204c7731d9d203434387232ebc224e2b25) |
| compute | [Payment](https://testnet.arcscan.app/tx/0x5e630923b487278ca6a4fa2ef69b9c5b7d4930493db2bc5fb53fcf276bb1a01b) | [Seller delivery](https://testnet.arcscan.app/tx/0x7a82f8be95207261ed4594c74ac88e404d1ae274bbadbb7313acad70380ff750) | [Buyer acknowledgment](https://testnet.arcscan.app/tx/0xb902e8b31e3ffdbf59f48bab53cdda860d3d6ecadaf3cef9c23aadde6445db59) |
| inference | [Payment](https://testnet.arcscan.app/tx/0x52846400c1f75e9f244ec735364901fce0a4aa39a0da2f47625fb97f563f919a) | [Seller delivery](https://testnet.arcscan.app/tx/0x57865f221f1b9d5b9bd40978c2481161a92e8d2e999181979df37e2f85975d88) | [Buyer acknowledgment](https://testnet.arcscan.app/tx/0xa79d50e3e51d7cc60c12459619fdb4cc8e86d867ec456d170a832b61e9f971ac) |
| verification | [Payment](https://testnet.arcscan.app/tx/0xa59a1ff60070542866cf775044f6db896ae17692710d19cb0c9605996aae08c7) | [Seller delivery](https://testnet.arcscan.app/tx/0x5f277931e2e09b59db0b1c063337fd45cc65d94220bef5f667045793a022bc32) | [Buyer acknowledgment](https://testnet.arcscan.app/tx/0xbcebc7383ae40a2e7eb7c7855227ca1750306e7553bd521923c2731abe876787) |
| storage | [Payment](https://testnet.arcscan.app/tx/0x7c4d5d96d1797ade809d35cb4bd9ec39cb024e100c1160cfae83e886a44607da) | [Seller delivery](https://testnet.arcscan.app/tx/0x4a1e449ec97506fecbf61699332697fb6ef6e2b40515beca440d0da6c67e4a12) | [Buyer acknowledgment](https://testnet.arcscan.app/tx/0xf0a2121a64320df32dc9c3b84b93ce92784d77c9e18c222f729baf1953067892) |

Compute counted and hashed the supplied text; data fetched actual public GitHub metadata; inference returned OpenAI model output with request ID and token usage; verification checked SHA-256 content integrity; storage persisted the text in PostgreSQL and returned the exact original text through authenticated buyer retrieval. The storage lease expires at 2026-09-11T10:24:47.000Z. Full inputs, outputs and receipt block hashes are in the [machine-readable evidence](2026-09-11-live-only-release.json).

The seller also returned the compute order's full 1,000-atomic principal to its original payer. The [actual refund](https://testnet.arcscan.app/tx/0xaa1a8ab2f29b0a9b84871ed1e6df5335cd3f72a02efb7ff49506defa29449481) is recorded through the proof-verifying recovery API. This is a voluntary seller transfer, not escrow.

The live checks exposed and repaired a GitHub quota failure and Circle's delayed/sparse transaction-list evidence. The original paid data order was explicitly retried after authenticated source access was restored. Circle recovery retained the original operation identities and used exact transaction-detail and finalized user-operation evidence; it never created replacement payments. Storage approval and payment were finalized while Circle still reported SENT, exercising that recovery path.

Validation: 497 application tests, 15 browser tests, executable contract tests, typecheck, production build and deployed HTTP smoke passed. The deployed smoke confirms new rehearsal execution is rejected and the former demo URL redirects to the live workspace. Test fixtures remain isolated from production.

Remaining boundaries:

- Integration buyer and seller are controlled for this release; these purchases do not establish independent demand or economic usefulness.
- Missing independent valuations, costs, capital, basket prices and trusted reviews remain unavailable.
- The private provider host must remain online.
- Storage is one stored-object-hour; retrieval expires after its original one-hour lease.
- Refunds are voluntary seller transfers verified on-chain; no escrow, compulsory arbitration or automatic reviewer payouts.
- Testnet assets and staging Ledger services do not establish mainnet maturity or physical-device security.

See the [implementation audit](2026-09-11-live-only-audit.md) for the exact emulation and evidence boundaries.
