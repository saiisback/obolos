import {NextRequest} from 'next/server';
import {getPublishedEconomyService} from '@/lib/economy/marketplace';
import {platformJson,platformError} from '@/lib/platform/http';
export const runtime='nodejs';
export async function GET(_req:NextRequest,{params}:{params:Promise<{id:string}>}){try{return platformJson({service:await getPublishedEconomyService((await params).id)});}catch(error){return platformError(error);}}
