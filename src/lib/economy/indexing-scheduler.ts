import {timingSafeEqual} from 'node:crypto';
import pg from 'pg';
import {economyDeployment} from './chain';
import {indexEconomy} from './indexer';
import {PlatformError} from '../platform/http';
export function authenticateIndexing(authorization:string|null,secret=process.env.CRON_SECRET){
 if(!secret||secret.length<32)throw new PlatformError(503,'INDEXING_NOT_CONFIGURED','Scheduled indexing is not configured.');
 const expected=Buffer.from(`Bearer ${secret}`),supplied=Buffer.from(authorization??'');
 if(expected.length!==supplied.length||!timingSafeEqual(expected,supplied))throw new PlatformError(401,'UNAUTHORIZED','Scheduled indexing requires authentication.');
}
export function indexFreshness(snapshot:{indexedAt?:string;chainTimestamp?:number;caughtUp?:boolean}|null,now=Date.now()){
 const indexed=Date.parse(snapshot?.indexedAt??'');
 const indexAgeSeconds=Number.isFinite(indexed)?Math.max(0,Math.floor((now-indexed)/1000)):null;
 const chainAgeSeconds=Number.isFinite(snapshot?.chainTimestamp)?Math.max(0,Math.floor(now/1000)-snapshot!.chainTimestamp!):null;
 return {status:!snapshot?'awaiting_index':snapshot.caughtUp!==true?'catching_up':indexAgeSeconds===null||chainAgeSeconds===null||chainAgeSeconds>600||indexAgeSeconds>600?'stale':'fresh',indexAgeSeconds,chainAgeSeconds,caughtUp:snapshot?.caughtUp??false};
}
/** Never log raw error messages, SQL, connection strings or arbitrary phase values. */
export function safeIndexFailure(phase:string,error:unknown){
 const identifier=(value:unknown)=>typeof value==='string'&&/^[A-Za-z0-9_]{1,48}$/.test(value)?value:'unknown';
 const errors:{name:string;code:string}[]=[];let current=error;
 for(let depth=0;current&&typeof current==='object'&&depth<4;depth++){
  const item=current as {name?:unknown;code?:unknown;cause?:unknown};errors.push({name:identifier(item.name),code:identifier(item.code)});current=item.cause;
 }
 return {phase:['database-connect','chain-index','snapshot-read'].includes(phase)?phase:'unknown',errors};
}
/** One transaction-protected batch per invocation; locks prevent concurrent scheduled work.
 * An interrupted batch rolls back. Retrying indexing reads chain data and never sends payments. */
export async function scheduledIndex(){
 const deployment=economyDeployment();
 if(!deployment)throw new PlatformError(503,'ECONOMY_NOT_DEPLOYED','Economy contracts are not deployed.');
 if(!process.env.DATABASE_URL)throw new PlatformError(503,'DATABASE_REQUIRED','Database is unavailable.');
 const db=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000,query_timeout:45000,statement_timeout:40000,lock_timeout:1000});
 let phase='database-connect';
 try{
  await db.connect();
  phase='chain-index';
  let result;
  // A single transient connection/RPC failure may be retried; invalid history and validation never are.
  for(let attempt=0;attempt<2;attempt++){
   try{result=await indexEconomy(db,deployment);break;}catch(error){
    const name=(error as {name?:string})?.name;
    if(attempt||!['HttpRequestError','TimeoutError'].includes(name??''))throw error;
   }
  }
  phase='snapshot-read';
  const snapshot=(await db.query('SELECT snapshot FROM economy_index_state WHERE settlement_address=$1',[deployment.settlement.toLowerCase()])).rows[0]?.snapshot??null;
  return {status:'indexed',result,freshness:indexFreshness(snapshot)};
 }catch(error){console.error('[economy-index]',safeIndexFailure(phase,error));throw error;}
 finally{await db.end().catch(()=>{});}
}
