import {NextRequest} from 'next/server';
import {authenticateRunner} from '@/lib/platform/execution';
import {confirmMarketOrder} from '@/lib/platform/marketplace';
import {platformError,platformJson,readJson} from '@/lib/platform/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(req:NextRequest,ctx:{params:Promise<{id:string}>}){try{return platformJson({order:await confirmMarketOrder(await authenticateRunner(req.headers.get('authorization')),(await ctx.params).id,await readJson(req))});}catch(e){return platformError(e);}}
