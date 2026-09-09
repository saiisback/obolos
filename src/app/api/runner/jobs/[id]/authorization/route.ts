import { NextRequest } from 'next/server';
import { authenticateRunner,authorizeRunnerJob } from '@/lib/platform/execution';
import { platformError,platformJson } from '@/lib/platform/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest,ctx:{params:Promise<{id:string}>}){try{const runner=await authenticateRunner(req.headers.get('authorization'));return platformJson(await authorizeRunnerJob(runner,(await ctx.params).id));}catch(e){return platformError(e);}}
