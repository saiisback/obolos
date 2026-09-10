# Obolos hosted testnet marketplace release

User authorization: implement the real end-to-end product now, hosted in production, using Ledger simulation and real testnet testing. This implements the audit's marketplace and verification gaps without mainnet funds or hackathon submission. Existing authorized canonical checkout and GitHub/Vercel deployment are retained.

## Product contract

Wallet-authenticated sellers publish named repository-metric verification services with their own connected EOA as the immutable Arc recipient. Sellers choose a bounded USDC price, description, and can pause/change price through versioned updates. The platform hosts the deterministic verifier for these listings; this is explicitly hosted execution, not seller-provided arbitrary code or claimed external businesses. Buyer agents browse actual published services, select one, and sign its service ID, revision, recipient, price and fixed Obolos endpoint into a v2 spending mandate. Existing v1 signed messages remain byte-for-byte compatible.

The private runner buys metered evidence through existing Hedera/Blocky, uses the fixed inference worker, and purchases verification from the selected seller through a new public paid API. The broker validates the owner's v2 signature against a locally pinned marketplace owner/origin before authorizing a new recipient. It never accepts an arbitrary request destination. A pre-payment order binds the actual queued job, report hash, selected service snapshot, payer, recipient and amount. The service independently checks the Arc receipt and block time before delivering claim-level results. An on-chain transaction can belong to only one order; repeated confirmation of the same order returns its original result without another transfer.

Verification evaluates exact model-produced metric claims (repository, stars, forks, openIssues) against the purchased evidence, plus integrity/freshness. It rejects wrong/missing/duplicate quantitative claims; free-text judgment is explicitly outside its certification. Service execution and seller earnings are persisted separately from the buyer runner's reported result.

## Public APIs

GET /api/market/services -> {services: MarketService[]}; GET with mine=1 authenticates seller and includes own paused listings.
POST /api/market/services (owner cookie + Origin) input {name,description,priceAtomic}; payout is the authenticated wallet, never request-supplied.
PATCH /api/market/services/:id input {name,description,priceAtomic,active}; owner only, revision increment.
GET /api/market/earnings (owner cookie) -> confirmed order history and atomic USDC total only for own listings.
POST /api/market/orders (runner Bearer) input {jobId,payer,report}; validates running job, active runner/mandate and selected current listing before issuing immutable order.
POST /api/market/orders/:id/confirm (runner Bearer) input {transactionHash}; independently verify exact transfer and order time, atomically reserve unique hash, execute hosted verifier, persist and return result. Exact repeat is safe. GET same order is owner/assigned runner scoped.

## Contracts

VerificationService = {id:string UUID,revision:number,name:string,recipient:0x address,priceAtomic:integer 1000..1000000,endpoint:string}; endpoint exactly origin + /api/market/services/{id}.
MarketService extends VerificationService with description,active,execution:'hosted-metric-verifier',createdAt.
MarketOrder = {id,jobId,serviceId,revision,payer,recipient,amountAtomic,reportDigest,createdAt,expiresAt,status:'quoted'|'fulfilled',transactionHash?:string,result?:{checks:Array<{label,passed,detail}>}}.
MandateFields.verificationService optional; absent uses existing v1 behavior. New UI requires chosen service for new mandates. New orders use v2 only. Broker environment MARKETPLACE_URL and MARKETPLACE_OWNER_ADDRESS authorize the path; absence fails closed without affecting legacy integration.
VerificationPurchase.market optional {mandate:SignedMandate,runnerToken:string}; runner forwards credential only to its local trusted broker, broker only to configured marketplace origin. Tokens never enter model, output or saved plaintext journal.

## Receipt and funding UX

New marketplace Arc settlement is independently confirmed by hosted API, not inferred from uploaded strings. Verify Hedera receipt server-side against current configured payee and amount when accepting v2 result; persist chain verification and protect cross-job receipt reuse. Show seller, recipient, amount, order ID, checks and chain-confirmed status. Budget is an allowance, not funds. Clearly show testnet, Speculos, owner-runner prerequisites, online/offline, seller earnings and no automatic deposits. Preserve existing visual system.

## Release gates

Tests for seller ownership, immutable payee, paused/repriced listing, wrong recipient/amount/token/chain, stale receipt, reused transaction, changed report/order replay, mandate tampering, wrong metric claims, safe HTTP result replay; real database integration; typecheck/build; browser desktop/mobile; live public HTTPS buyer/seller flow plus actual Hedera and Arc testnet settlement within existing broker caps. Preserve old journals and receipts. Do not claim independent customer adoption, physical Ledger, automatic factual certification, mainnet, escrow or arbitrary service hosting.
