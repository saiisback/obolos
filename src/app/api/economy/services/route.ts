import {NextRequest} from 'next/server';
import {createEconomyService,listEconomyServices} from '@/lib/economy/marketplace';
import {requireUser,rateLimit} from '@/lib/platform/auth';
import {platformError,platformJson,readJson,requireOrigin} from '@/lib/platform/http';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(){try{return platformJson({protocol:'obolos.service.v1',services:await listEconomyServices()});}catch(error){return platformError(error);}}
export async function POST(request:NextRequest){try{requireOrigin(request);const user=await requireUser(request);await rateLimit(`economy-service:${user.id}`,20,3600);return platformJson({service:await createEconomyService(user,await readJson(request,131072))},201);}catch(error){return platformError(error);}}
