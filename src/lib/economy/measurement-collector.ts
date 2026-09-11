import {parseAbi,type Address} from 'viem';
import type {economyClient} from './chain';
export const CANONICAL_USDC='0x3600000000000000000000000000000000000000' as const;
const balanceAbi=parseAbi(['function balanceOf(address) view returns(uint256)']);
/** Balance is a block-pinned wallet observation, not total economic capital.
 * One failed wallet must not suppress finalized chain history or become a zero. */
export async function collectExecutorBalances(client:ReturnType<typeof economyClient>,executors:string[],blockNumber:bigint){
 const wallets=[...new Set(executors.map(address=>address.toLowerCase()))].sort();
 const observations:{executor:string;balanceAtomic:bigint|null}[]=[];
 for(const executor of wallets){
  let balanceAtomic:bigint|null=null;
  try{
   if(!/^0x[0-9a-f]{40}$/.test(executor))throw Error('Invalid executor address');
   const value=await client.readContract({address:CANONICAL_USDC,abi:balanceAbi,functionName:'balanceOf',args:[executor as Address],blockNumber});
   if(typeof value==='bigint'&&value>=0n)balanceAtomic=value;
  }catch{/* No raw RPC details or credentials belong in the public measurement. */}
  observations.push({executor,balanceAtomic});
 }
 return observations;
}
