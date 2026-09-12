import {NextRequest} from 'next/server';
import {requireUser} from '@/lib/platform/auth';
import {getTask, updateTask} from '@/lib/platform/tasks';
import {platformError, platformJson, readJson, requireOrigin} from '@/lib/platform/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = {params: Promise<{id: string}>};
export async function GET(request: NextRequest, context: Context) {
  try {const user = await requireUser(request), {id} = await context.params; return platformJson({task: await getTask(user.id, id)});} catch (error) {return platformError(error);}
}
export async function POST(request: NextRequest, context: Context) {
  try {requireOrigin(request); const user = await requireUser(request), {id} = await context.params; return platformJson({task: await updateTask(user.id, id, await readJson(request))});} catch (error) {return platformError(error);}
}
