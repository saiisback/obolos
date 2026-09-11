import {NextRequest} from 'next/server';
import pg from 'pg';
import {sql} from '@/lib/platform/db';
import {requireUser,rateLimit} from '@/lib/platform/auth';
import {requireOrigin,readJson,platformJson,platformError,PlatformError} from '@/lib/platform/http';
import {economyDeployment} from '@/lib/economy/chain';
import {recordProductionAccount} from '@/lib/economy/production-store';
export const runtime='nodejs';
export const maxDuration=60;
export async function GET(req:NextRequest){try{
 const user=await requireUser(req),d=economyDeployment();if(!d)throw new PlatformError(503,'NOT_DEPLOYED','Economy is not deployed.');
 const sales=await sql()`SELECT o.order_id,o.transaction_hash,o.output_hash,o.definition,o.request,a.evidence_hash FROM economy_orders o LEFT JOIN economy_production_accounts a ON a.order_id=o.order_id WHERE o.definition->>'seller'=${user.address.toLowerCase()} AND o.request->'settlement'->>'address'=${d.settlement} ORDER BY o.created_at DESC LIMIT 100`;
 return platformJson({deployment:d,seller:user.address.toLowerCase(),sales:sales.map(o=>({orderId:o.order_id,transactionHash:o.transaction_hash,outputHash:o.output_hash,category:o.definition.category,amountAtomic:o.request.amountAtomic,accounted:!!o.evidence_hash,evidenceHash:o.evidence_hash}))});
 }catch(e){return platformError(e);}}
export async function POST(req:NextRequest){try{
 requireOrigin(req);const user=await requireUser(req);await rateLimit('production-account:'+user.id,10,60);const d=economyDeployment();if(!d)throw new PlatformError(503,'NOT_DEPLOYED','Economy is not deployed.');
 const input=await readJson(req,64*1024),db=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000,query_timeout:40000});await db.connect();try{return platformJson(await recordProductionAccount(db,user,input,d));}finally{await db.end();}
 }catch(e){return platformError(e);}}
