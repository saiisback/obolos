/** Private fixed-supply test-credit buyer. Importing never unlocks Ring or submits a transaction. */
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import type { PaymentRequirements, SettleResponse } from "@x402/core/types";
import {
  createClientHederaSigner,
  PrivateKey,
  Transaction,
} from "@x402/hedera";
import { ExactHederaScheme } from "@x402/hedera/exact/client";
import {
  decodePaymentRequiredHeader,
  encodePaymentSignatureHeader,
  decodePaymentResponseHeader,
} from "@x402/core/http";
import {
  validateTokenTerms,
  validateTokenTransfer,
  type TokenTerms,
} from "../src/lib/hedera/commerce";
import { trustedBase } from "../src/lib/hedera/a2a";
import {
  validateEvidence,
  validateSettlement,
  normalizeTransactionId,
  type HederaCredentials,
} from "../src/lib/integrations/hedera";
import { decryptBrokerSecrets } from "../src/lib/integrations/ledger";
import {
  validateRepos,
  HEDERA_NETWORK,
  BLOCKY402_URL,
} from "../src/lib/repository-service";
import type { RepoEvidence } from "../src/lib/contracts";
import { acquireProcessLock } from "./process-lock";

export interface HtsRepositoryPurchase {
  requestId: string;
  resourceBaseUrl: string;
  providerId: "repo-standard";
  repos: string[];
  terms: TokenTerms;
  unitPriceAtomic: number;
  maxAmountAtomic: number;
  mandateExpiresAt: string;
  symbol: string;
  decimals: 0;
}
export interface HtsPurchaseResult {
  status: "settled";
  requestId: string;
  transactionId: string;
  network: typeof HEDERA_NETWORK;
  asset: string;
  payer: string;
  payTo: string;
  amountAtomic: number;
  units: number;
  evidence: RepoEvidence[];
  settlement: SettleResponse;
  explorerUrl: string;
}
interface Received {
  settlement: SettleResponse;
  evidence: RepoEvidence[];
}
interface Intent {
  version: 1;
  fingerprint: string;
  status: "intent" | "signed" | "received" | "settled";
  createdAt: string;
  input: HtsRepositoryPurchase;
  transactionId?: string;
  received?: Received;
  result?: HtsPurchaseResult;
}
const inputSchema = z
  .object({
    requestId: z.string().regex(/^[A-Za-z0-9_:-]{1,180}$/),
    resourceBaseUrl: z.string(),
    providerId: z.literal("repo-standard"),
    repos: z.array(z.string()).min(1).max(3),
    terms: z.unknown(),
    unitPriceAtomic: z.literal(1),
    maxAmountAtomic: z.number().int().min(1).max(3),
    mandateExpiresAt: z.iso.datetime({ offset: true }),
    symbol: z.string().regex(/^[A-Za-z0-9_-]{1,12}$/),
    decimals: z.literal(0),
  })
  .strict();
