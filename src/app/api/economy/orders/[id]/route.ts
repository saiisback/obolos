import {NextRequest} from 'next/server';
import {getEconomyOrder} from '@/lib/economy/marketplace';
import {requireUser} from '@/lib/platform/auth';
import {platformError,platformJson} from '@/lib/platform/http';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:NextRequest,context:{params:Promise<{id:string}>}){try{return platformJson({order:await getEconomyOrder((await requireUser(request)).id,(await context.params).id)});}catch(error){return platformError(error);}}
