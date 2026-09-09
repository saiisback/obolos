import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { loadRunnerConfig } from '../src/lib/runner/config';
import { RunnerJournal } from '../src/lib/runner/journal';
import { RunnerClient } from '../src/lib/runner/transport';

export async function main(){
 const config=await loadRunnerConfig();
 const journal=await RunnerJournal.open(config.dataDir,config.pins.agentId);
 const shutdown=new AbortController(),stop=()=>shutdown.abort();
 process.once('SIGINT',stop);process.once('SIGTERM',stop);
 const client=new RunnerClient(config,journal,fetch,shutdown.signal);
 let backoff=2000,offline=false;
 console.info('Isolated runner started. Local owner, agent, origin and broker are pinned.');
 try{
  while(!shutdown.signal.aborted){
   try{await client.pollOnce();backoff=2000;if(offline)console.info('Runner connection restored.');offline=false;}
   catch{if(!offline&&!shutdown.signal.aborted)console.error('Runner cannot progress. Check private configuration, local broker readiness, connectivity and journal. No payment is retried.');offline=true;backoff=Math.min(backoff*2,60000);}
   await delay(backoff,undefined,{signal:shutdown.signal}).catch(()=>{});
  }
 }finally{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);await journal.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(()=>{console.error('Runner startup failed. Check the private config, token permissions and process lock.');process.exitCode=1;});
