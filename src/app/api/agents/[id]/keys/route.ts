import { NextRequest } from 'next/server';
import { requireUser } from '@/lib/platform/auth';
import { issueAgentKey, listAgentKeys } from '@/lib/platform/credentials';
import { platformError, platformJson, readJson, requireOrigin } from '@/lib/platform/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    const user = await requireUser(request);
    const { id } = await context.params;
    return platformJson({ keys: await listAgentKeys(user.id, id) });
  } catch (error) { return platformError(error); }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    requireOrigin(request);
    const user = await requireUser(request);
    const { id } = await context.params;
    return platformJson(await issueAgentKey(user.id, id, await readJson(request)), 201);
  } catch (error) { return platformError(error); }
}
