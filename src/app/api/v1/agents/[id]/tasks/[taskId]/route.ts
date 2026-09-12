import {NextRequest} from 'next/server';
import {authenticateAgentKey} from '@/lib/platform/credentials';
import {updateRunnerTask} from '@/lib/platform/tasks';
import {platformError, platformJson, readJson} from '@/lib/platform/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = {params: Promise<{id: string; taskId: string}>};
export async function POST(request: NextRequest, context: Context) {
  try {const {id, taskId} = await context.params; await authenticateAgentKey(request.headers.get('authorization'), id); return platformJson({task: await updateRunnerTask(id, taskId, await readJson(request, 192 * 1024))});} catch (error) {return platformError(error);}
}
