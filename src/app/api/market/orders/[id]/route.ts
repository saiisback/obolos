import {NextRequest} from 'next/server';
import {authenticateRunner} from '@/lib/platform/execution';
import {requireUser} from '@/lib/platform/auth';
import {getMarketOrder,publicMarketOrder} from '@/lib/platform/marketplace';
import {platformError,platformJson} from '@/lib/platform/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest,ctx:{params:Promise<{id:string}>}){try{const scope=req.headers.has('authorization')?{runner:await authenticateRunner(req.headers.get('authorization'))}:{userId:(await requireUser(req)).id};return platformJson({order:publicMarketOrder(await getMarketOrder((await ctx.params).id,scope))});}catch(e){return platformError(e);}}
