import {NextRequest} from 'next/server';
import {requireUser} from '@/lib/platform/auth';
import {getAgentEconomy} from '@/lib/platform/agent-economy';
import {platformError, platformJson} from '@/lib/platform/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest, context: {params: Promise<{id: string}>}) {
  try {
    const user = await requireUser(request);
    return platformJson(await getAgentEconomy(user, (await context.params).id));
  } catch (error) {return platformError(error);}
}
