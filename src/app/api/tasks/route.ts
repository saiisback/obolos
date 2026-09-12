import {NextRequest} from 'next/server';
import {requireUser} from '@/lib/platform/auth';
import {createTask, listTasks} from '@/lib/platform/tasks';
import {platformError, platformJson, readJson, requireOrigin} from '@/lib/platform/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  try {const user = await requireUser(request); return platformJson({tasks: await listTasks(user.id, request.nextUrl.searchParams.get('agentId') ?? undefined)});} catch (error) {return platformError(error);}
}
export async function POST(request: NextRequest) {
  try {requireOrigin(request); const user = await requireUser(request), result = await createTask(user.id, await readJson(request, 64 * 1024), request.headers.get('idempotency-key')); return platformJson({task: result.task}, result.replayed ? 200 : 201);} catch (error) {return platformError(error);}
}
