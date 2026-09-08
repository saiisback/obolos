import { NextRequest } from 'next/server';
import { getAgentRun } from '@/lib/platform/agents';
import { authenticateAgentKey } from '@/lib/platform/credentials';
import { platformError, platformJson } from '@/lib/platform/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string; runId: string }> }) {
  try {
    const { id, runId } = await context.params;
    const { agentId } = await authenticateAgentKey(request.headers.get('authorization'), id);
    return platformJson({ run: await getAgentRun(agentId, runId) });
  } catch (error) { return platformError(error); }
}
