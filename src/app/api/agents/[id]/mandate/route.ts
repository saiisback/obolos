import { NextRequest } from 'next/server';
import { requireUser } from '@/lib/platform/auth';
import { platformError,platformJson,requireOrigin,readJson,PlatformError } from '@/lib/platform/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
type Context={params:Promise<{id:string}>};
import { getMandate,prepareMandate,approveMandate,revokeMandate } from '@/lib/platform/execution';
export async function GET(req:NextRequest,ctx:Context){try{const user=await requireUser(req);return platformJson(await getMandate(user.id,(await ctx.params).id));}catch(e){return platformError(e);}}
export async function POST(req:NextRequest,ctx:Context){try{requireOrigin(req);const user=await requireUser(req),id=(await ctx.params).id,body=await readJson(req);const phase=body&&typeof body==='object'&&'phase' in body?body.phase:null;if(phase==='prepare')return platformJson(await prepareMandate(user,id,body),201);if(phase==='approve')return platformJson(await approveMandate(user,id,body));throw new PlatformError(400,'INVALID_PHASE','Choose prepare or approve.');}catch(e){return platformError(e);}}
export async function DELETE(req:NextRequest,ctx:Context){try{requireOrigin(req);const user=await requireUser(req);await revokeMandate(user.id,(await ctx.params).id);return platformJson({ok:true});}catch(e){return platformError(e);}}
