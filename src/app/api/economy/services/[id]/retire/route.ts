import {NextRequest} from 'next/server';
import {requireUser} from '@/lib/platform/auth';
import {platformError,platformJson,readJson,requireOrigin} from '@/lib/platform/http';
import {retireService,recoveryDatabase} from '@/lib/economy/recovery';
export async function POST(req:NextRequest,context:{params:Promise<{id:string}>}){try{requireOrigin(req);const user=await requireUser(req),{id}=await context.params,input=await readJson(req);return platformJson(await recoveryDatabase(db=>retireService(db,user,id,input)));}catch(error){return platformError(error);}}
