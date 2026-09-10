import {NextRequest} from 'next/server';
import {requireUser,rateLimit} from '@/lib/platform/auth';
import {retryMarketDelivery} from '@/lib/platform/marketplace';
import {platformError,platformJson,requireOrigin} from '@/lib/platform/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(req:NextRequest,ctx:{params:Promise<{id:string}>}) {
 try{
  requireOrigin(req);
  const user=await requireUser(req);await rateLimit(`market-delivery:${user.id}`,30,3600);
  return platformJson({order:await retryMarketDelivery(user.id,(await ctx.params).id)});
 }catch(error){return platformError(error);}
}
