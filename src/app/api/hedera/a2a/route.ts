import {
  a2aConfiguration,
  handleA2ARequest,
  trustedBase,
} from "@/lib/hedera/a2a";
export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
export async function POST(request: Request) {
  if (
    request.headers.get("Content-Type")?.split(";")[0].trim() !==
    "application/json"
  )
    return Response.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32600,
          message: "Content-Type must be application/json",
        },
      },
      { status: 415, headers },
    );
  let input: unknown;
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 16000)
      return Response.json(
        {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32600, message: "Request too large" },
        },
        { status: 413, headers },
      );
    input = JSON.parse(raw);
  } catch {
    return Response.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error" },
      },
      { headers },
    );
  }
  try {
    const config = a2aConfiguration();
    const response = await handleA2ARequest(
      input,
      config,
      async (providerId, repos) => {
        const response = await fetch(
          new URL("quote", trustedBase(config.resourceBaseUrl)),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ providerId, repos }),
            redirect: "error",
            signal: AbortSignal.timeout(15000),
            cache: "no-store",
          },
        );
        if (!response.ok) throw Error("Quote unavailable");
        return response.json();
      },
    );
    return Response.json(response, { headers });
  } catch {
    return Response.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32603,
          message: "A2A service is not configured or unavailable",
        },
      },
      { status: 503, headers },
    );
  }
}
