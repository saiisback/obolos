import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { DataPurchase, Receipt, RepoEvidence } from "../contracts";
import {
  purchaseHederaData,
  validateEvidence,
  type HederaCredentials,
} from "../integrations/hedera";
import {
  validateRepos,
  HEDERA_NETWORK,
  HBAR_ASSET,
} from "../repository-service";

export const A2A_EXTENSION = "https://obolos.dev/extensions/hedera-commerce/v1";
export interface A2AConfig {
  publicUrl: string;
  resourceBaseUrl: string;
  payTo: string;
  offerSecret: string;
  uaid?: string;
}
const account = z.string().regex(/^0\.0\.[1-9]\d*$/);
const identity = z.string().regex(/^[A-Za-z0-9_-]{1,120}$/);
const atomic = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const proposalSchema = z
  .object({
    action: z.literal("propose"),
    payer: account,
    requestId: identity,
    providerId: z.enum(["repo-standard", "repo-economy"]),
    repos: z.array(z.string()).min(1).max(3),
    maxAmountAtomic: atomic,
    mandateExpiresAt: z.iso.datetime({ offset: true }),
  })
  .strict();
const acceptSchema = z
  .object({
    action: z.literal("accept"),
    payer: account,
    requestId: identity,
    offerToken: z.string().min(1).max(12000),
  })
  .strict();
const offerSchema = z
  .object({
    version: z.literal(1),
    contextId: identity,
    requestId: identity,
    payer: account,
    providerId: z.enum(["repo-standard", "repo-economy"]),
    repos: z.array(z.string()).min(1).max(3),
    resourceUrl: z.string(),
    unitPriceAtomic: atomic,
    amountAtomic: atomic,
    maxAmountAtomic: atomic,
    mandateExpiresAt: z.iso.datetime({ offset: true }),
    issuedAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    network: z.literal(HEDERA_NETWORK),
    asset: z.literal(HBAR_ASSET),
    payTo: account,
  })
  .strict();
type OfferPayload = z.infer<typeof offerSchema>;
export type A2AOffer = OfferPayload & {
  offerId: string;
  paymentRequestId: string;
  offerToken: string;
};
type Quote = {
  providerId: string;
  unitPriceAtomic: number;
  units: number;
  amountAtomic: number;
  network: string;
  asset: string;
  payTo: string;
  expiresAt: string;
};
export type A2AQuote = (providerId: string, repos: string[]) => Promise<Quote>;
type Message = {
  kind: "message";
  role: "agent";
  messageId: string;
  contextId: string;
  parts: { kind: "data"; data: Record<string, unknown> }[];
  extensions: string[];
};
export type A2AResponse =
  | { jsonrpc: "2.0"; id: string | number | null; result: Message }
  | {
      jsonrpc: "2.0";
      id: string | number | null;
      error: { code: number; message: string };
    };

