/** Local-only entry point. Importing this module never decrypts secrets or submits payments. */
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {configuration} from '../scripts/economy-circle';
import {liveExecutorDependencies} from '../src/lib/economy/executor-live';
import {decryptBrokerSecrets} from '../src/lib/integrations/ledger';
import {planGeneralTask} from '../src/lib/tasks/planner';
import {pollTaskOnce,type TaskRunnerConfig} from '../src/lib/tasks/runner';

export function taskRunnerOptions(args:string[]){
 if(args.length===0||args.includes('--help'))return null;
 if(args.at(-1)!=='--execute-testnet')throw Error('Explicit --execute-testnet is required');
 if(args.length===2&&args[0]==='--once')return {polls:1,intervalMs:10000};
 if(args.length===5&&args[0]==='--polls'&&args[2]==='--interval-ms'&&/^\d+$/.test(args[1])&&/^\d+$/.test(args[3])){
  const polls=Number(args[1]),intervalMs=Number(args[3]);if(polls>=1&&polls<=360&&intervalMs>=5000&&intervalMs<=60000)return {polls,intervalMs};
 }
 throw Error('Use --once or bounded --polls 1..360 --interval-ms 5000..60000, followed by --execute-testnet');
}
export async function main(args=process.argv.slice(2),env:NodeJS.ProcessEnv=process.env){
 const options=taskRunnerOptions(args);
 if(!options){console.info('Usage: npx tsx --env-file=.env.broker --env-file=<private-task-env> services/task-runner.ts --once --execute-testnet\nOr: --polls 60 --interval-ms 10000 --execute-testnet\nRequires pinned TASK_RUNNER_ORIGIN, TASK_RUNNER_AGENT_ID, TASK_RUNNER_OWNER_ADDRESS, stable TASK_RUNNER_WORKER_ID, private TASK_RUNNER_DATA_DIR, ECONOMY_AGENT_KEY and existing Circle/Ring configuration. Preserve all local journals.');return;}
 const circle=configuration(env);
 if(!env.TASK_RUNNER_DATA_DIR)throw Error('TASK_RUNNER_DATA_DIR must identify a persistent private directory');
 const config:TaskRunnerConfig={pins:{origin:env.TASK_RUNNER_ORIGIN??'',agentId:env.TASK_RUNNER_AGENT_ID??'',owner:env.TASK_RUNNER_OWNER_ADDRESS??'',payer:circle.wallet,workerId:env.TASK_RUNNER_WORKER_ID??''},key:env.ECONOMY_AGENT_KEY??'',directory:resolve(env.TASK_RUNNER_DATA_DIR),executorDirectory:join(circle.journal,'executor')};
 const shutdown=new AbortController(),stop=()=>shutdown.abort();process.once('SIGINT',stop);process.once('SIGTERM',stop);
 try{
  for(let poll=0;poll<options.polls&&!shutdown.signal.aborted;poll++){
   try{
    const result=await pollTaskOnce(config,{transport:fetch,planner:async context=>{const secrets=await decryptBrokerSecrets(env);return planGeneralTask(context,secrets.inferenceApiKey);},executorDependencies:intent=>liveExecutorDependencies(circle,intent,config.key)});
    console.info(`Task runner: ${result}.`);
   }catch{console.error('Task runner paused. Inspect task status, private configuration and original payment journals. Retry the same task after reconciliation; never delete journals or create a replacement payment.');process.exitCode=1;break;}
   if(poll+1<options.polls)await delay(options.intervalMs,undefined,{signal:shutdown.signal}).catch(()=>{});
  }
 }finally{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(()=>{console.error('Task runner startup failed. Verify private pins, permissions, scoped agent key and existing Circle/Ring configuration.');process.exitCode=1;});
