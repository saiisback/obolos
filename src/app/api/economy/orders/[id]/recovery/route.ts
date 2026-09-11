import {NextRequest} from 'next/server';
import {requireUser} from '@/lib/platform/auth';
import {platformError,platformJson,readJson,requireOrigin} from '@/lib/platform/http';
import {getRecovery,recoveryAction,recoveryDatabase} from '@/lib/economy/recovery';
export const runtime='nodejs';
type Context={params:Promise<{id:string}>};
export async function GET(req:NextRequest,context:Context){try{const user=await requireUser(req),{id}=await context.params;return platformJson(await recoveryDatabase(db=>getRecovery(db,user,id)));}catch(error){return platformError(error);}}
export async function POST(req:NextRequest,context:Context){try{requireOrigin(req);const user=await requireUser(req),{id}=await context.params,input=await readJson(req);return platformJson(await recoveryDatabase(db=>recoveryAction(db,user,id,input)));}catch(error){return platformError(error);}}
