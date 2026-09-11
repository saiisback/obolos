import {economyDeployment} from '@/lib/economy/chain';
import {sql} from '@/lib/platform/db';
import {platformError,platformJson} from '@/lib/platform/http';
import {NextRequest} from 'next/server';
import pg from 'pg';
import {requireOrigin,PlatformError} from '@/lib/platform/http';
import {requireUser,rateLimit} from '@/lib/platform/auth';
import {indexEconomy} from '@/lib/economy/indexer';
export const runtime='nodejs';
export const maxDuration=60;
export async function GET(){try{const deployment=economyDeployment();if(!deployment)return platformJson({status:'not_deployed',snapshot:null});const rows=await sql()`SELECT snapshot,updated_at FROM economy_index_state WHERE settlement_address=${deployment.settlement.toLowerCase()}`;return platformJson({status:rows[0]?'indexed':'awaiting_index',snapshot:rows[0]?.snapshot??null,updatedAt:rows[0]?.updated_at??null,deployment});}catch(error){return platformError(error);}}
/** Authenticated refresh reads chain evidence only; it never invokes a wallet. */
export async function POST(req:NextRequest){let phase='authentication';try{
 requireOrigin(req);const user=await requireUser(req);await rateLimit(`economy-refresh:${user.id}`,2,60);await rateLimit('economy-refresh-global',6,60);
 const deployment=economyDeployment();if(!deployment)return GET();if(!process.env.DATABASE_URL)throw new PlatformError(503,'DATABASE_REQUIRED','Database is unavailable.');
 phase='database-connect';const db=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000,query_timeout:40000});await db.connect();
 phase='chain-index';try{for(let i=0;i<4;i++){const result=await indexEconomy(db,deployment);if(!result.changed||result.caughtUp)break;}}finally{await db.end();}
 phase='snapshot-read';return GET();
 }catch(error){if(!(error instanceof PlatformError)){const candidate=error as {name?:unknown;code?:unknown;functionName?:unknown;cause?:{name?:unknown;code?:unknown;cause?:{name?:unknown;code?:unknown}}};const safe=(v:unknown)=>typeof v==='string'&&/^[A-Za-z0-9_]{1,48}$/.test(v)?v:'unknown';console.error('[economy-refresh]',{phase,name:safe(candidate?.name),code:safe(candidate?.code),functionName:safe(candidate?.functionName),cause:safe(candidate?.cause?.name),causeCode:safe(candidate?.cause?.code),rootCause:safe(candidate?.cause?.cause?.name),rootCode:safe(candidate?.cause?.cause?.code)});}return platformError(error);}}
