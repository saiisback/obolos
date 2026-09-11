# Obolos generic service protocol

`obolos.service.v1` lets an independently operated HTTPS provider fulfill a service that has already settled through the Obolos Arc market. It is separate from the legacy repository verifier protocol. A successful payment is not proof of delivery, and a successful HTTP response is not proof of usefulness.

## Service definition

Every provider publishes a service definition with:

- Arc testnet chain ID `5042002`, settlement and economic-ledger addresses, seller address, and canonical public HTTPS endpoint.
- One category: `data`, `compute`, `inference`, `verification`, or `storage`.
- The category's exact normalized unit: `source-record`, `compute-unit`, `inference-request`, `verification-job`, or `gigabyte-hour`.
- Positive decimal-string `quantity` and `unitPriceAtomic`. Decimal strings avoid JSON number precision loss. The order amount must equal their product.
- Constrained JSON Schemas for input and output. Supported types are object, array, string, number, integer, boolean, and null. Objects must reject additional properties. Schema nesting, property counts, array sizes, strings, and request/response bytes are bounded.

`serviceHash` is recomputed from the same immutable terms used by `ObolosMarketSettlement.registerService`:

```text
keccak256(abi.encode(
  5042002,
  settlementAddress,
  seller,
  categoryId,
  keccak256(utf8(unit)),
  quantity,
  unitPriceAtomic,
  keccak256(utf8(endpoint))
))
```

Changing the seller, category, unit, quantity, price, endpoint, chain, or settlement address produces a different service hash. Input and output schema changes should be published as a new service revision; the on-chain hash commits only the fields accepted by the current settlement contract.

## Paid request

The buyer sends the following strict JSON object. Extra properties are rejected.

```json
{
  "protocol": "obolos.service.v1",
  "orderId": "0x…bytes32",
  "agentId": "0x…bytes32",
  "payer": "0x…address",
  "serviceHash": "0x…bytes32",
  "inputHash": "0x…bytes32",
  "category": "inference",
  "unit": "inference-request",
  "quantity": "1",
  "unitPriceAtomic": "50000",
  "amountAtomic": "50000",
  "settlement": {
    "chainId": 5042002,
    "address": "0x…settlement",
    "ledgerAddress": "0x…ledger",
    "transactionHash": "0x…transaction"
  },
  "input": {"prompt": "…"}
}
```

`inputHash` is the keccak256 hash of canonical JSON with recursively sorted object keys. The transport sends `orderId` as the `idempotency-key` header. Providers must return the prior result for repeated requests with the same order ID and must never execute an order ID with different input.

Before opening the provider connection, the caller verifies a successful receipt for the named transaction on chain `5042002`. The receipt must contain matching events from the exact configured contracts:

- `OrderSettled`: order ID, payer, and total amount.
- `OrderPaid`: order ID, agent ID, seller, service hash, category, unit hash, quantity, unit price, total amount, and input hash.

An unconfirmed, reverted, mismatched, or incomplete receipt is rejected before delivery is requested.

The provider must independently fetch that transaction receipt from Arc and apply the same event checks before doing paid work. The request carries identities and a transaction hash, not trusted proof by assertion. `verifyServiceSettlement` is shared for caller and provider implementations once they have obtained a receipt from an Arc RPC endpoint.

## Response

The provider returns uncompressed JSON:

```json
{
  "protocol": "obolos.service.v1",
  "orderId": "0x…bytes32",
  "serviceHash": "0x…bytes32",
  "inputHash": "0x…bytes32",
  "outputHash": "0x…bytes32",
  "output": {"answer": "…"}
}
```

The identities must match the request, `output` must satisfy the advertised output schema, and `outputHash` must equal the canonical JSON hash. Output may be any bounded JSON shape permitted by that schema. The protocol has no `delivered: true` shortcut: delivery is recorded only after the full response is received and validated. Timeout, DNS failure, TLS failure, redirects, non-2xx status, malformed JSON, oversized output, and hash/schema mismatch leave delivery unconfirmed.

## Transport boundary

Only a canonical HTTPS URL on port 443 with a public DNS hostname is accepted. Credentials, IP literals, query strings, fragments, redirects, compression, and mixed public/private DNS answers are rejected. DNS is resolved for every execution, the checked public address is pinned for the connection while preserving TLS hostname verification and SNI, responses are capped at 128 KiB, and the complete operation is limited to 12 seconds. The protocol never forwards Circle credentials, wallet secrets, provider API keys, or arbitrary caller headers.

## Platform routes

`GET /api/economy/services` is public. A signed-in seller publishes after registering through their wallet:

```http
POST /api/economy/services
Content-Type: application/json

{ ...the complete obolos.service.v1 service definition... }
```

The seller address must equal the authenticated wallet and the finalized registered seller. Reposting the exact hash and definition is idempotent; endpoint metadata or schemas cannot change under an existing hash.

A signed-in owner submits an already paid request:

```http
POST /api/economy/orders
Content-Type: application/json

{"platformAgentId":"…uuid…","request":{ ...the paid request above... }}
```

The platform checks that `keccak256(utf8(platformAgentId))` equals the request agent ID, the signed-in address retains ownership of the policy agent, and the receipt is finalized with exact settlement and ledger events proving the payer was authorized when payment occurred. A later pause or executor rotation does not block recovery of already paid delivery. The platform durably stores the paid order before calling the provider. This route verifies money that already moved; it never submits an approval, settlement, transfer, or retry payment.

An external agent can submit and deliver its own already-paid request with its scoped API key, without a browser wallet session:

```http
POST /api/v1/agents/{platformAgentId}/economy/orders
Authorization: Bearer ob_test_…
Content-Type: application/json

{"request":{ ...the paid request above... }}
```

The path supplies `platformAgentId`; clients cannot override it in the body. The key must be scoped to that exact agent, including when multiple agents have the same human owner. The marketplace still requires `request.agentId` to equal `keccak256(utf8(platformAgentId))` and independently verifies the finalized payment receipt. This action records the paid job and attempts provider delivery; it never moves funds.

`GET /api/economy/orders/{orderId}` requires the owning user and omits the private input and full request. `POST /api/economy/orders/{orderId}/delivery` retries provider delivery for the same durable paid order. A retry never performs or requests another payment.

## Recovery and reference operation

Active discovery excludes retired services; `GET /api/economy/services/{serviceHash}` preserves exact historical definitions for paid delivery. Owner-authenticated recovery and seller retirement are described in [live provider operation](economy/live-provider.md). The reusable [executor](economy/executor.md) handles bounded real purchases and durable retries. [Signed economic evidence](economy/signed-evidence.md) supplies independent assessments separately from payment and delivery.
