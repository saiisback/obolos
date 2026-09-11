import type pg from 'pg';
/** Read immutable finalized history in pages; an old lifetime count must never freeze the cursor. */
export async function readEventHistory<T extends pg.QueryResultRow>(db:pg.Client,chainId:number,addresses:string[],block:string):Promise<T[]>{
 const rows:T[]=[];
 for(let offset=0;;offset+=2000){
  const page=(await db.query<T>('SELECT * FROM economy_chain_events WHERE chain_id=$1 AND contract_address=ANY($2::text[]) AND block_number<=$3 ORDER BY block_number,log_index LIMIT 2000 OFFSET $4',[chainId,addresses,block,offset])).rows;
  rows.push(...page);if(page.length<2000)return rows;
 }
}
