/** Bounded Arc testnet ARPI observer. Importing this module performs no I/O. */
import {mkdir,open,readFile,rename} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {decodeEventLog,isAddress,keccak256,toHex,type Address,type Hex} from 'viem';
import {z} from 'zod';
import {economyClient,economyDeployment,ledgerAbi,marketAbi,serializable} from '../src/lib/economy/chain';
import {calculateEconomyMetrics} from '../src/lib/economy/metrics';
import {canonicalJsonHash} from '../src/lib/economy/service-contract';
import {configuration,executeCircle} from './economy-circle';

const bytes32=z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform(v=>v.toLowerCase() as Hex);
const component=z.object({id:z.string().min(1).max(100),category:z.enum(['data','compute','inference','verification','storage']),unit:z.string().min(1).max(80),weightBps:z.string().regex(/^\d+$/),baselineServiceHash:bytes32,currentServiceHash:bytes32,sourceReference:z.string().min(1).max(500)}).strict();
const previous=z.object({methodology:z.enum(['obolos-agentgdp-v1','obolos-agentgdp-v2']),asset:z.literal('USDC'),end:z.number().int().nonnegative(),basketIdentity:z.string(),arpiBps:z.string().regex(/^\d+$/)}).strict();
export const observationInputSchema=z.object({protocol:z.literal('obolos.observation-input.v1'),operationName:z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,100}$/),asset:z.literal('USDC'),start:z.number().int().nonnegative(),end:z.number().int().positive(),components:z.array(component).min(1).max(100),previousObservation:previous.nullable().default(null)}).strict();
export type ObservationInput=z.input<typeof observationInputSchema>;
export type RegisteredQuote={seller:Address;category:number;unitHash:Hex;quantity:bigint;unitPrice:bigint;endpointHash:Hex;blockNumber:bigint;blockTimestamp:number;transactionHash:Hex};
export interface ObservationChain {finalizedBlock():Promise<{number:bigint;timestamp:number}>;service(hash:Hex,finalizedBlock:bigint):Promise<RegisteredQuote>}
const categories=['data','compute','inference','verification','storage'] as const;
const methodology='obolos-agentgdp-v2';
const stringify=(value:unknown)=>JSON.stringify(serializable(value),null,2)+'\n';

export async function prepareObservation(raw:ObservationInput,chain:ObservationChain){
 const input=observationInputSchema.parse(raw);if(input.start>=input.end)throw Error('Invalid observation window.');
 const finalized=await chain.finalizedBlock();if(input.end>finalized.timestamp)throw Error('Observation window is not closed at the finalized block.');
 const resolved=[];
 for(const c of input.components){
  const [baseline,current]=await Promise.all([chain.service(c.baselineServiceHash,finalized.number),chain.service(c.currentServiceHash,finalized.number)]);
  if(!isAddress(baseline.seller)||!isAddress(current.seller)||baseline.unitPrice<=0n||current.unitPrice<=0n||baseline.quantity<=0n)throw Error('Missing registered service quote.');
  if(baseline.category!==current.category||baseline.category!==categories.indexOf(c.category)||baseline.seller.toLowerCase()!==current.seller.toLowerCase()||baseline.unitHash!==current.unitHash||baseline.unitHash!==keccak256(toHex(c.unit))||baseline.quantity!==current.quantity||baseline.endpointHash!==current.endpointHash)throw Error('Baseline and current services are not comparable.');
  if(baseline.blockTimestamp>input.start||current.blockTimestamp>input.end)throw Error('Service quote was registered after its observation boundary.');
  resolved.push({...c,weightBps:BigInt(c.weightBps),baseline,current});
 }
 const basket=resolved.map(x=>({id:x.id,category:x.category,unit:x.unit,asset:input.asset,baselineAtomic:x.baseline.unitPrice,currentAtomic:x.current.unitPrice,weightBps:x.weightBps,sourceReference:`${x.baselineServiceHash}:${x.sourceReference}`}));
 const preliminary=calculateEconomyMetrics([],basket,{start:input.start,end:input.end,asset:input.asset,capitalAtomic:null,activeAgentIds:[],previousArpi:null});
 const prior=input.previousObservation?{...input.previousObservation,arpiBps:BigInt(input.previousObservation.arpiBps)}:null;
 const metrics=calculateEconomyMetrics([],basket,{start:input.start,end:input.end,asset:input.asset,capitalAtomic:null,activeAgentIds:[],previousArpi:prior});
 if(metrics.arpiBps===null)throw Error('ARPI basket is incomplete.');
 const publicInputs={protocol:input.protocol,methodology,asset:input.asset,start:input.start,end:input.end,basketIdentity:preliminary.basketIdentity,components:resolved.map(x=>({id:x.id,category:x.category,unit:x.unit,weightBps:x.weightBps.toString(),baselineServiceHash:x.baselineServiceHash,currentServiceHash:x.currentServiceHash,sourceReference:x.sourceReference,baseline:{...x.baseline,unitPrice:x.baseline.unitPrice.toString(),quantity:x.baseline.quantity.toString(),blockNumber:x.baseline.blockNumber.toString()},current:{...x.current,unitPrice:x.current.unitPrice.toString(),quantity:x.current.quantity.toString(),blockNumber:x.current.blockNumber.toString()}})),previousObservation:input.previousObservation};
 const inputRoot=canonicalJsonHash(publicInputs),metricId=keccak256(toHex('ARPI:USDC')),methodologyHash=keccak256(toHex(methodology));
 return {protocol:'obolos.observation-evidence.v1' as const,status:'prepared' as 'prepared'|'confirmed',operationName:input.operationName,deployment:economyDeployment(),finalized:{number:finalized.number.toString(),timestamp:finalized.timestamp},quoteMeaning:'ARPI uses selected registered quotes; it is not a latest quote or a market-clearing price.',publicInputs,inputRoot,metrics:serializable(metrics) as Record<string,unknown>,record:{metricId,parameters:[metricId,String(input.start),String(input.end),metrics.arpiBps.toString(),'10000',inputRoot,methodologyHash]},transaction:null as null|{transactionHash:Hex;observationHash:Hex}};
}

