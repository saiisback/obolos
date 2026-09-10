import {NextRequest} from 'next/server';
import {requireUser} from '@/lib/platform/auth';
import {getVerificationService,updateMarketService} from '@/lib/platform/marketplace';
import {platformError,platformJson,readJson,requireOrigin} from '@/lib/platform/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
type Context={params:Promise<{id:string}>};
export async function GET(_req:NextRequest,ctx:Context){try{return platformJson({service:await getVerificationService((await ctx.params).id)});}catch(e){return platformError(e);}}
export async function PATCH(req:NextRequest,ctx:Context){try{requireOrigin(req);return platformJson({service:await updateMarketService(await requireUser(req),(await ctx.params).id,await readJson(req))});}catch(e){return platformError(e);}}
