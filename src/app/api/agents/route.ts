import { NextRequest } from 'next/server';
import { requireUser } from '@/lib/platform/auth';
import { createAgent, listAgents } from '@/lib/platform/agents';
import { platformError, platformJson, readJson, requireOrigin } from '@/lib/platform/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    return platformJson({ agents: await listAgents(user.id) });
  } catch (error) { return platformError(error); }
}

export async function POST(request: NextRequest) {
  try {
    requireOrigin(request);
    const user = await requireUser(request);
    return platformJson({ agent: await createAgent(user.id, await readJson(request)) }, 201);
  } catch (error) { return platformError(error); }
}
