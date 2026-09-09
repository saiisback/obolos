import { NextRequest } from 'next/server';
import { publicDataRequest } from '@/lib/platform/data-service';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=120;
type Context={params:Promise<{path:string[]}>};
export async function GET(req:NextRequest,ctx:Context){return publicDataRequest(req,(await ctx.params).path);}
export async function POST(req:NextRequest,ctx:Context){return publicDataRequest(req,(await ctx.params).path);}
