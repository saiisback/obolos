import {NextRequest} from 'next/server';
import {createEconomyOrder} from '@/lib/economy/marketplace';
import {requireUser,rateLimit} from '@/lib/platform/auth';
import {platformError,platformJson,readJson,requireOrigin} from '@/lib/platform/http';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(request:NextRequest){try{requireOrigin(request);const user=await requireUser(request);await rateLimit(`economy-order:${user.id}`,30,3600);return platformJson({order:await createEconomyOrder(user,await readJson(request,131072))},201);}catch(error){return platformError(error);}}