export function trustedBase(value: string): URL {
  const url = new URL(value);
  if (
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
      )) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw Error("HTTPS or loopback URL required.");
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url;
}
export function a2aConfiguration(
  env: Record<string, string | undefined> = process.env,
): A2AConfig {
  const config = {
    publicUrl: env.A2A_PUBLIC_URL ?? "",
    resourceBaseUrl: env.DATA_SERVICE_PUBLIC_URL ?? env.DATA_SERVICE_URL ?? "",
    payTo: env.HEDERA_PAY_TO ?? "",
    offerSecret: env.A2A_OFFER_SECRET ?? "",
    ...(env.HEDERA_SERVICE_UAID ? { uaid: env.HEDERA_SERVICE_UAID } : {}),
  };
  validateConfig(config);
  return config;
}
function validateConfig(config: A2AConfig) {
  trustedBase(config.publicUrl);
  trustedBase(config.resourceBaseUrl);
  account.parse(config.payTo);
  if (Buffer.byteLength(config.offerSecret) < 32)
    throw Error("Configure a private A2A_OFFER_SECRET with at least 32 bytes.");
}
export function createAgentCard(config: A2AConfig) {
  validateConfig(config);
  const url = new URL("api/hedera/a2a", trustedBase(config.publicUrl)).href;
  return {
    protocolVersion: "0.3.0",
    name: "Obolos Hedera repository agent",
    description:
      "Negotiate one to three public repository evidence units; accepted offers are paid privately with native testnet HBAR through Blocky402. Negotiation returns Messages; it does not start a server Task.",
    url,
    preferredTransport: "JSONRPC",
    additionalInterfaces: [{ url, transport: "JSONRPC" }],
    version: "1.0.0",
    capabilities: {
      streaming: false,
      pushNotifications: false,
      extensions: [
        {
          uri: A2A_EXTENSION,
          required: true,
          description:
            "Payer-bound signed offers and privately executed x402 acceptance.",
          params: {
            network: HEDERA_NETWORK,
            asset: HBAR_ASSET,
            maxUnits: 3,
            ...(config.uaid ? { uaid: config.uaid } : {}),
          },
        },
      ],
    },
    defaultInputModes: ["application/json"],
    defaultOutputModes: ["application/json"],
    skills: [
      {
        id: "repository-evidence",
        name: "Public repository evidence",
        description:
          "Propose repositories and an approved maximum in tinybar; accept the signed offer and execute its exact paid resource request with the private buyer.",
        tags: ["hedera", "x402", "repository-evidence"],
        examples: [
          "Propose one public repository at a maximum of 100000 tinybar.",
        ],
      },
    ],
    supportsAuthenticatedExtendedCard: false,
  };
}
function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
function sign(payload: OfferPayload, config: A2AConfig): A2AOffer {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", config.offerSecret)
    .update(body)
    .digest("base64url");
  const offerToken = `${body}.${signature}`;
  const offerId = hash(JSON.stringify(payload));
  return {
    ...payload,
    offerId,
    paymentRequestId: `a2a:${offerId}`,
    offerToken,
  };
}
/** Stateless authorization; the resource service separately claims offerId durably before dispatch. */
export function verifyA2AOffer(
  token: string,
  config: A2AConfig = a2aConfiguration(),
  allowExpired = false,
): A2AOffer {
  validateConfig(config);
  if (typeof token !== "string" || token.length > 12000)
    throw Error("Invalid offer.");
  const [body, signature, ...extra] = token.split(".");
  if (
    !body ||
    !signature ||
    extra.length ||
    !/^[-_A-Za-z0-9]+$/.test(body) ||
    !/^[-_A-Za-z0-9]{43}$/.test(signature)
  )
    throw Error("Invalid offer.");
  const expected = createHmac("sha256", config.offerSecret)
    .update(body)
    .digest();
  const actual = Buffer.from(signature, "base64url");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
    throw Error("Invalid signed offer.");
  const payload = offerSchema.parse(
    JSON.parse(Buffer.from(body, "base64url").toString("utf8")),
  );
  validateRepos(payload.repos);
  const expiry = Date.parse(payload.expiresAt),
    issued = Date.parse(payload.issuedAt),
    mandate = Date.parse(payload.mandateExpiresAt);
  if (
    !Number.isFinite(expiry) ||
    !Number.isFinite(issued) ||
    issued > Date.now() + 1000 ||
    expiry <= issued ||
    expiry - issued > 60000 ||
    expiry > mandate ||
    (!allowExpired && (expiry <= Date.now() || mandate <= Date.now()))
  )
    throw Error("Signed offer expired or has invalid bounds.");
  if (
    payload.payTo !== config.payTo ||
    payload.payer === config.payTo ||
    payload.resourceUrl !==
      new URL(
        `evidence/${payload.providerId}`,
        trustedBase(config.resourceBaseUrl),
      ).href ||
    payload.amountAtomic !== payload.unitPriceAtomic * payload.repos.length ||
    payload.amountAtomic > payload.maxAmountAtomic
  )
    throw Error("Offer violates exact resource or mandate.");
  const offerId = hash(JSON.stringify(payload));
  return {
    ...payload,
    offerId,
    paymentRequestId: `a2a:${offerId}`,
    offerToken: token,
  };
}
/** Clients trust the explicitly pinned HTTPS seller, never obtain its HMAC signing secret. */
export function validateSellerOffer(
  value: unknown,
  proposal: unknown,
  resourceBaseUrl: string,
  payTo: string,
): A2AOffer {
  const p = proposalSchema.parse(proposal);
  const object = value as A2AOffer;
  if (
    !object ||
    typeof object.offerToken !== "string" ||
    object.offerToken.length > 12000
  )
    throw Error("Invalid seller offer.");
  const [body, signature, ...extra] = object.offerToken.split(".");
  if (
    !body ||
    !signature ||
    extra.length ||
    !/^[-_A-Za-z0-9]{43}$/.test(signature)
  )
    throw Error("Invalid seller offer token.");
  const payload = offerSchema.parse(
    JSON.parse(Buffer.from(body, "base64url").toString("utf8")),
  );
  validateRepos(payload.repos);
  const offerId = hash(JSON.stringify(payload));
  const expected = {
    ...payload,
    offerId,
    paymentRequestId: `a2a:${offerId}`,
    offerToken: object.offerToken,
  };
  if (
    Object.entries(expected).some(
      ([key, v]) =>
        JSON.stringify(object[key as keyof A2AOffer]) !== JSON.stringify(v),
    ) ||
    payload.requestId !== p.requestId ||
    payload.payer !== p.payer ||
    payload.providerId !== p.providerId ||
    JSON.stringify(payload.repos) !== JSON.stringify(p.repos) ||
    payload.maxAmountAtomic !== p.maxAmountAtomic ||
    payload.mandateExpiresAt !== p.mandateExpiresAt ||
    payload.payTo !== payTo ||
    payload.payer === payTo ||
    payload.resourceUrl !==
      new URL(`evidence/${p.providerId}`, trustedBase(resourceBaseUrl)).href ||
    payload.amountAtomic !== payload.unitPriceAtomic * p.repos.length ||
    payload.amountAtomic > p.maxAmountAtomic ||
    Date.parse(payload.expiresAt) <= Date.now() ||
    Date.parse(payload.expiresAt) > Date.parse(p.mandateExpiresAt) ||
    Date.parse(payload.issuedAt) > Date.now() + 1000 ||
    Date.parse(payload.expiresAt) <= Date.parse(payload.issuedAt) ||
    Date.parse(payload.expiresAt) - Date.parse(payload.issuedAt) > 60000
  )
    throw Error("Seller offer differs from approved exact purchase.");
  return expected;
}
function message(contextId: string, data: Record<string, unknown>): Message {
  return {
    kind: "message",
    role: "agent",
    contextId,
    messageId: `response-${hash(JSON.stringify(data)).slice(0, 32)}`,
    parts: [{ kind: "data", data }],
    extensions: [A2A_EXTENSION],
  };
}
export async function handleA2ARequest(
  input: unknown,
  config: A2AConfig,
  quote: A2AQuote,
): Promise<A2AResponse> {
  const r = input as {
    jsonrpc?: unknown;
    id?: unknown;
    method?: unknown;
    params?: unknown;
  };
  let id: string | number | null = null;
  const error = (code: number, text: string): A2AResponse => ({
    jsonrpc: "2.0",
    id,
    error: { code, message: text },
  });
  if (
    !r ||
    Array.isArray(r) ||
    r.jsonrpc !== "2.0" ||
    !(
      (typeof r.id === "string" && r.id.length <= 180) ||
      (typeof r.id === "number" && Number.isSafeInteger(r.id)) ||
      r.id === null
    ) ||
    typeof r.method !== "string"
  )
    return error(-32600, "Invalid Request");
  id = r.id as string | number | null;
  if (["tasks/get", "tasks/cancel"].includes(r.method)) {
    const task = z
      .object({
        id: z.string().min(1),
        historyLength: z.number().int().nonnegative().optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      })
      .strict()
      .safeParse(r.params);
    return task.success
      ? error(
          -32001,
          "Task not found. This agent returns Messages without creating Tasks.",
        )
      : error(-32602, "Invalid params");
  }
  if (r.method !== "message/send") return error(-32601, "Method not found");
  try {
    validateConfig(config);
    const params = z
      .object({
        message: z
          .object({
            kind: z.literal("message"),
            role: z.literal("user"),
            messageId: z.string().min(1).max(180),
            contextId: identity.optional(),
            taskId: z.string().optional(),
            parts: z
              .array(
                z
                  .object({
                    kind: z.literal("data"),
                    data: z.record(z.string(), z.unknown()),
                  })
                  .strict(),
              )
              .length(1),
            extensions: z.array(z.string()).optional(),
            metadata: z.record(z.string(), z.unknown()).optional(),
          })
          .strict(),
        configuration: z
          .object({
            acceptedOutputModes: z.array(z.string()).optional(),
            blocking: z.boolean().optional(),
            historyLength: z.number().int().nonnegative().optional(),
          })
          .strict()
          .optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      })
      .strict()
      .parse(r.params);
    if (params.message.taskId) return error(-32001, "Task not found");
    if (
      params.configuration?.acceptedOutputModes &&
      !params.configuration.acceptedOutputModes.includes("application/json")
    )
      return error(-32005, "Unsupported content type");
    const data = params.message.parts[0].data;
    if (data.action === "accept") {
      const acceptance = acceptSchema.parse(data);
      const offer = verifyA2AOffer(acceptance.offerToken, config);
      if (
        offer.payer !== acceptance.payer ||
        offer.requestId !== acceptance.requestId ||
        params.message.contextId !== offer.contextId
      )
        throw Error("Identity mismatch");
      return {
        jsonrpc: "2.0",
        id,
        result: message(offer.contextId, {
          action: "accepted",
          ...offer,
          paymentStatus: "required",
          instructions:
            "Execute the exact resource privately through purchaseHederaData; retain the offer-linked receipt and validated evidence.",
        }),
      };
    }
    const proposal = proposalSchema.parse(data);
    const repos = validateRepos(proposal.repos);
    const mandate = Date.parse(proposal.mandateExpiresAt);
    if (mandate <= Date.now() || proposal.payer === config.payTo)
      throw Error("Expired mandate");
    const q = await quote(proposal.providerId, repos);
    if (
      q.providerId !== proposal.providerId ||
      q.units !== repos.length ||
      q.amountAtomic !== q.unitPriceAtomic * repos.length ||
      !Number.isSafeInteger(q.unitPriceAtomic) ||
      q.unitPriceAtomic < 1 ||
      !Number.isSafeInteger(q.amountAtomic) ||
      q.amountAtomic < 1 ||
      q.network !== HEDERA_NETWORK ||
      q.asset !== "HBAR" ||
      q.payTo !== config.payTo ||
      !Number.isFinite(Date.parse(q.expiresAt)) ||
      Date.parse(q.expiresAt) <= Date.now()
    )
      throw Error("Invalid quote");
    const contextId = `commerce-${hash(JSON.stringify({ payer: proposal.payer, requestId: proposal.requestId })).slice(0, 40)}`;
    if (params.message.contextId && params.message.contextId !== contextId)
      throw Error("Identity mismatch");
    if (proposal.maxAmountAtomic < q.amountAtomic)
      return {
        jsonrpc: "2.0",
        id,
        result: message(contextId, {
          action: "counteroffer",
          providerId: q.providerId,
          units: q.units,
          unitPriceAtomic: q.unitPriceAtomic,
          amountAtomic: q.amountAtomic,
          requiresNewMandate: true,
        }),
      };
    const now = Date.now();
    const offer = sign(
      {
        version: 1,
        contextId,
        requestId: proposal.requestId,
        payer: proposal.payer,
        providerId: proposal.providerId,
        repos,
        resourceUrl: new URL(
          `evidence/${proposal.providerId}`,
          trustedBase(config.resourceBaseUrl),
        ).href,
        unitPriceAtomic: q.unitPriceAtomic,
        amountAtomic: q.amountAtomic,
        maxAmountAtomic: proposal.maxAmountAtomic,
        mandateExpiresAt: proposal.mandateExpiresAt,
        issuedAt: new Date(now).toISOString(),
        expiresAt: new Date(
          Math.min(now + 60000, mandate, Date.parse(q.expiresAt)),
        ).toISOString(),
        network: HEDERA_NETWORK,
        asset: HBAR_ASSET,
        payTo: config.payTo,
      },
      config,
    );
    return {
      jsonrpc: "2.0",
      id,
      result: message(contextId, {
        action: "offer",
        ...offer,
        paymentStatus: "unpaid",
      }),
    };
  } catch {
    return error(
      -32602,
      "Invalid params, expired authorization or unavailable valid service quote",
    );
  }
}

