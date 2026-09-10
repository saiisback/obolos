import {NextRequest} from 'next/server';
import {marketServiceHistory} from '@/lib/platform/marketplace';
import {platformError,platformJson} from '@/lib/platform/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
type Context={params:Promise<{id:string}>};
export async function GET(_req:NextRequest,ctx:Context){try{return platformJson({revisions:await marketServiceHistory((await ctx.params).id)});}catch(e){return platformError(e);}}
