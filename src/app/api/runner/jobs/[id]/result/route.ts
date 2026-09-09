import { NextRequest } from 'next/server';
import { authenticateRunner,saveRunnerResult } from '@/lib/platform/execution';
import { platformError,platformJson,readJson } from '@/lib/platform/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(req:NextRequest,ctx:{params:Promise<{id:string}>}){try{const runner=await authenticateRunner(req.headers.get('authorization'));return platformJson(await saveRunnerResult(runner,(await ctx.params).id,await readJson(req,262144)));}catch(e){return platformError(e);}}
