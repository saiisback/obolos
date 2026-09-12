import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrivateKey, Transaction } from "@x402/hedera";
import {
  purchaseHtsRepositories,
  type HtsRepositoryPurchase,
} from "../scripts/hedera-token-buyer";

const input: HtsRepositoryPurchase = {
  requestId: "hts-test-1",
  resourceBaseUrl: "https://obolos.example/x402/hts/",
  providerId: "repo-standard",
  repos: ["vercel/next.js"],
  terms: {
    asset: "0.0.900",
    payer: "0.0.777",
    payTo: "0.0.123",
    amountAtomic: 1,
  },
  unitPriceAtomic: 1,
  maxAmountAtomic: 3,
  mandateExpiresAt: new Date(Date.now() + 3600000).toISOString(),
  symbol: "OBTEST",
  decimals: 0,
};
const credentials = {
  accountId: input.terms.payer,
  privateKey: PrivateKey.generateED25519().toStringDer(),
};
const requirements = {
  scheme: "exact",
  network: "hedera:testnet",
  asset: input.terms.asset,
  amount: "1",
  payTo: input.terms.payTo,
  maxTimeoutSeconds: 60,
  extra: { feePayer: "0.0.456" },
};
const evidence = [
  {
    repo: input.repos[0],
    description: "Public source",
    stars: 1,
    forks: 2,
    openIssues: 0,
    pushedAt: "2026-09-01T00:00:00Z",
    language: "TypeScript",
    license: "MIT",
    sourceUrl: "https://api.github.com/repos/vercel/next.js",
    fetchedAt: new Date().toISOString(),
  },
];
const proof = {
  transactions: [
    {
      name: "CRYPTOTRANSFER",
      result: "SUCCESS",
      token_transfers: [
        { token_id: input.terms.asset, account: input.terms.payer, amount: -1 },
        { token_id: input.terms.asset, account: input.terms.payTo, amount: 1 },
      ],
    },
  ],
};
let directory: string, paid: number, transactionId: string;
type Changes = {
  requirements?: Record<string, unknown>;
  quote?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  proof?: unknown;
  interrupt?: boolean;
  badEvidence?: boolean;
  badSettlement?: boolean;
  receiptUnavailable?: boolean;
};
function fixture(changes: Changes = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: URL | string, options?: RequestInit) => {
      const address = String(url);
      if (address.endsWith("/supported"))
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
      if (address.includes("/api/v1/tokens/"))
        return Response.json({
          token_id: input.terms.asset,
          type: "FUNGIBLE_COMMON",
          supply_type: "FINITE",
          decimals: "0",
          symbol: input.symbol,
          custom_fees: {
            fixed_fees: [],
            fractional_fees: [],
            royalty_fees: [],
          },
          ...changes.metadata,
        });
      if (address.includes("/api/v1/transactions/"))
        return Response.json(changes.proof ?? proof);
      if (address.includes("/receipts/"))
        return changes.receiptUnavailable
          ? new Response(null, { status: 404 })
          : Response.json({
              state: "settled",
              transactionId,
              providerId: input.providerId,
              repos: input.repos,
              amountAtomic: 1,
              asset: input.terms.asset,
              settlement: {
                success: true,
                network: "hedera:testnet",
                payer: input.terms.payer,
                transaction: transactionId,
              },
              evidence,
            });
      if (address.endsWith("/quote"))
        return Response.json({
          providerId: input.providerId,
          unitPriceAtomic: 1,
          units: 1,
          amountAtomic: 1,
          network: "hedera:testnet",
          asset: input.terms.asset,
          payTo: input.terms.payTo,
          expiresAt: new Date(Date.now() + 60000).toISOString(),
          decimals: 0,
          symbol: input.symbol,
          ...changes.quote,
        });
      expect(address).toBe(input.resourceBaseUrl + "evidence/repo-standard");
      expect(JSON.parse(String(options?.body))).toEqual({ repos: input.repos });
      const signature = new Headers(options?.headers).get("PAYMENT-SIGNATURE");
      if (signature) {
        paid++;
        const payload = JSON.parse(
          Buffer.from(signature, "base64").toString("utf8"),
        );
        transactionId = Transaction.fromBytes(
          Buffer.from(payload.payload.transaction, "base64"),
        ).transactionId!.toString();
        const intentFile = join(
          directory,
          "hts-" +
            createHash("sha256").update(input.requestId).digest("hex") +
            ".json",
        );
        expect(JSON.parse(await readFile(intentFile, "utf8"))).toMatchObject({
          status: "signed",
          transactionId,
        });
        if (changes.interrupt) throw Error("Transport interrupted");
        return Response.json(
          { evidence: changes.badEvidence ? [] : evidence },
          {
            headers: {
              "PAYMENT-RESPONSE": Buffer.from(
                JSON.stringify({
                  success: true,
                  network: "hedera:testnet",
                  payer: input.terms.payer,
                  transaction: changes.badSettlement
                    ? "0.0.456@1000000000.000000001"
                    : transactionId,
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
              resource: {
                url: input.resourceBaseUrl + "evidence/repo-standard",
              },
              accepts: [{ ...requirements, ...changes.requirements }],
            }),
          ).toString("base64"),
        },
      });
    }),
  );
}
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "obolos-hts-test-"));
  paid = 0;
  transactionId = "";
});
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await rm(directory, { recursive: true, force: true });
});
describe("private native HTS x402 buyer", () => {
  it.each([
    { terms: { ...input.terms, asset: "0.0.0" } },
    { terms: { ...input.terms, payer: "0.0.888" } },
    { terms: { ...input.terms, amountAtomic: 2 } },
    { maxAmountAtomic: 4 },
    { decimals: 6 },
    { repos: ["a/b", "c/d", "e/f", "g/h"] },
    { resourceBaseUrl: "http://evil.example/x402/hts/" },
  ])("refuses unsafe authorization %j", async (change) => {
    fixture();
    await expect(
      purchaseHtsRepositories(
        { ...input, ...change } as HtsRepositoryPurchase,
        credentials,
        directory,
      ),
    ).rejects.toThrow();
    expect(paid).toBe(0);
  });
  it.each([
    { asset: "0.0.0" },
    { asset: "0.0.999" },
    { payTo: "0.0.999" },
    { amount: "2" },
    { network: "hedera:mainnet" },
    { extra: { feePayer: "0.0.999" } },
  ])("refuses changed challenge %j before signing", async (mutation) => {
    fixture({ requirements: mutation });
    await expect(
      purchaseHtsRepositories(input, credentials, directory),
    ).rejects.toThrow();
    expect(paid).toBe(0);
  });
  it.each([
    { decimals: "6" },
    { token_id: "0.0.999" },
    { supply_type: "INFINITE" },
    {
      custom_fees: {
        fixed_fees: [{ amount: 1 }],
        fractional_fees: [],
        royalty_fees: [],
      },
    },
  ])("rejects token metadata %j", async (mutation) => {
    fixture({ metadata: mutation });
    await expect(
      purchaseHtsRepositories(input, credentials, directory),
    ).rejects.toThrow();
    expect(paid).toBe(0);
  });
  it("signs the exact native token transfer once and returns real validated purchased data", async () => {
    fixture();
    const result = await purchaseHtsRepositories(input, credentials, directory);
    expect(result).toMatchObject({
      transactionId,
      asset: input.terms.asset,
      amountAtomic: 1,
      evidence,
      status: "settled",
    });
    expect(paid).toBe(1);
    expect(
      await purchaseHtsRepositories(input, credentials, directory),
    ).toEqual(result);
    expect(paid).toBe(1);
  });
  it("never dispatches another payment after interrupted transport, recovering only stored server data and mirror proof", async () => {
    fixture({ interrupt: true });
    await expect(
      purchaseHtsRepositories(input, credentials, directory),
    ).rejects.toThrow(/reconcile/i);
    expect(paid).toBe(1);
    const result = await purchaseHtsRepositories(input, credentials, directory);
    expect(result).toMatchObject({
      transactionId,
      evidence,
      status: "settled",
    });
    expect(paid).toBe(1);
  });
  it("does not manufacture a purchased resource from mirror proof alone", async () => {
    fixture({ interrupt: true, receiptUnavailable: true });
    await expect(
      purchaseHtsRepositories(input, credentials, directory),
    ).rejects.toThrow(/reconcile/i);
    await expect(
      purchaseHtsRepositories(input, credentials, directory),
    ).rejects.toThrow(/resource|receipt/i);
    expect(paid).toBe(1);
  });
  it("persists received response before mirror proof and recovers without resubmission", async () => {
    fixture({ proof: { transactions: [] } });
    await expect(
      purchaseHtsRepositories(input, credentials, directory),
    ).rejects.toThrow(/mirror|proof|reconcile/i);
    expect(paid).toBe(1);
    fixture();
    expect(
      await purchaseHtsRepositories(input, credentials, directory),
    ).toMatchObject({ evidence, status: "settled" });
    expect(paid).toBe(1);
  });
  it.each([
    { badEvidence: true },
    { badSettlement: true },
    {
      proof: {
        transactions: [
          {
            name: "CRYPTOTRANSFER",
            result: "SUCCESS",
            token_transfers: [
              { token_id: "0.0.999", account: input.terms.payer, amount: -1 },
              { token_id: "0.0.999", account: input.terms.payTo, amount: 1 },
            ],
          },
        ],
      },
    },
  ])("rejects unmatched paid response or token proof %j", async (changes) => {
    fixture(changes);
    await expect(
      purchaseHtsRepositories(input, credentials, directory),
    ).rejects.toThrow();
    expect(paid).toBe(1);
  });
  it("keeps request identity immutable", async () => {
    fixture();
    await purchaseHtsRepositories(input, credentials, directory);
    await expect(
      purchaseHtsRepositories(
        { ...input, symbol: "OTHER" },
        credentials,
        directory,
      ),
    ).rejects.toThrow(/identity|terms/i);
    expect(paid).toBe(1);
  });
  it.each([
    "upfront",
    "quote",
    "metadata",
    "unpaid",
    "supported",
    "signed",
  ] as const)("never pays when authority expires during %s", async (phase) => {
    const expiry = Date.now() + 60000;
    let now = phase === "upfront" ? expiry : expiry - 60000;
    const intentFile = join(
      directory,
      "hts-" +
        createHash("sha256").update(input.requestId).digest("hex") +
        ".json",
    );
    vi.spyOn(Date, "now").mockImplementation(() => {
      if (
        phase === "signed" &&
        existsSync(intentFile) &&
        JSON.parse(readFileSync(intentFile, "utf8")).status === "signed"
      )
        return expiry;
      return now;
    });
    fixture();
    const original = fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: URL | string, options?: RequestInit) => {
        const response = await original(url, options);
        const address = String(url);
        if (
          (phase === "quote" && address.endsWith("/quote")) ||
          (phase === "metadata" && address.includes("/api/v1/tokens/")) ||
          (phase === "unpaid" && address.endsWith("/evidence/repo-standard")) ||
          (phase === "supported" && address.endsWith("/supported"))
        )
          now = expiry;
        return response;
      }),
    );
    await expect(
      purchaseHtsRepositories(
        { ...input, mandateExpiresAt: new Date(expiry).toISOString() },
        credentials,
        directory,
      ),
    ).rejects.toThrow(/expired/i);
    expect(paid).toBe(0);
  });
});
