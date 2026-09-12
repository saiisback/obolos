import { describe, it, expect, vi } from "vitest";
import {
  createAgentCard,
  handleA2ARequest,
  verifyA2AOffer,
  validateSellerOffer,
  purchaseAcceptedOffer,
  type A2AConfig,
} from "../src/lib/hedera/a2a";
import type { DataPurchase } from "../src/lib/contracts";
import { createQuote } from "../src/lib/repository-service";

const config: A2AConfig = {
  publicUrl: "https://obolos.example",
  resourceBaseUrl: "https://data.example/",
  payTo: "0.0.123",
  offerSecret: "a".repeat(40),
};
const quote = async (providerId: string, repos: string[]) =>
  createQuote(
    providerId,
    repos,
    { "repo-standard": 100, "repo-economy": 80 },
    config.payTo,
  );
const proposal = {
  action: "propose",
  payer: "0.0.777",
  requestId: "request-1",
  providerId: "repo-standard",
  repos: ["vercel/next.js"],
  maxAmountAtomic: 100,
  mandateExpiresAt: new Date(Date.now() + 3600000).toISOString(),
};
const rpc = (data: unknown, contextId?: string) => ({
  jsonrpc: "2.0",
  id: "rpc-1",
  method: "message/send",
  params: {
    message: {
      kind: "message",
      role: "user",
      messageId: "message-1",
      parts: [{ kind: "data", data }],
      ...(contextId ? { contextId } : {}),
    },
  },
});
async function offer() {
  const response = await handleA2ARequest(rpc(proposal), config, quote);
  if (!("result" in response)) throw Error("No result");
  return response.result.parts[0].data as {
    offerToken: string;
    offerId: string;
    contextId: string;
    requestId: string;
  };
}

