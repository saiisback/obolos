import { a2aConfiguration, createAgentCard } from "@/lib/hedera/a2a";
export const runtime = "nodejs";
export async function GET() {
  try {
    return Response.json(createAgentCard(a2aConfiguration()), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { error: "A2A service is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
