import {NextRequest} from 'next/server';
import {requireUser,rateLimit} from '@/lib/platform/auth';
import {createMarketService,listMarketServices} from '@/lib/platform/marketplace';
import {platformError,platformJson,readJson,requireOrigin} from '@/lib/platform/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){try{const mine=req.nextUrl.searchParams.get('mine')==='1';return platformJson({services:await listMarketServices(mine?(await requireUser(req)).id:undefined)});}catch(e){return platformError(e);}}
export async function POST(req:NextRequest){try{requireOrigin(req);const user=await requireUser(req);await rateLimit(`market-publish:${user.id}`,10,3600);return platformJson({service:await createMarketService(user,await readJson(req))},201);}catch(e){return platformError(e);}}
