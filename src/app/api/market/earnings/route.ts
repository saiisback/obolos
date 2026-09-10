import {NextRequest} from 'next/server';
import {requireUser} from '@/lib/platform/auth';
import {marketEarnings} from '@/lib/platform/marketplace';
import {platformError,platformJson} from '@/lib/platform/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){try{return platformJson(await marketEarnings((await requireUser(req)).id));}catch(e){return platformError(e);}}
