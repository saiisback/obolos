# Hedera agent commerce extensions

User request: integrate the Hedera agentic-payment bonus directions and verify the selected Arc and Ledger track fit. The saved ETHGlobal form is outside this implementation.

## Design

Preserve the deployed HBAR x402 resource service and its mandate enforcement. Extend it with a standards-versioned A2A service agent: a buyer proposes repository quantity and a maximum price, the seller responds with an acceptable priced offer or rejection/counteroffer, and acceptance uses the existing Blocky402 paid request. A successful response carries real purchased evidence and settlement, never a manufactured task result. An Agent Card and machine-readable directory expose this service.

Use HCS-14 deterministic UAIDs for the service and buyer identities, anchored with their profiles in a restricted-submit HCS topic. Publish compact hashes and transaction references for successful payments to the same auditable topic. Identity hash generation alone is not on-chain registration; receipt and mirror-node verification are required before claiming registration. Never publish secrets, private job input, or raw reports on HCS.

Add a separate optional HTS-priced repository service path. It must be native Hedera x402 through Blocky402, with an explicit asset/recipient/quantity/amount mandate and token-association handling in the private operator workflow. Preserve existing native-HBAR behavior. Do not mint an investment token: any created token is fixed-supply testnet service credit with explicit test-only labeling.

Add bounded recurring native scheduled payments as a distinct service-access workflow. The owner authorizes recipient, amount, finite count, interval and total cap; each Scheduled Transaction retains its schedule ID and scheduled transaction ID. Service delivery requires confirmed exact transfer and a fresh resource request, with one-use proof and durable replay protection. A timer alone does not count as Hedera Scheduled Transactions. No infinite renewal or mainnet payment.

Show actual identity/audit/token/schedule evidence in a workspace Hedera integration view and public machine-readable evidence. UI status must distinguish configured, tested and chain-confirmed. Arc retains Circle-controlled USDC signing; Ledger retains real SDK/staging with Speculos and the source-adapter disclosure.

## Authority and verification

Use only the existing authorized private testnet broker account for bounded smoke operations. Store signing material in private local state; never in source, browser, public API or logs. Persist transaction identity before dispatch; on ambiguity stop and reconcile the same identity. Cap testnet operation fees and funded transfers. Avoid new credentials or token charges outside the controlled testnet demonstration.

Test protocol schemas, negotiation rejection, wrong asset/payee/amount, expiry, replay, failed/uncertain submission, privacy boundaries and mirror verification. Run baseline and affected application tests, typecheck, production build, independent review and bounded real testnet demonstrations. No bonus criterion is marked demonstrated without its own retained transaction evidence. If an external prerequisite prevents an item, report it explicitly rather than substituting a simulation.
