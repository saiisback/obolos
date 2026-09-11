import {describe,expect,it} from 'vitest';
import {encodeAbiParameters,encodeEventTopics,zeroHash,type Hex} from 'viem';
import type pg from 'pg';
import {indexEconomy} from '../src/lib/economy/indexer';
import {policyAbi,type EconomyDeployment} from '../src/lib/economy/chain';
const address=(n:string)=>`0x${n.repeat(40)}` as `0x${string}`;
const deployment:EconomyDeployment={chainId:5042002,policy:address('1'),ledger:address('2'),settlement:address('3'),fromBlock:'10',controller:address('4'),approver:address('5'),reserve:address('6'),reviewPool:address('7')};
const canonicalHash=`0x${'aa'.repeat(32)}` as Hex;
function harness(logOverride?:Record<string,unknown>){
 const queries:{sql:string;params:unknown[]}[]=[];const events:Record<string,unknown>[]=[];
 let state:Record<string,unknown>|undefined;
 const db={query:async(sql:string,params:unknown[]=[])=>{
  queries.push({sql,params});
  if(sql.startsWith('SELECT pg_try_advisory_xact_lock'))return {rows:[{acquired:true}]};
  if(sql.startsWith('SELECT block_number'))return {rows:state?[state]:[]};
  if(sql.startsWith('INSERT INTO economy_chain_events')){events.push({chain_id:params[0],contract_address:params[1],transaction_hash:params[2],log_index:params[3],block_number:params[4],block_hash:params[5],block_timestamp:String(params[6]),event_name:params[7],payload:JSON.parse(String(params[8]))});}
  if(sql.startsWith('SELECT * FROM economy_chain_events'))return {rows:sql.includes('OFFSET')?events.slice(Number(params[3]),Number(params[3])+2000):events};
  if(sql.startsWith('INSERT INTO economy_index_state'))state={block_number:params[1],block_hash:params[2],snapshot:JSON.parse(String(params[3]))};
  return {rows:[]};
 }};
 const baseLog={address:deployment.policy,blockNumber:10n,blockHash:canonicalHash,removed:false,logIndex:0,transactionHash:`0x${'bb'.repeat(32)}`,
  topics:encodeEventTopics({abi:policyAbi,eventName:'PolicyChanged',args:{version:2n,actionHash:zeroHash,observationHash:zeroHash}}),
  data:encodeAbiParameters([{type:'address'},{type:'bytes32'}],[deployment.controller,zeroHash])};
 const client={getChainId:async()=>5042002,getBlock:async()=>({number:10n,hash:canonicalHash,timestamp:172800n}),getLogs:async({address:target}:{address:string})=>target===deployment.policy?[{...baseLog,...logOverride}]:[],readContract:async({functionName}:{functionName:string})=>functionName==='categories'?[true,10000n,100000n,3600n,0n]:functionName==='marketEnabled'?true:1n};
 return {db:db as unknown as pg.Client,client:client as unknown as Parameters<typeof indexEconomy>[2],queries,events,state:()=>state};
}
describe('economy finalized event indexer',()=>{
 it('continues indexing past 256 public sellers without dropping their events',async()=>{
  const f=harness();
  for(let i=1;i<=257;i++)f.events.push({event_name:'ServiceRegistered',payload:{serviceHash:`0x${i.toString(16).padStart(64,'0')}`,seller:`0x${i.toString(16).padStart(40,'0')}`,category:'1',unitHash:zeroHash,unitPrice:'1000',quantity:'1',endpointHash:zeroHash},transaction_hash:zeroHash,block_timestamp:'100',block_number:'10',log_index:i});
  expect(await indexEconomy(f.db,deployment,f.client)).toMatchObject({changed:true,caughtUp:true});
 });
 it('advances beyond ten thousand historical events with paged reads',async()=>{
  const f=harness();for(let i=0;i<10001;i++)f.events.push({event_name:'PolicyChanged',payload:{},transaction_hash:zeroHash,block_timestamp:'100',block_number:'10',log_index:i});
  expect(await indexEconomy(f.db,deployment,f.client)).toMatchObject({changed:true});
  expect(f.queries.filter(q=>q.sql.includes('OFFSET'))).toHaveLength(6);
 });
 it('shrinks an oversized finalized log range instead of freezing at a public volume threshold',async()=>{
  const f=harness();const ranges:bigint[]=[];
  const client={...f.client,getBlock:async({blockNumber}:{blockNumber?:bigint})=>({number:blockNumber??2010n,hash:canonicalHash,timestamp:172800n}),getLogs:async({fromBlock,toBlock,address}:{fromBlock:bigint;toBlock:bigint;address:string})=>{ranges.push(toBlock-fromBlock);return address===deployment.policy&&toBlock-fromBlock>1000n?Array.from({length:10001},()=>({})):[];}} as unknown as Parameters<typeof indexEconomy>[2];
  expect(await indexEconomy(f.db,deployment,client)).toMatchObject({changed:true,blockNumber:'1009',caughtUp:false});
  expect(ranges).toContain(1999n);expect(ranges).toContain(999n);
 });
 it('writes a verified snapshot once and makes repeat indexing a no-op',async()=>{
  const f=harness();expect(await indexEconomy(f.db,deployment,f.client)).toEqual({changed:true,blockNumber:'10',caughtUp:true,orders:0});
  const snapshot=f.state()?.snapshot as {metrics:{gapAtomic:null;moneyVelocityBps:null;utilizationBps:null};policyHistory:unknown[]};
  expect(snapshot.metrics.gapAtomic).toBeNull();expect(snapshot.metrics.moneyVelocityBps).toBeNull();expect(snapshot.metrics.utilizationBps).toBeNull();expect(snapshot.policyHistory).toHaveLength(1);
  expect(await indexEconomy(f.db,deployment,f.client)).toEqual({changed:false});expect(f.events).toHaveLength(1);
 });
 it('rejects a finalized cursor reorg and rolls back without advancing state',async()=>{
  const f=harness();await indexEconomy(f.db,deployment,f.client);
  const changed={...f.client,getBlock:async()=>({number:10n,hash:zeroHash,timestamp:172800n})} as unknown as Parameters<typeof indexEconomy>[2];
  await expect(indexEconomy(f.db,deployment,changed)).rejects.toThrow('history changed');expect(f.queries.at(-1)?.sql).toBe('ROLLBACK');expect(f.state()?.block_hash).toBe(canonicalHash);
 });
 it('rejects a log whose block hash differs from its canonical finalized block',async()=>{
  const f=harness({blockHash:zeroHash});await expect(indexEconomy(f.db,deployment,f.client)).rejects.toThrow();expect(f.queries.at(-1)?.sql).toBe('ROLLBACK');expect(f.state()).toBeUndefined();
 });
 it('rejects a log outside the requested finalized block range',async()=>{
  const f=harness({blockNumber:11n});await expect(indexEconomy(f.db,deployment,f.client)).rejects.toThrow('range');expect(f.state()).toBeUndefined();
 });
 it('rejects a log from a different emitting contract',async()=>{
  const f=harness({address:address('9')});await expect(indexEconomy(f.db,deployment,f.client)).rejects.toThrow();expect(f.state()).toBeUndefined();
 });
});