/** Trusted buyer only; no retry wrapper and no key ever enters an A2A HTTP message. */
export async function purchaseAcceptedOffer(
  offer: A2AOffer,
  credentials: HederaCredentials,
  resourceBaseUrl: string,
  purchase: (
    input: DataPurchase,
    credentials: HederaCredentials,
  ) => Promise<{
    receipt: Receipt;
    evidence: RepoEvidence[];
  }> = purchaseHederaData,
) {
  if (credentials.accountId !== offer.payer)
    throw Error("Offer payer differs from private payer.");
  if (
    new URL(`evidence/${offer.providerId}`, trustedBase(resourceBaseUrl))
      .href !== offer.resourceUrl
  )
    throw Error("Private resource differs from accepted exact resource.");
  if (
    Date.parse(offer.expiresAt) <= Date.now() ||
    Date.parse(offer.mandateExpiresAt) <= Date.now()
  )
    throw Error("Accepted offer expired.");
  const result = await purchase(
    {
      runId: offer.contextId,
      requestId: offer.paymentRequestId,
      repos: offer.repos,
      providerId: offer.providerId,
      maxAmountAtomic: offer.maxAmountAtomic,
      unitPriceAtomic: offer.unitPriceAtomic,
      mandateExpiresAt: offer.expiresAt,
      a2aOfferToken: offer.offerToken,
    },
    credentials,
  );
  const receipt = result.receipt;
  if (
    receipt.requestId !== offer.paymentRequestId ||
    receipt.mode !== "live" ||
    receipt.status !== "settled" ||
    receipt.network !== HEDERA_NETWORK ||
    receipt.asset !== "HBAR" ||
    receipt.provider !== offer.providerId ||
    receipt.units !== offer.repos.length ||
    receipt.amountAtomic !== offer.amountAtomic ||
    !receipt.transactionId
  )
    throw Error(
      "Paid receipt does not match the accepted offer; reconcile before retrying.",
    );
  return {
    offerId: offer.offerId,
    contextId: offer.contextId,
    payer: offer.payer,
    resourceUrl: offer.resourceUrl,
    receipt,
    evidence: validateEvidence(result.evidence, offer.repos),
  };
}
