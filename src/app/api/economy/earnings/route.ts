import {NextRequest} from 'next/server';
import {requireUser} from '@/lib/platform/auth';
import {listEconomySellerEarnings} from '@/lib/platform/economy-earnings';
import {platformError,platformJson} from '@/lib/platform/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest){try{return platformJson(await listEconomySellerEarnings(await requireUser(request)));}catch(error){return platformError(error);}}
