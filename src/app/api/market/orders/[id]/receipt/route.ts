import {NextRequest} from 'next/server';
import {getPublicMarketReceipt} from '@/lib/platform/marketplace';
import {platformError,platformJson} from '@/lib/platform/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(_req:NextRequest,ctx:{params:Promise<{id:string}>}) {
 try{return platformJson({receipt:await getPublicMarketReceipt((await ctx.params).id)});}
 catch(error){return platformError(error);}
}
