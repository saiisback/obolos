import {NextRequest} from 'next/server';
import {platformError,platformJson,readJson} from '@/lib/platform/http';
import {assertProviderAuthorization,providerWorkAction} from '@/lib/economy/provider-queue';
export const runtime='nodejs';
export async function POST(req:NextRequest){try{assertProviderAuthorization(req.headers.get('authorization'));return platformJson(await providerWorkAction(await readJson(req,96*1024)));}catch(error){return platformError(error);}}
