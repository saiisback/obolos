import fs from 'node:fs';
import path from 'node:path';
import solc from 'solc';
export function compile() {
  const sources = Object.fromEntries(fs.readdirSync('contracts').filter(x => x.endsWith('.sol')).map(x => [`contracts/${x}`, { content: fs.readFileSync(`contracts/${x}`, 'utf8') }]));
  sources['contracts/test/TestUSDC.sol'] = {content: fs.readFileSync('contracts/test/TestUSDC.sol','utf8')};
  const output = JSON.parse(solc.compile(JSON.stringify({language:'Solidity', sources, settings:{optimizer:{enabled:true,runs:200},viaIR:true,evmVersion:'shanghai',outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object','evm.deployedBytecode.immutableReferences']}}}}), {import: p => {try {return {contents:fs.readFileSync(path.join('node_modules',p),'utf8')}} catch {return {error:`Missing ${p}`}}}}));
  const errors = (output.errors ?? []).filter(e => e.severity === 'error');
  if(errors.length) throw new Error(errors.map(e=>e.formattedMessage).join('\n'));
  return Object.fromEntries(Object.values(output.contracts).flatMap(x=>Object.entries(x)));
}
if(process.argv[1]?.endsWith('/compile.mjs')) {const compiled = compile();fs.mkdirSync('contracts/artifacts',{recursive:true});for(const name of ['ObolosPolicyEnvelope','ObolosEconomicLedger','ObolosMarketSettlement']) fs.writeFileSync(`contracts/artifacts/${name}.json`,JSON.stringify({contractName:name,compiler:solc.version(),...compiled[name]},null,2)+'\n');console.log('Compiled three contracts');}