function validateInput(
  value: HtsRepositoryPurchase,
  credentials: HederaCredentials,
): HtsRepositoryPurchase {
  const parsed = inputSchema.parse(value),
    terms = validateTokenTerms(parsed.terms),
    repos = validateRepos(parsed.repos),
    base = trustedBase(parsed.resourceBaseUrl);
  if (
    !base.pathname.endsWith("/x402/hts/") ||
    credentials.accountId !== terms.payer ||
    !credentials.privateKey ||
    terms.amountAtomic !== parsed.unitPriceAtomic * repos.length ||
    terms.amountAtomic > parsed.maxAmountAtomic
  )
    throw Error(
      "Invalid pinned HTS resource, payer or bounded token authority.",
    );
  return { ...parsed, terms, repos, resourceBaseUrl: base.href };
}
function active(input: HtsRepositoryPurchase) {
  if (Date.parse(input.mandateExpiresAt) <= Date.now())
    throw Error("HTS mandate expired; no payment authorized.");
}
async function durableWrite(
  filename: string,
  value: unknown,
  exclusive = false,
) {
  await mkdir(dirname(filename), { recursive: true, mode: 0o700 });
  const temporary = exclusive ? filename : `${filename}.${randomUUID()}.tmp`,
    file = await open(temporary, exclusive ? "wx" : "w", 0o600);
  try {
    await file.writeFile(JSON.stringify(value));
    await file.sync();
  } finally {
    await file.close();
  }
  if (!exclusive) await rename(temporary, filename);
  const directory = await open(dirname(filename), "r");
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}
async function readJson(url: string | URL, options: RequestInit = {}) {
  const response = await fetch(url, {
    ...options,
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw Error(
      "Read-only token configuration, proof or resource receipt unavailable.",
    );
  return response.json();
}
function exactRequirements(
  value: PaymentRequirements,
  input: HtsRepositoryPurchase,
  feePayer: string,
) {
  if (
    value.scheme !== "exact" ||
    value.network !== HEDERA_NETWORK ||
    value.asset !== input.terms.asset ||
    value.payTo !== input.terms.payTo ||
    !/^\d+$/.test(value.amount) ||
    BigInt(value.amount) !== BigInt(input.terms.amountAtomic) ||
    value.extra?.feePayer !== feePayer ||
    !/^0\.0\.[1-9]\d*$/.test(feePayer) ||
    [input.terms.payer, input.terms.payTo].includes(feePayer) ||
    !Number.isInteger(value.maxTimeoutSeconds) ||
    value.maxTimeoutSeconds < 1 ||
    value.maxTimeoutSeconds > 120 ||
    (value.extra?.paymentFlow && value.extra.paymentFlow !== "authorization")
  )
    throw Error(
      "HTS x402 challenge violates exact asset, recipient, amount or facilitator mandate.",
    );
}
function received(
  value: Received,
  input: HtsRepositoryPurchase,
  transactionId: string,
): Received {
  const settlement = validateSettlement(value.settlement, input.terms.payer);
  if (
    normalizeTransactionId(settlement.transaction) !==
    normalizeTransactionId(transactionId)
  )
    throw Error(
      "HTS settlement differs from the signed transaction; reconcile.",
    );
  return {
    settlement,
    evidence: validateEvidence(value.evidence, input.repos),
  };
}
async function mirrorProof(
  transactionId: string,
  input: HtsRepositoryPurchase,
) {
  const body = await readJson(
    `https://testnet.mirrornode.hedera.com/api/v1/transactions/${encodeURIComponent(normalizeTransactionId(transactionId))}`,
  );
  validateTokenTransfer(body, input.terms);
}
function completed(
  input: HtsRepositoryPurchase,
  transactionId: string,
  value: Received,
): HtsPurchaseResult {
  return {
    status: "settled",
    requestId: input.requestId,
    transactionId,
    network: HEDERA_NETWORK,
    ...input.terms,
    units: input.repos.length,
    evidence: value.evidence,
    settlement: value.settlement,
    explorerUrl: `https://hashscan.io/testnet/transaction/${encodeURIComponent(transactionId)}`,
  };
}
async function recover(
  intent: Intent,
  input: HtsRepositoryPurchase,
  filename: string,
): Promise<HtsPurchaseResult> {
  if (!intent.transactionId)
    throw Error(
      "HTS purchase already attempted without a saved transaction; reconcile the intent.",
    );
  if (intent.result) {
    const checked = received(
      {
        settlement: intent.result.settlement,
        evidence: intent.result.evidence,
      },
      input,
      intent.transactionId,
    );
    return completed(input, intent.transactionId, checked);
  }
  // Recovery may only query the original native transaction and persisted resource receipt.
  await mirrorProof(intent.transactionId, input);
  let response = intent.received;
  if (!response) {
    const body = (await readJson(
      new URL(
        `receipts/${encodeURIComponent(intent.transactionId)}`,
        input.resourceBaseUrl,
      ),
    )) as {
      state?: string;
      transactionId?: string;
      providerId?: string;
      repos?: string[];
      amountAtomic?: number;
      asset?: string;
      settlement: SettleResponse;
      evidence: RepoEvidence[];
    };
    if (
      body.state !== "settled" ||
      normalizeTransactionId(body.transactionId ?? "") !==
        normalizeTransactionId(intent.transactionId) ||
      body.providerId !== input.providerId ||
      JSON.stringify(body.repos) !== JSON.stringify(input.repos) ||
      body.amountAtomic !== input.terms.amountAtomic ||
      body.asset !== input.terms.asset
    )
      throw Error("Stored HTS resource receipt differs from the paid request.");
    response = { settlement: body.settlement, evidence: body.evidence };
  }
  const checked = received(response, input, intent.transactionId),
    result = completed(input, intent.transactionId, checked);
  await durableWrite(filename, {
    ...intent,
    status: "settled",
    received: checked,
    result,
  });
  return result;
}

/** One signature and one paid HTTP dispatch per permanent identity. Never retries a paid request. */
export async function purchaseHtsRepositories(
  value: HtsRepositoryPurchase,
  credentials: HederaCredentials,
  directory: string,
): Promise<HtsPurchaseResult> {
  const input = validateInput(value, credentials),
    fingerprint = createHash("sha256")
      .update(JSON.stringify(input))
      .digest("hex"),
    filename = join(
      resolve(directory),
      "hts-" +
        createHash("sha256").update(input.requestId).digest("hex") +
        ".json",
    ),
    unlock = await acquireProcessLock(filename + ".lock");
  try {
    let previous: Intent | undefined;
    try {
      previous = JSON.parse(await readFile(filename, "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (previous) {
      if (previous.fingerprint !== fingerprint)
        throw Error("HTS request identity was reused with different terms.");
      return await recover(previous, input, filename);
    }
    active(input);
    const quote = (await readJson(new URL("quote", input.resourceBaseUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        providerId: input.providerId,
        repos: input.repos,
      }),
    })) as Record<string, unknown>;
    active(input);
    if (
      quote.providerId !== input.providerId ||
      quote.units !== input.repos.length ||
      quote.unitPriceAtomic !== input.unitPriceAtomic ||
      quote.amountAtomic !== input.terms.amountAtomic ||
      quote.payTo !== input.terms.payTo ||
      quote.network !== HEDERA_NETWORK ||
      quote.asset !== input.terms.asset ||
      quote.decimals !== 0 ||
      quote.symbol !== input.symbol ||
      typeof quote.expiresAt !== "string" ||
      !Number.isFinite(Date.parse(quote.expiresAt)) ||
      Date.parse(quote.expiresAt) <= Date.now()
    )
      throw Error(
        "HTS quote differs from the explicitly approved fixed test-credit terms.",
      );
    const metadata = (await readJson(
      `https://testnet.mirrornode.hedera.com/api/v1/tokens/${encodeURIComponent(input.terms.asset)}`,
    )) as {
      token_id?: string;
      type?: string;
      supply_type?: string;
      decimals?: number | string;
      symbol?: string;
      custom_fees?: Record<string, unknown>;
    };
    if (
      metadata.token_id !== input.terms.asset ||
      metadata.type !== "FUNGIBLE_COMMON" ||
      metadata.supply_type !== "FINITE" ||
      ![0, "0"].includes(metadata.decimals ?? -1) ||
      metadata.symbol !== input.symbol ||
      !metadata.custom_fees ||
      Object.values(metadata.custom_fees).some(
        (fees) => !Array.isArray(fees) || fees.length !== 0,
      )
    )
      throw Error(
        "Token metadata is not the pinned fee-free zero-decimal finite test credit.",
      );
    const endpoint = new URL(
        `evidence/${input.providerId}`,
        input.resourceBaseUrl,
      ),
      options: RequestInit = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": input.requestId,
        },
        body: JSON.stringify({ repos: input.repos }),
        redirect: "error",
        signal: AbortSignal.timeout(30000),
      };
    active(input);
    const unpaid = await fetch(endpoint, options);
    if (unpaid.status !== 402)
      throw Error("HTS resource did not return an x402 challenge.");
    const challengeHeader = unpaid.headers.get("PAYMENT-REQUIRED");
    if (!challengeHeader || challengeHeader.length > 24000)
      throw Error("Invalid HTS payment challenge.");
    const challenge = decodePaymentRequiredHeader(challengeHeader);
    if (
      challenge.x402Version !== 2 ||
      challenge.resource?.url !== endpoint.href ||
      challenge.accepts?.length !== 1
    )
      throw Error(
        "HTS challenge changed the exact resource or payment alternatives.",
      );
    const supported = (await readJson(`${BLOCKY402_URL}/supported`)) as {
      kinds?: {
        x402Version: number;
        scheme: string;
        network: string;
        extra?: { feePayer?: string };
      }[];
    };
    const feePayer = supported.kinds?.find(
      (kind) =>
        kind.x402Version === 2 &&
        kind.scheme === "exact" &&
        kind.network === HEDERA_NETWORK,
    )?.extra?.feePayer;
    if (!feePayer)
      throw Error("Blocky402 testnet native facilitator unavailable.");
    exactRequirements(challenge.accepts[0], input, feePayer);
    const key =
      credentials.keyType === "ecdsa"
        ? PrivateKey.fromStringECDSA(credentials.privateKey)
        : credentials.keyType === "ed25519"
          ? PrivateKey.fromStringED25519(credentials.privateKey)
          : PrivateKey.fromString(credentials.privateKey);
    const intent: Intent = {
      version: 1,
      fingerprint,
      status: "intent",
      createdAt: new Date().toISOString(),
      input,
    };
    await durableWrite(filename, intent, true);
    active(input);
    if (Date.parse(quote.expiresAt as string) <= Date.now())
      throw Error(
        "HTS quote expired before signing; reconcile this reserved intent.",
      );
    const signed = await new ExactHederaScheme(
      createClientHederaSigner(credentials.accountId, key, {
        network: HEDERA_NETWORK,
      }),
    ).createPaymentPayload(2, challenge.accepts[0]);
    if (typeof signed.payload.transaction !== "string")
      throw Error("HTS signer returned no transaction.");
    const transactionId = Transaction.fromBytes(
      Buffer.from(signed.payload.transaction, "base64"),
    ).transactionId?.toString();
    if (!transactionId)
      throw Error("HTS signed transaction lacks permanent identity.");
    intent.transactionId = transactionId;
    intent.status = "signed";
    await durableWrite(filename, intent);
    active(input);
    if (Date.parse(quote.expiresAt as string) <= Date.now())
      throw Error(
        "HTS quote expired before dispatch; reconcile signed intent.",
      );
    let response: Response;
    try {
      response = await fetch(endpoint, {
        ...options,
        headers: {
          ...options.headers,
          "PAYMENT-SIGNATURE": encodePaymentSignatureHeader({
            x402Version: 2,
            resource: challenge.resource,
            accepted: challenge.accepts[0],
            payload: signed.payload,
          }),
        },
        signal: AbortSignal.timeout(90000),
      });
    } catch {
      throw Error(
        "HTS payment transport uncertain; reconcile the saved transaction before retrying.",
      );
    }
    const settlementHeader = response.headers.get("PAYMENT-RESPONSE");
    if (!response.ok || !settlementHeader || settlementHeader.length > 24000)
      throw Error(
        "HTS payment result uncertain; reconcile the saved transaction.",
      );
    const body = (await response.json()) as { evidence: RepoEvidence[] };
    const checked = received(
      {
        settlement: decodePaymentResponseHeader(settlementHeader),
        evidence: body.evidence,
      },
      input,
      transactionId,
    );
    intent.status = "received";
    intent.received = checked;
    await durableWrite(filename, intent);
    await mirrorProof(transactionId, input);
    const result = completed(input, transactionId, checked);
    await durableWrite(filename, { ...intent, status: "settled", result });
    return result;
  } finally {
    await unlock();
  }
}
async function main() {
  const [inputFile] = process.argv.slice(2);
  if (!inputFile)
    throw Error("Private immutable HTS purchase input file required.");
  const input = JSON.parse(
    await readFile(resolve(inputFile), "utf8"),
  ) as HtsRepositoryPurchase;
  const pass =
    process.env.WALLET_PASS ||
    execFileSync(
      "security",
      ["find-generic-password", "-s", "obolos-speculos-ring-password", "-w"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
  const secrets = await decryptBrokerSecrets({
    ...process.env,
    WALLET_PASS: pass,
  });
  const result = await purchaseHtsRepositories(
    input,
    secrets.hedera,
    resolve(process.env.BROKER_DATA_DIR ?? "data/broker", "hedera"),
  );
  console.log(
    JSON.stringify({
      status: result.status,
      requestId: result.requestId,
      transactionId: result.transactionId,
      network: result.network,
      asset: result.asset,
      payer: result.payer,
      payTo: result.payTo,
      amountAtomic: result.amountAtomic,
      units: result.units,
      explorerUrl: result.explorerUrl,
    }),
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main().catch(() => {
    console.error(
      "HTS buyer stopped. Reconcile the original private intent and transaction; do not repeat payment under another identity.",
    );
    process.exitCode = 1;
  });
