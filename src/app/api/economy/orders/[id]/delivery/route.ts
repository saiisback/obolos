import {NextRequest} from 'next/server';
import {retryEconomyDelivery} from '@/lib/economy/marketplace';
import {requireUser,rateLimit} from '@/lib/platform/auth';
import {platformError,platformJson,requireOrigin} from '@/lib/platform/http';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(request:NextRequest,context:{params:Promise<{id:string}>}){try{requireOrigin(request);const user=await requireUser(request);await rateLimit(`economy-delivery:${user.id}`,30,3600);return platformJson({order:await retryEconomyDelivery(user.id,(await context.params).id)});}catch(error){return platformError(error);}}
