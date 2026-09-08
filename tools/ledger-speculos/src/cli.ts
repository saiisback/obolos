import { parseArgs } from 'node:util';
import init from './commands/ring/init';
import encrypt from './commands/ring/encrypt';
import decrypt from './commands/ring/decrypt';
import { closeTransport } from './device/speculos';
const [group,action,...args]=process.argv.slice(2);
const commands={init,encrypt,decrypt};
async function main(){
 if(group==='--help'||group===undefined){process.stdout.write('Obolos Speculos source adapter (not stock wallet-cli; development only)\nUsage: wallet-cli ring init [--name NAME]\n       wallet-cli ring encrypt|decrypt --key NAME [-i FILE] [-o FILE] [--output json]\nUse a hidden terminal password or WALLET_PASS; staging only; no hardware security.\n');return;}
 if(group!=='ring'||!(action in commands))throw new Error('Supported commands: ring init, ring encrypt, ring decrypt');
 const cmd=commands[action as keyof typeof commands];
 const definitions=Object.fromEntries(Object.entries(cmd.options).filter(([key])=>key!=='unsecure-no-password').map(([key,definition]:[string,any])=>[key,{type:'string',...(definition.short?{short:definition.short}:{})}]));
 const {values}=parseArgs({args,options:definitions as any,strict:true,allowPositionals:false});
 const flags=Object.fromEntries(Object.entries(cmd.options).map(([key,definition]:[string,any])=>[key,definition.schema.parse(values[key])]));
 flags['unsecure-no-password']=false;
 process.stderr.write('Obolos Speculos adapter: emulated Ledger, real Ledger staging protocol; not hardware-backed.\n');
 await cmd.handler({flags} as never);
}
main().catch(error=>{process.stderr.write(`Error: ${error instanceof Error?error.message:'Operation failed'}\n`);process.exitCode=1;}).finally(async()=>{await closeTransport();process.stdout.write('',()=>process.exit(process.exitCode??0));});
