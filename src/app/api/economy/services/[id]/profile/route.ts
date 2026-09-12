import {NextRequest} from 'next/server';
import {requireUser,rateLimit} from '@/lib/platform/auth';
import {saveServiceProfile} from '@/lib/platform/service-profiles';
import {platformError,platformJson,readJson,requireOrigin} from '@/lib/platform/http';
export const runtime='nodejs';
export async function PUT(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 try{requireOrigin(request);const user=await requireUser(request);await rateLimit(`service-profile:${user.id}`,30,3600);
  return platformJson({profile:await saveServiceProfile(user,(await params).id,await readJson(request,131072))});
 }catch(error){return platformError(error);}
}
