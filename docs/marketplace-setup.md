# Use the hosted verification marketplace

Obolos provides a public marketplace of repository-metric verification listings on Arc testnet. Obolos runs the same deterministic hosted verifier for every listing; a seller chooses the listing name, description, test-USDC price, and receives payments directly in the EVM wallet used to sign in. Sellers can also register a separately operated HTTPS verification endpoint. That mode runs seller code outside Obolos using the [external service contract](external-services.md).

The verifier checks the report's canonical repository metric lines for repository name, stars, forks, and open issues against the evidence purchased for that job. It also checks evidence integrity and freshness. Free-text analysis and recommendations remain outside that certification. The verification fee pays for execution even when one or more checks return a negative result. It is not escrow, a guarantee, or a refundable success fee.

## Seller setup

1. Open [the marketplace](https://obolos.app/marketplace) and connect the EVM wallet that should receive Arc testnet USDC.
2. Sign in, then publish a name, description, and price between 0.001 and 1 test USDC. Publishing does not move funds. The authenticated wallet becomes the listing's payout recipient; it cannot be supplied separately in the request.
3. Keep the listing active for buyers. Changing its terms or pausing it creates a new revision. Existing signed mandates retain their exact snapshot but cannot create a new order after the listing changes; buyers must review and sign the current active revision.
4. Fund the buyer runner's separate Circle agent wallet when testing your own listing. Seller proceeds go directly to the listing wallet and are not held in an Obolos balance.

The seller desk shows confirmed orders and a total derived from fulfilled marketplace orders. Listings explicitly distinguish built-in checks from seller-operated APIs. External endpoints must implement the repository-verification contract; arbitrary inference APIs need an adapter.

## Buyer and runner setup

1. Complete the private [runner setup](runner-setup.md), including a funded Hedera testnet payer and funded Circle Arc testnet agent wallet.
2. In the workspace, create an agent whose verification allowance covers the listing price. This allowance is permission, not deposited money.
3. Pair the runner and wait for an online heartbeat.
4. Select an active marketplace service before preparing a new mandate. Review the exact service ID, revision, recipient, price, and fixed Obolos endpoint in the message, then sign it with the workspace owner wallet.
5. Queue a job. The runner purchases evidence, creates the report, obtains an immutable marketplace order, pays its exact recipient and amount, and submits the Arc transaction hash for independent confirmation before receiving checks.

New marketplace mandates use the v2 signed format. Previously issued v1 mandates remain readable and byte-for-byte compatible, but a newly prepared mandate in the web workspace requires a real selected service.

The broker must privately pin the marketplace deployment and owner:

```dotenv
MARKETPLACE_URL=https://obolos.app
MARKETPLACE_OWNER_ADDRESS=YOUR_OWNER_EOA_ADDRESS
```

`MARKETPLACE_OWNER_ADDRESS` must equal `RUNNER_OWNER_ADDRESS`. Keep these pins in local private configuration. The broker accepts marketplace payment instructions only after validating the signed service snapshot against the pinned owner and origin.

## API outline

Public browsing needs no wallet session:

```text
GET /api/market/services
```

Seller operations use the owner session cookie and same-origin browser requests:

```text
GET   /api/market/services?mine=1
POST  /api/market/services
PATCH /api/market/services/:id
GET   /api/market/earnings
```

Runner order operations use the one-time runner credential as a Bearer token. The order request body contains `jobId`, `payer`, `report`, and `dataTransactionId`. Confirmation supplies the Arc transaction hash:

```text
POST /api/market/orders
POST /api/market/orders/:id/confirm
GET  /api/market/orders/:id
```

The platform binds each order to the queued job, report digest, selected service revision, payer, recipient, amount, and purchased-data transaction. It verifies the Arc transfer independently and rejects transaction reuse. Repeating confirmation for the same order returns its stored result without another transfer.

## Funding and recovery

Use testnet assets only. The owner browser wallet signs identity and mandate messages; the Hedera payer buys evidence; the Circle agent wallet pays the selected seller. These are distinct roles even if one operator controls them.

There is no automatic faucet, deposit, escrow, or payment retry. Follow [live setup](live-setup.md) for Hedera and Circle funding. If payment submission becomes uncertain, inspect the durable broker journal and chain state before taking another action. Do not delete journals or create a replacement payment merely because a response was lost.
