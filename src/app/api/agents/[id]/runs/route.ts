import { NextRequest } from 'next/server';
import { requireUser } from '@/lib/platform/auth';
import { platformError,platformJson,requireOrigin,readJson,PlatformError } from '@/lib/platform/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
type Context={params:Promise<{id:string}>};
import { queueRun } from '@/lib/platform/execution';
import { listAgentRuns,requireOwnedAgent } from '@/lib/platform/agents';
export async function GET(req:NextRequest,ctx:Context){try{const user=await requireUser(req),id=(await ctx.params).id;await requireOwnedAgent(user.id,id);return platformJson({runs:await listAgentRuns(id)});}catch(e){return platformError(e);}}
export async function POST(req:NextRequest,ctx:Context){try{requireOrigin(req);const user=await requireUser(req),id=(await ctx.params).id;await requireOwnedAgent(user.id,id);const queued=await queueRun(id,await readJson(req),req.headers.get('idempotency-key'));return platformJson({run:queued.run},queued.replayed?200:202);}catch(e){return platformError(e);}}
