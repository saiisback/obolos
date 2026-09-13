# Production accounting and output valuation

GAP uses seller revenue minus intermediate production inputs. Productivity uses independently assessed output value divided by complete production cost. Neither metric substitutes purchase volume for output value.

## Seller workflow

1. Open **Economy → Record production inputs and costs → Load my sales**.
2. Select a delivered sale and click **Load measured costs**. The app verifies the canonical, finalized seller delivery transaction and preloads its actual gas cost. An order, seller, output or receipt mismatch fails closed.
3. Add consumed marketplace purchases and their allocated costs. A purchase must belong to this producer, be accepted before output delivery, and cannot be allocated above its actual amount or create a production cycle.
4. Add external purchased inputs, inference billing, other gas and resource allocations. Hosting, energy, storage, shared overhead and conversions must be accounted for where applicable. Avoid counting an input twice. The draft's gas field includes only the seller's successful delivery transaction; earlier failed transactions and other producer expenses require separate accounting.
5. Supply a public cost-evidence URL and content hash. Review the complete statement before signing it with the seller wallet. Statements are immutable: do not save an incomplete placeholder expecting to overwrite it later.
6. Refresh economy data. An aggregate becomes available only when every eligible order in its window has the required accounting and delivery evidence. Individual demo transactions do not establish independent market demand.

Arc's native gas balance uses 18 decimal places; the USDC accounting interface uses six. The draft retains `gasUsed × effectiveGasPrice` exactly in native units and rounds upward once to micro-USDC. See [Arc's stablecoin-native model](https://docs.arc.io/arc/concepts/stablecoin-native-model). This is a unit conversion within the same asset, not a USD exchange-rate assumption.

Inference token counts are available when retained in the delivered provider response. Historical responses do not retain cache usage or an invoice. The app does not turn these counts into an invented billed amount. No complete cost declaration is made automatically.

The authenticated `GET /api/economy/accounting/{orderId}` endpoint exposes observations only to that order's seller. It does not create a production account, submit a wallet transaction or publish confidential billing records.

## Independent evaluator workflow

Configure an actually independent evaluator's public address in the deployment's `ECONOMY_EVIDENCE_SIGNERS` map with the `order` role. For example, its shape is `{ "<lowercase evaluator address>": ["order"] }`. This is an operator configuration step after selecting the evaluator. A newly generated team-controlled wallet does not establish independence; do not authorize one as a substitute.

1. The evaluator signs in and opens **Economy → Review output value for productivity → Load valuation queue**.
2. The queue exposes delivered outputs with complete positive production costs, payment and acknowledgment within a closed UTC day, and no existing valuation. **Load next review page** advances through further accounts even if a page has no eligible output.
3. Review the actual output and signed production account. Establish its monetary value using documented evidence, a stated valuation method, any quality adjustment and an explicit currency conversion where needed. A model quality score alone is not a monetary valuation.
4. Enter the value, method, public evidence URL and content hash, then sign and submit. No payment is sent by this action.
5. Refresh economy data and inspect **Previous closed UTC day**. Later evidence also revises its historical accounting observation without deleting the earlier observation.

The reviewer signs the exact `productionAccountHash`, output hash, order, payment and deployment. Costs must equal that seller account's complete inputs, gas, inference and other resources. In this account-bound format, `costBreakdown.paymentAtomic` means consumed intermediate inputs; it is not the buyer's payment for the finished output. The earlier independently attested format remains readable and retains its original semantics.

The server rejects untrusted signers, buyer/seller signatures, known owner/executor relationships, altered costs, mismatched output/account hashes and conflicting immutable evidence. Signatures establish authorship, not undisclosed independence or objective usefulness. The raw machine endpoint remains `POST /api/economy/evidence`.

## Current data requirement

The implementation supports both workflows. At this release, the operator has not supplied complete real hosting/energy/input invoices or an independent evaluator's valuation. No production values or signer identities were fabricated. Automated fixtures demonstrate the calculation pipeline separately from real testnet evidence.
