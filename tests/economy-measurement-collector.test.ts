import {describe,expect,it} from 'vitest';
import {collectExecutorBalances,CANONICAL_USDC} from '../src/lib/economy/measurement-collector';
const a=(n:string)=>`0x${n.repeat(40)}`;
describe('finalized executor wallet balance collection',()=>{
 it('reads canonical USDC once per distinct executor, at the exact indexed block',async()=>{
  const calls:unknown[]=[];const client={readContract:async(args:unknown)=>{calls.push(args);return 123n;}};
  expect(await collectExecutorBalances(client as never,[a('a'),a('a').toUpperCase().replace('0X','0x'),a('b')],15n)).toEqual([{executor:a('a'),balanceAtomic:123n},{executor:a('b'),balanceAtomic:123n}]);
  expect(calls).toHaveLength(2);for(const call of calls)expect(call).toMatchObject({address:CANONICAL_USDC,functionName:'balanceOf',blockNumber:15n});
 });
 it('retains successful balances and marks failed or malformed reads unavailable instead of zero',async()=>{
  const client={readContract:async({args}:{args:[string]})=>{if(args[0]===a('a'))return 0n;if(args[0]===a('b'))throw Error('private provider details');return -1n;}};
  expect(await collectExecutorBalances(client as never,[a('a'),a('b'),a('c')],15n)).toEqual([{executor:a('a'),balanceAtomic:0n},{executor:a('b'),balanceAtomic:null},{executor:a('c'),balanceAtomic:null}]);
 });
});
