# Local economy executor

Run one real Arc testnet purchase with an existing Circle wallet and existing scoped platform agent key. This command does not register an agent, grant owner mandates, enroll an executor, fund a wallet, issue credentials, change category policy, or impersonate the seller.

```sh
npx tsx --env-file=.env.broker --env-file=/absolute/private/executor.env scripts/economy-execute.ts /absolute/private/order.json --execute-testnet
```

`executor.env` supplies `ECONOMY_AGENT_KEY`. Existing Circle configuration requires `CIRCLE_WALLET_ADDRESS`, `LEDGER_CONTROLLER_ADDRESS`, `CIRCLE_CLI_HOME`; optional `CIRCLE_CLI`, canonical `ARC_RPC_URL`, and `ECONOMY_OPERATION_DIR` follow `scripts/economy-circle.ts`. Keep both files private. The order JSON must have mode 600 and be at most 128 KiB. Never place a key inside the order JSON.

The strict order input has these fields:

| Field | Meaning |
| --- | --- |
| `version` | `1` |
| `origin` | Exact HTTPS platform origin, without trailing slash |
| `platformAgentId` | Existing UUID scoped to the supplied key |
| `orderId` | Permanent nonzero 32-byte hex identity chosen once for this purchase |
| `owner` | Pinned platform and onchain owner address |
| `payer` | Pinned Circle wallet / onchain executor address |
| `definition` | Complete, exact published `obolos.service.v1` service definition, including both schemas |
| `serviceHash` | Exact immutable service hash matching `definition` |
| `input` | Actual requested work matching the input schema |
| `maxAmountAtomic` | Positive decimal string bounding the full payment in canonical USDC atomic units |
| `expiry` | Fixed Unix seconds as a decimal string; never refreshed on retry |

Obtain the complete current service definition from `GET /api/economy/services`. Select a service deliberately; the command never chooses a replacement quote. Its category, seller, endpoint, deployment, unit, quantity, price and schemas must remain exact.

Before allowance, the command authenticates the key via scoped read-only economy GET and checks its platform owner; validates deployed runtime, wiring and canonical token; verifies finalized agent owner/executor binding, active mandate, seller permission, active offer and caps; and simulates policy consumption against current chain state to enforce rolling windows and delays. Approval balance/allowance checks and payment simulation run before their submission phases. After approval finalizes, the exact scoped agent/owner and active offer are checked again immediately before payment. Only the exact order amount is approved. A nonzero preexisting allowance is rejected, and no balance is added automatically.

State is stored privately under `ECONOMY_OPERATION_DIR/executor/<orderId>.json`. The complete input, hashes and immutable policy/agent/fee versions are fsynced before wallet actions. Operation names derive solely from that permanent order ID. Circle's existing durable operation journal records every external submission before sending it. Do not rename, delete, move or regenerate these journals.

A shared executor lock serializes all orders, and an allowance reservation survives a failed or uncertain operation. Every executor using the wallet must share the same operation directory; unrelated wallet tooling must not modify allowances concurrently. The lock does not coordinate arbitrary third-party wallet tools or another host with a separate directory. Remove a stale process lock only after verifying the original process is gone; preserve the reservation and order state.

On timeout or failed delivery, rerun the **identical command with the identical input**. Once paid, the executor never approves or pays again, even if the service is subsequently retired or policy changes. It independently requires finalized matching `OrderSettled` and `OrderPaid`, persists the exact paid request, then repeats only scoped delivery POSTs. Default polling is six attempts with ten-second waits; pending output leaves payment preserved for a later invocation. Provider calls and platform reads have bounded timeouts and response sizes. The API permits 120 delivery requests per agent per minute, bounded globally to 1,000 per minute.

The returned output must match the paid order, service, transaction, schema and canonical output hash. Before buyer acknowledgment, the finalized ledger record must contain that exact seller-attested output. The executor never submits seller delivery. Completed acknowledgment is verified onchain, and hashes are printed without private input or credentials.

For an uncertain Circle operation, use the original operation name from the journal:

```sh
npx tsx --env-file=.env.broker scripts/economy-circle.ts reconcile executor-<64-order-hex-without-0x>-pay
```

Use the existing `-approve` or `-ack` name for those stages. Recovery is read-only and never substitutes a fresh submission. Unknown results and terminal failures require inspection. If a submission phase was persisted but no Circle operation exists, the executor first takes Circle's own operation lock and verifies that the order is absent from both latest and finalized chain state. Only this evidence permits retrying the same original operation name. A present or locked Circle operation is never treated as absent. Never delete the reservation to start a competing purchase while its allowance or payment is unresolved.

This is real execution with testnet assets. Seller claims and buyer acknowledgment are not independent evidence of utility or market demand.

## Aborting a definitely unpaid order

To stop an unpaid order and release its reservation:

```sh
npx tsx --env-file=.env.broker --env-file=/absolute/private/executor.env scripts/economy-execute.ts /absolute/private/order.json --abort-unpaid --execute-testnet
```

The original input and order identity remain immutable. This mode can run with a revoked scoped key because it never pays or obtains service work. It requires exclusive executor and Circle operation locks, no payment operation journal, and no paid marker in either latest or finalized onchain state. If this order has a finalized approval, the current allowance must be zero or the exact originally approved amount. A dedicated permanent `-abort` operation revokes that allowance to zero; finalization is verified before the reservation is released. If no approval operation exists, abort leaves unrelated allowances untouched. Any uncertain/present payment journal, active operation lock or conflicting allowance blocks abort. An aborted order can never restart a purchase.

## Revocation boundary

Scoped-key revocation and service retirement are checked after approval and immediately before local payment submission. Those HTTP checks are not atomic with an onchain transaction. The preserved deployed settlement has no onchain retired flag or seller-signed per-order quote requirement: a retirement/key revocation occurring after the final HTTP response cannot cancel a submitted transaction. The onchain owner mandate is the actual spending authorization; deactivate the onchain agent or revoke its seller permission to stop pending spending (subject to transaction ordering). Never treat platform key revocation alone as a chain-level spending kill switch.

The executor wraps Circle reconciliation with Circle's per-operation lock because the shared helper's standalone `reconcile` command does not take that lock itself. Do not run the standalone reconciliation command concurrently with another tool submitting the same operation.

Circle may expose a transaction ID and `userOpHash` before its secondary API exposes the transaction hash. The checked CLI adapter preserves both and retrieves known transaction IDs through Circle's detail endpoint, because list responses can omit `userOpHash`. It requires the exact transaction ID, wallet ID, source address and chain. Read-only recovery verifies the configured wallet's on-chain EntryPoint binding, finds exactly one successful matching user operation in the latest 2,000 finalized blocks, and verifies its canonical receipt. It retains the original Circle state and operation identity. Older, absent, ambiguous, failed, or conflicting evidence requires inspection; it never authorizes a replacement submission.