describe("A2A 0.3.0 native HBAR negotiation", () => {
  it("publishes the real JSONRPC endpoint and honest message-only lifecycle", () => {
    expect(createAgentCard(config)).toMatchObject({
      protocolVersion: "0.3.0",
      url: "https://obolos.example/api/hedera/a2a",
      preferredTransport: "JSONRPC",
      defaultInputModes: ["application/json"],
      capabilities: { streaming: false, pushNotifications: false },
    });
    expect(() =>
      createAgentCard({ ...config, publicUrl: "http://evil.example" }),
    ).toThrow();
  });
  it.each([
    null,
    [],
    { jsonrpc: "1.0", id: 1, method: "message/send" },
    { jsonrpc: "2.0", method: "message/send" },
    { jsonrpc: "2.0", id: {}, method: "message/send" },
  ])("rejects malformed JSONRPC %j", async (input) => {
    expect(await handleA2ARequest(input, config, quote)).toMatchObject({
      error: { code: -32600 },
    });
  });
  it.each([
    { repos: [] },
    { repos: ["a/b", "c/d", "e/f", "g/h"] },
    { repos: ["a/b", "A/B"] },
    { payer: "0.0.0" },
    { maxAmountAtomic: 0 },
    { maxAmountAtomic: 1.5 },
    { mandateExpiresAt: "bad" },
    { mandateExpiresAt: new Date(0).toISOString() },
  ])("rejects invalid purchase proposal %j", async (change) => {
    expect(
      await handleA2ARequest(rpc({ ...proposal, ...change }), config, quote),
    ).toMatchObject({ error: { code: -32602 } });
  });
  it("counteroffers below the service price without authorizing payment", async () => {
    expect(
      await handleA2ARequest(
        rpc({ ...proposal, maxAmountAtomic: 99 }),
        config,
        quote,
      ),
    ).toMatchObject({
      result: {
        kind: "message",
        parts: [
          {
            kind: "data",
            data: {
              action: "counteroffer",
              amountAtomic: 100,
              requiresNewMandate: true,
            },
          },
        ],
      },
    });
  });
  it("offers the exact service price even when buyer proposes more", async () => {
    const response = await handleA2ARequest(
      rpc({ ...proposal, maxAmountAtomic: 150 }),
      config,
      quote,
    );
    expect(response).toMatchObject({
      id: "rpc-1",
      result: {
        role: "agent",
        parts: [{ data: { action: "offer", amountAtomic: 100 } }],
      },
    });
  });
  it("binds acceptance to payer, context, exact resource and signed terms", async () => {
    const o = await offer();
    const accepted = await handleA2ARequest(
      rpc(
        {
          action: "accept",
          offerToken: o.offerToken,
          payer: proposal.payer,
          requestId: proposal.requestId,
        },
        o.contextId,
      ),
      config,
      quote,
    );
    expect(accepted).toMatchObject({
      result: {
        parts: [
          {
            data: {
              action: "accepted",
              offerId: o.offerId,
              resourceUrl: "https://data.example/evidence/repo-standard",
            },
          },
        ],
      },
    });
    expect(verifyA2AOffer(o.offerToken, config)).toMatchObject({
      payer: proposal.payer,
      repos: proposal.repos,
    });
    expect(
      await handleA2ARequest(
        rpc(
          {
            action: "accept",
            offerToken: o.offerToken,
            payer: "0.0.888",
            requestId: proposal.requestId,
          },
          o.contextId,
        ),
        config,
        quote,
      ),
    ).toMatchObject({ error: { code: -32602 } });
    expect(
      await handleA2ARequest(
        rpc(
          {
            action: "accept",
            offerToken: o.offerToken,
            payer: proposal.payer,
            requestId: "different",
          },
          o.contextId,
        ),
        config,
        quote,
      ),
    ).toMatchObject({ error: { code: -32602 } });
    expect(
      await handleA2ARequest(
        rpc(
          {
            action: "accept",
            offerToken: o.offerToken,
            payer: proposal.payer,
            requestId: proposal.requestId,
          },
          "different-context",
        ),
        config,
        quote,
      ),
    ).toMatchObject({ error: { code: -32602 } });
  });
  it("rejects tampering and expired signed offers", async () => {
    const o = await offer();
    expect(() => verifyA2AOffer(o.offerToken + "x", config)).toThrow();
    const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 120000);
    try {
      expect(() => verifyA2AOffer(o.offerToken, config)).toThrow(/expired/i);
    } finally {
      clock.mockRestore();
    }
  });
  it("does not assign a fake Task and implements core unknown task errors", async () => {
    for (const method of ["tasks/get", "tasks/cancel"])
      expect(
        await handleA2ARequest(
          { jsonrpc: "2.0", id: 1, method, params: { id: "unknown" } },
          config,
          quote,
        ),
      ).toMatchObject({ error: { code: -32001 } });
    expect(
      await handleA2ARequest(
        { ...rpc(proposal), method: "message/stream" },
        config,
        quote,
      ),
    ).toMatchObject({ error: { code: -32601 } });
  });
  it("refuses raw signing fields and unsupported parts", async () => {
    expect(
      await handleA2ARequest(
        rpc({ ...proposal, privateKey: "secret" }),
        config,
        quote,
      ),
    ).toMatchObject({ error: { code: -32602 } });
    const input = rpc(proposal);
    input.params.message.parts = [{ kind: "text", data: proposal }];
    expect(await handleA2ARequest(input, config, quote)).toMatchObject({
      error: { code: -32602 },
    });
  });
  it("uses the existing purchase identity, validates paid evidence, and propagates uncertainty", async () => {
    const o = await offer();
    const accepted = verifyA2AOffer(o.offerToken, config);
    const receipt = {
      id: "paid",
      requestId: accepted.paymentRequestId,
      mode: "live" as const,
      network: "hedera:testnet" as const,
      asset: "HBAR" as const,
      amountAtomic: 100,
      units: 1,
      provider: "repo-standard",
      status: "settled" as const,
      timestamp: new Date().toISOString(),
      transactionId: "0.0.777@1234567890.000000001",
    };
    const evidence = [
      {
        repo: "vercel/next.js",
        description: "Public source",
        stars: 1,
        forks: 1,
        openIssues: 1,
        pushedAt: "2026-09-01T00:00:00Z",
        language: "TypeScript",
        license: "MIT",
        sourceUrl: "https://api.github.com/repos/vercel/next.js",
        fetchedAt: new Date().toISOString(),
      },
    ];
    const purchase = vi.fn(async (_input: DataPurchase) => ({
      receipt,
      evidence,
    }));
    expect(
      await purchaseAcceptedOffer(
        accepted,
        { accountId: "0.0.777", privateKey: "private" },
        config.resourceBaseUrl,
        purchase,
      ),
    ).toMatchObject({ offerId: o.offerId, receipt });
    expect(purchase.mock.calls[0]?.[0]).toMatchObject({
      requestId: accepted.paymentRequestId,
      a2aOfferToken: o.offerToken,
    });
    await expect(
      purchaseAcceptedOffer(
        accepted,
        { accountId: "0.0.888", privateKey: "private" },
        config.resourceBaseUrl,
        purchase,
      ),
    ).rejects.toThrow(/payer/i);
    await expect(
      purchaseAcceptedOffer(
        accepted,
        { accountId: "0.0.777", privateKey: "private" },
        "https://other.example",
        purchase,
      ),
    ).rejects.toThrow(/resource/i);
    await expect(
      purchaseAcceptedOffer(
        accepted,
        { accountId: "0.0.777", privateKey: "private" },
        config.resourceBaseUrl,
        async () => ({ receipt, evidence: [] }),
      ),
    ).rejects.toThrow(/evidence/i);
    const uncertain = vi.fn(async () => {
      throw Error("already attempted; reconcile");
    });
    await expect(
      purchaseAcceptedOffer(
        accepted,
        { accountId: "0.0.777", privateKey: "private" },
        config.resourceBaseUrl,
        uncertain,
      ),
    ).rejects.toThrow(/reconcile/);
    expect(uncertain).toHaveBeenCalledTimes(1);
  });
  it("validates pinned seller offer terms without sharing the HMAC secret with a buyer", async () => {
    const o = await offer();
    const parsed = verifyA2AOffer(o.offerToken, config);
    expect(
      validateSellerOffer(
        parsed,
        proposal,
        config.resourceBaseUrl,
        config.payTo,
      ),
    ).toEqual(parsed);
    for (const mutation of [
      { payer: "0.0.888" },
      { amountAtomic: 1 },
      { offerId: "wrong" },
      { paymentRequestId: "wrong" },
      { resourceUrl: "https://other.example/evidence/repo-standard" },
    ])
      expect(() =>
        validateSellerOffer(
          { ...parsed, ...mutation },
          proposal,
          config.resourceBaseUrl,
          config.payTo,
        ),
      ).toThrow();
  });
  it("rejects invalid authoritative service quotes before issuing an offer", async () => {
    const valid = await quote(proposal.providerId, proposal.repos);
    for (const mutation of [
      { payTo: "0.0.999" },
      { network: "hedera:mainnet" },
      { asset: "USDC" },
      { units: 2 },
      { unitPriceAtomic: 1.5, amountAtomic: 1.5 },
      { expiresAt: "bad" },
    ])
      expect(
        await handleA2ARequest(rpc(proposal), config, async () => ({
          ...valid,
          ...mutation,
        })),
      ).toMatchObject({ error: { code: -32602 } });
  });
  it("enforces HTTP JSON parsing, size limits and public configuration boundaries", async () => {
    const { POST } = await import("../src/app/api/hedera/a2a/route");
    const { GET } = await import(
      "../src/app/.well-known/agent-card.json/route"
    );
    expect(
      (
        await POST(
          new Request("http://localhost/api/hedera/a2a", {
            method: "POST",
            body: "{}",
          }),
        )
      ).status,
    ).toBe(415);
    expect(
      await (
        await POST(
          new Request("http://localhost/api/hedera/a2a", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{",
          }),
        )
      ).json(),
    ).toMatchObject({ error: { code: -32700 } });
    expect(
      (
        await POST(
          new Request("http://localhost/api/hedera/a2a", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "x".repeat(16001),
          }),
        )
      ).status,
    ).toBe(413);
    vi.stubEnv("A2A_PUBLIC_URL", "");
    try {
      expect((await GET()).status).toBe(503);
    } finally {
      vi.unstubAllEnvs();
    }
    vi.stubEnv("A2A_PUBLIC_URL", config.publicUrl);
    vi.stubEnv("DATA_SERVICE_PUBLIC_URL", config.resourceBaseUrl);
    vi.stubEnv("HEDERA_PAY_TO", config.payTo);
    vi.stubEnv("A2A_OFFER_SECRET", config.offerSecret);
    try {
      const card = await GET();
      expect(card.status).toBe(200);
      expect(await card.json()).toMatchObject({ protocolVersion: "0.3.0" });
      expect(
        await (
          await POST(
            new Request("http://localhost/api/hedera/a2a", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "tasks/get",
                params: { id: "missing" },
              }),
            }),
          )
        ).json(),
      ).toMatchObject({ id: 1, error: { code: -32001 } });
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it("integrates real native signing and exact paid resource validation with the existing adapter", async () => {
    const { mkdtemp, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { PrivateKey, Transaction } = await import("@x402/hedera");
    const directory = await mkdtemp(join(tmpdir(), "obolos-a2a-test-"));
    vi.stubEnv("DATA_SERVICE_URL", config.resourceBaseUrl);
    vi.stubEnv("HEDERA_PAY_TO", config.payTo);
    vi.stubEnv("BROKER_DATA_DIR", directory);
    const o = await offer();
    const accepted = verifyA2AOffer(o.offerToken, config);
    const evidence = [
      {
        repo: "vercel/next.js",
        description: "Source",
        stars: 1,
        forks: 1,
        openIssues: 1,
        pushedAt: "2026-09-01T00:00:00Z",
        language: "TypeScript",
        license: "MIT",
        sourceUrl: "https://api.github.com/repos/vercel/next.js",
        fetchedAt: new Date().toISOString(),
      },
    ];
    const requirements = {
      scheme: "exact",
      network: "hedera:testnet",
      asset: "0.0.0",
      amount: "100",
      payTo: config.payTo,
      maxTimeoutSeconds: 60,
      extra: { feePayer: "0.0.456" },
    };
    let paid = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: URL | string, options?: RequestInit) => {
        if (String(url).endsWith("/supported"))
          return Response.json({
            kinds: [
              {
                x402Version: 2,
                scheme: "exact",
                network: "hedera:testnet",
                extra: { feePayer: "0.0.456" },
              },
            ],
          });
        if (String(url).startsWith("https://testnet.mirrornode.hedera.com/"))
          return Response.json({
            transactions: [
              {
                name: "CRYPTOTRANSFER",
                result: "SUCCESS",
                transfers: [
                  { account: proposal.payer, amount: -100 },
                  { account: config.payTo, amount: 100 },
                ],
              },
            ],
          });
        expect(String(url)).toBe(accepted.resourceUrl);
        expect(JSON.parse(String(options?.body))).toEqual({
          repos: proposal.repos,
          a2aOfferToken: accepted.offerToken,
        });
        expect(new Headers(options?.headers).get("Idempotency-Key")).toBe(
          accepted.paymentRequestId,
        );
        const signature = new Headers(options?.headers).get(
          "PAYMENT-SIGNATURE",
        );
        if (signature) {
          paid++;
          const payload = JSON.parse(
            Buffer.from(signature, "base64").toString("utf8"),
          );
          const transaction = Transaction.fromBytes(
            Buffer.from(payload.payload.transaction, "base64"),
          ).transactionId!.toString();
          return Response.json(
            { evidence },
            {
              headers: {
                "PAYMENT-RESPONSE": Buffer.from(
                  JSON.stringify({
                    success: true,
                    payer: proposal.payer,
                    network: "hedera:testnet",
                    transaction,
                  }),
                ).toString("base64"),
              },
            },
          );
        }
        return new Response(null, {
          status: 402,
          headers: {
            "PAYMENT-REQUIRED": Buffer.from(
              JSON.stringify({
                x402Version: 2,
                resource: { url: accepted.resourceUrl },
                accepts: [requirements],
              }),
            ).toString("base64"),
          },
        });
      }),
    );
    try {
      const result = await purchaseAcceptedOffer(
        accepted,
        {
          accountId: proposal.payer,
          privateKey: PrivateKey.generateED25519().toStringDer(),
        },
        config.resourceBaseUrl,
      );
      expect(result).toMatchObject({
        offerId: accepted.offerId,
        evidence,
        receipt: {
          mode: "live",
          status: "settled",
          requestId: accepted.paymentRequestId,
        },
      });
      expect(paid).toBe(1);
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
