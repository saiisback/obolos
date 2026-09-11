import {NextRequest} from 'next/server';
import pg from 'pg';
import {economyDeployment} from '@/lib/economy/chain';
import {authenticateEvidence,ingestEvidence} from '@/lib/economy/evidence';
import {PlatformError,platformError,platformJson,readJson} from '@/lib/platform/http';
export const runtime='nodejs';
export const maxDuration=300;
/** The EIP-191 signature authenticates this machine API; no browser session or wallet key is accepted. */
export async function POST(req:NextRequest){
 try{
  const deployment=economyDeployment();
  if(!deployment)throw new PlatformError(503,'ECONOMY_NOT_DEPLOYED','Economy contracts are not deployed.');
  const input=await readJson(req,64*1024);
  await authenticateEvidence(input,deployment);
  if(!process.env.DATABASE_URL)throw new PlatformError(503,'DATABASE_REQUIRED','Database is unavailable.');
  const db=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000,query_timeout:45000,statement_timeout:40000,lock_timeout:1000});
  await db.connect();
  try{return platformJson(await ingestEvidence(db,input,deployment));}finally{await db.end();}
 }catch(error){return platformError(error);}
}
