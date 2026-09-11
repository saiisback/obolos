import {NextRequest} from 'next/server';
import {platformError,platformJson,readJson} from '@/lib/platform/http';
import {queuePaidProviderWork} from '@/lib/economy/provider-queue';
import {rateLimit} from '@/lib/platform/auth';
export const runtime='nodejs';
export async function POST(req:NextRequest,context:{params:Promise<{category:string}>}){try{
 await rateLimit('reference-provider',120,60);
 return platformJson(await queuePaidProviderWork((await context.params).category,await readJson(req,96*1024)));
}catch(error){return platformError(error);}}