export async function executePreparedObservation<T extends Awaited<ReturnType<typeof prepareObservation>>>(prepared:T,deps:{persist(value:T):Promise<void>;dispatch(record:T['record']):Promise<{txHash:Hex}>;confirm(txHash:Hex,record:T['record']):Promise<{transactionHash:Hex;observationHash:Hex}>}){
 await deps.persist(prepared);const submitted=await deps.dispatch(prepared.record);const confirmed=await deps.confirm(submitted.txHash,prepared.record);const result={...prepared,status:'confirmed' as const,transaction:confirmed};await deps.persist(result as T);return result;
}

export function verifyObservationReceipt(receipt:{status:string;transactionHash:Hex;logs:{address:string;data:Hex;topics:[]|[Hex,...Hex[]]}[]},ledgerAddress:Address,txHash:Hex,record:Awaited<ReturnType<typeof prepareObservation>>['record']){
 if(receipt.status!=='success'||receipt.transactionHash.toLowerCase()!==txHash.toLowerCase())throw Error('Observation transaction was not successful.');
 // Circle uses a smart-account entry point as the top-level target. The exact
 // ledger emitter and event payload establish the application outcome.
 for(const log of receipt.logs){
  if(log.address.toLowerCase()!==ledgerAddress.toLowerCase())continue;
  try{const decoded=decodeEventLog({abi:ledgerAbi,data:log.data,topics:log.topics,strict:true});if(decoded.eventName==='ObservationRecorded'){const a=decoded.args;if(a.metricId===record.metricId&&String(a.windowStart)===record.parameters[1]&&String(a.windowEnd)===record.parameters[2]&&String(a.value)===record.parameters[3]&&String(a.baseline)===record.parameters[4]&&a.inputRoot===record.parameters[5]&&a.methodologyHash===record.parameters[6])return {transactionHash:txHash,observationHash:a.observationHash};}}catch{}
 }
 throw Error('Confirmed receipt lacks the exact ledger ObservationRecorded event.');
}

export function rpcObservationChain():ObservationChain{
 const deployment=economyDeployment();if(!deployment)throw Error('Economy deployment is unavailable.');const client=economyClient();
 return {finalizedBlock:async()=>{const b=await client.getBlock({blockTag:'finalized'});return {number:b.number,timestamp:Number(b.timestamp)}},service:async(hash,finalizedBlock)=>{
  const state=await client.readContract({address:deployment.settlement,abi:marketAbi,functionName:'services',args:[hash],blockNumber:finalizedBlock});
  const logs=await client.getLogs({address:deployment.settlement,event:marketAbi[0],args:{serviceHash:hash},fromBlock:BigInt(deployment.fromBlock),toBlock:finalizedBlock});if(logs.length!==1)throw Error('Expected one canonical ServiceRegistered event.');const log=logs[0],block=await client.getBlock({blockNumber:log.blockNumber});
  if(log.removed||log.blockHash!==block.hash||log.address.toLowerCase()!==deployment.settlement)throw Error('Service registration is not canonical.');
  return {seller:state[0],category:state[1],unitHash:state[2],quantity:state[3],unitPrice:state[4],endpointHash:state[5],blockNumber:log.blockNumber,blockTimestamp:Number(block.timestamp),transactionHash:log.transactionHash};
 }};
}
async function atomicWrite(path:string,value:unknown){await mkdir(dirname(path),{recursive:true});const temp=`${path}.${process.pid}.tmp`,f=await open(temp,'wx',0o600);try{await f.writeFile(stringify(value));await f.sync()}finally{await f.close()}await rename(temp,path)}
async function main(){
 const [mode,inputPath,evidencePath]=process.argv.slice(2);if(!['--prepare','--execute-testnet'].includes(mode)||!inputPath||!evidencePath)throw Error('Usage: npm run economy:observe -- --prepare|--execute-testnet <input.json> <evidence.json>');
 const prepared=await prepareObservation(JSON.parse(await readFile(resolve(inputPath),'utf8')),rpcObservationChain()),output=resolve(evidencePath);
 if(mode==='--prepare'){await atomicWrite(output,prepared);console.log(stringify(prepared));return}
 const deployment=economyDeployment();if(!deployment)throw Error('Economy deployment is unavailable.');const config=configuration();
 const result=await executePreparedObservation(prepared,{persist:v=>atomicWrite(output,v),dispatch:async record=>{const op=await executeCircle(config,prepared.operationName,deployment.ledger,'recordObservation(bytes32,uint64,uint64,int256,uint256,bytes32,bytes32)',record.parameters);const hash=op.result?.txHash;if(typeof hash!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(hash))throw Error('Circle did not return a transaction hash.');return {txHash:hash as Hex}},confirm:async(txHash,record)=>{const receipt=await economyClient().waitForTransactionReceipt({hash:txHash,confirmations:1});return verifyObservationReceipt(receipt,deployment.ledger,txHash,record);}});console.log(stringify(result));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(e=>{console.error(e instanceof Error?e.message:'Observation failed.');process.exitCode=1});
