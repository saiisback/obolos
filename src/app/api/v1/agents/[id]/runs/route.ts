import { NextRequest } from 'next/server';
import { listAgentRuns, runnerRequired, validateRunInput } from '@/lib/platform/agents';
import { authenticateAgentKey } from '@/lib/platform/credentials';
import { platformError, platformJson, readJson } from '@/lib/platform/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    const { id } = await context.params;
    const { agentId } = await authenticateAgentKey(request.headers.get('authorization'), id);
    return platformJson({ runs: await listAgentRuns(agentId) });
  } catch (error) { return platformError(error); }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    const { id } = await context.params;
    await authenticateAgentKey(request.headers.get('authorization'), id);
    validateRunInput(await readJson(request), request.headers.get('idempotency-key'));
    // No job or spend can be created until a tenant execution path is configured.
    runnerRequired();
  } catch (error) { return platformError(error); }
}
