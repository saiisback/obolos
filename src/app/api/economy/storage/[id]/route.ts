import {NextRequest} from 'next/server';
import {z} from 'zod';
import {requireUser} from '@/lib/platform/auth';
import {sql} from '@/lib/platform/db';
import {PlatformError,platformJson,platformError} from '@/lib/platform/http';
export async function GET(req:NextRequest,context:{params:Promise<{id:string}>}){try{
 const user=await requireUser(req),id=z.string().regex(/^0x[a-f0-9]{64}$/).parse((await context.params).id);
 const [job]=await sql()`SELECT j.request,j.output FROM economy_provider_jobs j JOIN economy_orders o ON o.order_id=j.order_id WHERE j.order_id=${id} AND o.user_id=${user.id} AND j.state='completed' AND j.definition->>'category'='storage' AND j.lease_started_at+3600>extract(epoch from now())`;
 if(!job)throw new PlatformError(404,'STORAGE_NOT_FOUND','Stored content is absent, expired, or belongs to another owner.');
 return platformJson({objectId:id,text:job.request.input.text,...job.output});
}catch(error){return platformError(error);}}
