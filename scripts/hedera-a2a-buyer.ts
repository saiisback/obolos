/** Private testnet buyer. Only an operator running this command unlocks Ring and submits HBAR. */
import { createHash } from "node:crypto";
import { mkdir, open, readFile, rename } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  A2A_EXTENSION,
  trustedBase,
  validateSellerOffer,
  purchaseAcceptedOffer,
} from "../src/lib/hedera/a2a";
import { decryptBrokerSecrets } from "../src/lib/integrations/ledger";
import { validateRepos } from "../src/lib/repository-service";

async function save(filename: string, value: unknown) {
  const temporary = filename + ".tmp";
  const file = await open(temporary, "w", 0o600);
  try {
    await file.writeFile(JSON.stringify(value));
    await file.sync();
  } finally {
    await file.close();
  }
  await rename(temporary, filename);
}
export async function runA2ABuyer(
  args: string[],
  env: Record<string, string | undefined> = process.env,
) {
  const [operation, providerId, maxValue, mandateExpiresAt, ...inputRepos] =
    args;
  if (
    !/^[A-Za-z0-9_-]{1,100}$/.test(operation ?? "") ||
    !["repo-standard", "repo-economy"].includes(providerId) ||
    !/^\d+$/.test(maxValue ?? "") ||
    !Number.isSafeInteger(Number(maxValue)) ||
    Number(maxValue) < 1 ||
    Date.parse(mandateExpiresAt) <= Date.now() ||
    !Number.isFinite(Date.parse(mandateExpiresAt))
  )
    throw Error(
      "Usage: hedera-a2a-buyer.ts OPERATION PROVIDER MAX_TINYBAR MANDATE_EXPIRY REPO [REPO ...]",
    );
  const repos = validateRepos(inputRepos);
  const resourceBase = trustedBase(env.DATA_SERVICE_URL ?? "").href;
  const base = trustedBase(env.A2A_PUBLIC_URL ?? "");
  const endpoint = new URL("api/hedera/a2a", base).href;
  const payTo = env.HEDERA_PAY_TO ?? "";
  const brokerCap = Number(env.BROKER_MAX_DATA_ATOMIC ?? 0);
  if (
    !/^0\.0\.[1-9]\d*$/.test(payTo) ||
    !Number.isSafeInteger(brokerCap) ||
    brokerCap < 1 ||
    Number(maxValue) > brokerCap ||
    !(env.BROKER_ALLOWED_PROVIDERS ?? "").split(",").includes(providerId)
  )
    throw Error("Purchase exceeds configured private broker allowance.");
  const directory = resolve(env.BROKER_DATA_DIR ?? "data/broker", "a2a");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const filename = join(directory, operation + ".json");
  const intent = {
    operation,
    providerId,
    maxAmountAtomic: Number(maxValue),
    mandateExpiresAt,
    repos,
    endpoint,
    resourceBase,
    payTo,
  };
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(intent))
    .digest("hex");
  try {
    const old = JSON.parse(await readFile(filename, "utf8"));
    if (old.fingerprint !== fingerprint)
      throw Error("Operation belongs to another intent.");
    if (old.status === "completed") {
      return old.publicProof;
    }
    throw Error(
      "Operation was already started; reconcile the existing payment identity before retrying.",
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  // Exclusive intent precedes all external calls. Transport uncertainty never restarts negotiation or payment.
  const file = await open(filename, "wx", 0o600);
  try {
    await file.writeFile(
      JSON.stringify({ fingerprint, status: "negotiating", intent }),
    );
    await file.sync();
  } finally {
    await file.close();
  }
  const cardResponse = await fetch(
    new URL(".well-known/agent-card.json", base),
    { redirect: "error", signal: AbortSignal.timeout(15000) },
  );
  if (!cardResponse.ok) throw Error("Seller Agent Card unavailable.");
  const card = await cardResponse.json();
  if (
    card.protocolVersion !== "0.3.0" ||
    card.preferredTransport !== "JSONRPC" ||
    card.url !== endpoint ||
    !card.capabilities?.extensions?.some(
      (extension: { uri?: string }) => extension.uri === A2A_EXTENSION,
    ) ||
    !card.defaultOutputModes?.includes("application/json")
  )
    throw Error("Seller Agent Card differs from pinned A2A service.");
  const secrets = await decryptBrokerSecrets(env);
  const proposal = {
    action: "propose",
    payer: secrets.hedera.accountId,
    requestId: operation,
    providerId,
    repos,
    maxAmountAtomic: Number(maxValue),
    mandateExpiresAt,
  };
  async function send(data: unknown, contextId?: string) {
    const messageId = `${operation}-${contextId ? "accept" : "propose"}`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: messageId,
        method: "message/send",
        params: {
          message: {
            kind: "message",
            role: "user",
            messageId,
            parts: [{ kind: "data", data }],
            extensions: [A2A_EXTENSION],
            ...(contextId ? { contextId } : {}),
          },
        },
      }),
      redirect: "error",
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw Error("A2A seller unavailable.");
    const result = await response.json();
    if (
      result.jsonrpc !== "2.0" ||
      result.id !== messageId ||
      result.error ||
      result.result?.kind !== "message" ||
      result.result?.role !== "agent" ||
      result.result.parts?.length !== 1 ||
      result.result.parts[0].kind !== "data"
    )
      throw Error("Invalid A2A response.");
    return result.result.parts[0].data;
  }
  const response = await send(proposal);
  if (response.action !== "offer")
    throw Error(
      "Seller counteroffer requires a new explicit mandate; no payment attempted.",
    );
  const offer = validateSellerOffer(response, proposal, resourceBase, payTo);
  const acceptance = await send(
    {
      action: "accept",
      payer: proposal.payer,
      requestId: operation,
      offerToken: offer.offerToken,
    },
    offer.contextId,
  );
  if (
    acceptance.action !== "accepted" ||
    acceptance.offerToken !== offer.offerToken ||
    acceptance.offerId !== offer.offerId
  )
    throw Error("Seller did not accept the same offer.");
  validateSellerOffer(acceptance, proposal, resourceBase, payTo);
  await save(filename, {
    fingerprint,
    status: "accepted",
    intent,
    offer,
    acceptance,
  });
  const result = await purchaseAcceptedOffer(
    offer,
    secrets.hedera,
    resourceBase,
  );
  const publicProof = {
    offerId: result.offerId,
    contextId: result.contextId,
    payer: result.payer,
    resourceUrl: result.resourceUrl,
    network: result.receipt.network,
    asset: result.receipt.asset,
    amountAtomic: result.receipt.amountAtomic,
    units: result.receipt.units,
    transactionId: result.receipt.transactionId,
    explorerUrl: result.receipt.explorerUrl,
  };
  await save(filename, {
    fingerprint,
    status: "completed",
    intent,
    offer,
    result,
    publicProof,
  });
  return publicProof;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  runA2ABuyer(process.argv.slice(2))
    .then((proof) => console.log(JSON.stringify(proof)))
    .catch(() => {
      console.error(
        "A2A buyer stopped. Inspect the private operation journal and reconcile existing transaction identity before retrying.",
      );
      process.exitCode = 1;
    });
}
