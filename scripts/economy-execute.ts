/** Generic real testnet purchaser. Never enrolls, issues keys, funds wallets or edits policy. */
import {open} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {configuration} from './economy-circle';
import {executorInputSchema,runEconomyExecutor} from '../src/lib/economy/executor';
import {liveExecutorDependencies} from '../src/lib/economy/executor-live';
async function main(){
 const args=process.argv.slice(2);
 if(args.length===0||args[0]==='--help'){console.log('Usage: npx tsx --env-file=.env.broker --env-file=<private-env> scripts/economy-execute.ts <private-input.json> [--abort-unpaid] --execute-testnet\nRequires ECONOMY_AGENT_KEY scoped to platformAgentId. Preserve input, executor state and Circle journals. Retry the same command for pending delivery.');return;}
 const abortUnpaid=args.length===3&&args[1]==='--abort-unpaid';
 if((args.length!==2&&!abortUnpaid)||args.at(-1)!=='--execute-testnet')throw Error('A private input file and explicit --execute-testnet flag are required.');
 const file=await open(resolve(args[0]),'r');let value:unknown;
 try{const info=await file.stat();if(!info.isFile()||(info.mode&0o077)!==0||info.size>128*1024)throw Error('Input must be a private regular file (chmod 600), at most 128 KiB.');value=JSON.parse(await file.readFile('utf8'));}finally{await file.close();}
 const intent=executorInputSchema.parse(value),config=configuration();
 const state=await runEconomyExecutor(intent,join(config.journal,'executor'),liveExecutorDependencies(config,intent,process.env.ECONOMY_AGENT_KEY??''),{abortUnpaid});
 console.log(JSON.stringify({orderId:state.intent.orderId,phase:state.phase,paymentHash:state.paymentHash,outputHash:state.outputHash,acknowledgmentHash:state.acknowledgmentHash,abortHash:state.abortHash}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(()=>{console.error('Executor stopped. Preserve the private input, executor state and Circle journals. Inspect the current phase and reconcile uncertain Circle operations; never create a replacement payment.');process.exitCode=1;});
