import {NextRequest} from 'next/server';
import {z} from 'zod';
import {authenticateAgentKey} from '@/lib/platform/credentials';
import {rateLimit} from '@/lib/platform/auth';
import {sql} from '@/lib/platform/db';
import {PlatformError,platformError,platformJson,readJson} from '@/lib/platform/http';
import {createEconomyOrder} from '@/lib/economy/marketplace';
import {serviceRequestSchema} from '@/lib/economy/service-contract';
export const runtime='nodejs';
/** A scoped agent may deliver its own paid jobs. It cannot spend through this API. */
export async function POST(req:NextRequest,context:{params:Promise<{id:string}>}){try{
 const id=z.uuid().parse((await context.params).id);await authenticateAgentKey(req.headers.get('authorization'),id);await rateLimit(`economy-agent-delivery:${id}`,30,3600);
 const input=z.object({request:serviceRequestSchema}).strict().parse(await readJson(req,131072));
 const users=await sql()`SELECT u.id,u.address FROM platform_agents a JOIN platform_users u ON u.id=a.user_id WHERE a.id=${id}`;
 if(!users[0])throw new PlatformError(404,'AGENT_NOT_FOUND','Agent not found.');
 const user={id:String(users[0].id),address:String(users[0].address)};
 return platformJson({order:await createEconomyOrder(user,{platformAgentId:id,request:input.request})},201);
 }catch(error){return platformError(error);}}
