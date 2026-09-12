import {NextRequest} from 'next/server';
import {authenticateAgentKey} from '@/lib/platform/credentials';
import {claimTask, listRunnerTasks} from '@/lib/platform/tasks';
import {platformError, platformJson, readJson} from '@/lib/platform/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = {params: Promise<{id: string}>};
export async function GET(request: NextRequest, context: Context) {
  try {const {id} = await context.params; await authenticateAgentKey(request.headers.get('authorization'), id); return platformJson(await listRunnerTasks(id, {taskId: request.nextUrl.searchParams.get('taskId') ?? undefined, identityOnly: request.nextUrl.searchParams.get('identity') === '1'}));} catch (error) {return platformError(error);}
}
export async function POST(request: NextRequest, context: Context) {
  try {const {id} = await context.params; await authenticateAgentKey(request.headers.get('authorization'), id); return platformJson(await claimTask(id, await readJson(request)));} catch (error) {return platformError(error);}
}
