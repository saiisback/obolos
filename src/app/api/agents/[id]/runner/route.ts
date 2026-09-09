import { NextRequest } from 'next/server';
import { requireUser } from '@/lib/platform/auth';
import { platformError,platformJson,requireOrigin,readJson,PlatformError } from '@/lib/platform/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
type Context={params:Promise<{id:string}>};
import { getRunner,pairRunner,revokeRunner } from '@/lib/platform/execution';
export async function GET(req:NextRequest,ctx:Context){try{const user=await requireUser(req);return platformJson(await getRunner(user.id,(await ctx.params).id));}catch(e){return platformError(e);}}
export async function POST(req:NextRequest,ctx:Context){try{requireOrigin(req);const user=await requireUser(req);return platformJson(await pairRunner(user.id,(await ctx.params).id),201);}catch(e){return platformError(e);}}
export async function DELETE(req:NextRequest,ctx:Context){try{requireOrigin(req);const user=await requireUser(req);await revokeRunner(user.id,(await ctx.params).id);return platformJson({ok:true});}catch(e){return platformError(e);}}
