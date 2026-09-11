import pg from 'pg';
import {economyDeployment} from '../src/lib/economy/chain';
import {indexEconomy} from '../src/lib/economy/indexer';
async function main(){const deployment=economyDeployment();if(!deployment)throw Error('Economy contracts are not deployed');if(!process.env.DATABASE_URL)throw Error('DATABASE_URL required');const db=new pg.Client({connectionString:process.env.DATABASE_URL});await db.connect();try{for(let i=0;i<20;i++){const result=await indexEconomy(db,deployment);console.log(JSON.stringify(result));if(!result.changed||result.caughtUp)break;}}finally{await db.end();}}
main().catch(()=>{console.error('Economy index could not advance. Check deployment, chain RPC and database access. No payment was attempted.');process.exitCode=1;});
