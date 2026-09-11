import {parseAbi,zeroAddress,type Hex} from 'viem';
import {economyClient,type EconomyDeployment} from './chain';
const abi=parseAbi(['function executorOwners(address) view returns(address)']);
/** Public immutable executor ownership is stronger evidence than different wallet addresses. */
export function sameKnownController(a:string,b:string,bindings:ReadonlyMap<string,string>):boolean{
 function root(value:string){
  let current=value.toLowerCase();const positions=new Map<string,number>(),path:string[]=[];
  while(bindings.has(current)&&bindings.get(current)!==current){
   const cycleStart=positions.get(current);if(cycleStart!==undefined)return path.slice(cycleStart).sort()[0];
   positions.set(current,path.length);path.push(current);current=bindings.get(current)!;
  }
  return current;
 }
 return root(a)===root(b);
}
export async function readControllerBindings(client:ReturnType<typeof economyClient>,deployment:EconomyDeployment,addresses:string[],blockNumber:bigint){
 const bindings=new Map<string,string>(),seen=new Set<string>();let pending=[...new Set(addresses.map(a=>a.toLowerCase()))];
 for(let depth=0;pending.length&&depth<32;depth++){
  const next:string[]=[];
  for(let i=0;i<pending.length;i+=16)await Promise.all(pending.slice(i,i+16).map(async address=>{
   if(seen.has(address))return;seen.add(address);
   const owner=await client.readContract({address:deployment.policy,abi,functionName:'executorOwners',args:[address as Hex],blockNumber});
   if(typeof owner!=='string'||!/^0x[0-9a-fA-F]{40}$/.test(owner))throw Error('Invalid executor ownership response');
   if(owner.toLowerCase()!==zeroAddress){bindings.set(address,owner.toLowerCase());if(!seen.has(owner.toLowerCase()))next.push(owner.toLowerCase());}
  }));pending=[...new Set(next)];
 }
 if(pending.length)throw Error('Executor ownership depth exceeds validation bound');return bindings;
}
