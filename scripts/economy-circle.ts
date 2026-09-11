/** Testnet-only administrative helper. Importing this module never submits a transaction. */
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { createPublicClient, http, isAddress, keccak256, toHex, verifyMessage, type Abi, type Address, type Hex } from 'viem';
import {findFinalizedUserOperation} from './circle-userop-recovery';
import {serializeIndexReads} from '../src/lib/economy/index-rpc';
import { signerConfiguration, SpeculosTransport } from './speculos-transport';
import { circleCalldataAdapter, encodeCircleCall } from './circle-calldata-adapter';
const exec = promisify(execFile);
const CHAIN_ID = 5042002;
const CHAIN = 'ARC-TESTNET';
const DEFAULT_RPC = 'https://rpc.testnet.arc.network';
type Json = string | number | boolean | null | Json[] | {[key:string]:Json};
type Intent = {kind:string;args:string[]};
export type Operation = {version:1;name:string;intent:Intent;intentHash:Hex;idempotencyKey:string;createdAt:string;status:'submitting'|'uncertain'|'submitted'|'failed';result?:Record<string,Json>};
export type CircleConfig = {wallet:Address;approver:Address;cli:string;cliHome:string;rpc:string;journal:string};
type Artifact = {abi:Abi;evm:{bytecode:{object:string};deployedBytecode:{object:string;immutableReferences?:Record<string,{start:number;length:number}[]>}}};
const publicClient=(config:CircleConfig)=>serializeIndexReads(createPublicClient({transport:http(config.rpc,{timeout:20000,retryCount:0})}));
function validName(name:string){if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,100}$/.test(name))throw Error('Invalid operation name.');}
async function save(filename:string,value:unknown){
 const temp=`${filename}.${randomUUID()}.tmp`;const file=await open(temp,'wx',0o600);
 try {await file.writeFile(JSON.stringify(value,null,2)+'\n');await file.sync();}finally{await file.close();}
 await rename(temp,filename);
 const directory=await open(dirname(filename),'r');try{await directory.sync();}finally{await directory.close();}
}
async function load(filename:string):Promise<Operation|undefined>{try{return JSON.parse(await readFile(filename,'utf8')) as Operation;}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return;throw error;}}

/** Journal is durable before submit. Neither a timeout nor a repeated invocation creates a second intent. */
export async function durableOperation(directory:string,name:string,intent:Intent,submit:(key:string)=>Promise<Record<string,Json>>):Promise<Operation>{
 validName(name);await mkdir(directory,{recursive:true,mode:0o700});const filename=join(directory,`${name}.json`);const lockPath=filename+'.lock';
 let lock;try{lock=await open(lockPath,'wx',0o600);}catch{throw Error('Operation locked; inspect the process before removing a stale lock.');}
 try {
  const intentHash=keccak256(toHex(JSON.stringify(intent)));const previous=await load(filename);
  if(previous){
   if(previous.intentHash!==intentHash)throw Error('Operation name already belongs to a different intent.');
   if(previous.status==='submitted')return previous;
   if(previous.status==='failed')throw Error('Terminal failure recorded; preserve this intent and use only an explicitly reviewed linked recovery operation.');
   throw Error('Existing operation outcome uncertain; reconcile it before further actions.');
  }
  const operation:Operation={version:1,name,intent,intentHash,idempotencyKey:randomUUID(),createdAt:new Date().toISOString(),status:'submitting'};
  await save(filename,operation);
  try {
   const result=await submit(operation.idempotencyKey);
   // Retain sanitized result even if the CLI returned an unexpected envelope.
   operation.result=result;
   if(result.idempotencyKey!==operation.idempotencyKey)throw Error('Mismatched idempotency key.');
   operation.status='submitted';await save(filename,operation);return operation;
  }catch{operation.status='uncertain';await save(filename,operation);throw Error('Circle operation outcome uncertain; reconcile the journal before retrying.');}
 }finally{await lock.close();await unlink(lockPath);}
}

export function runtimeMatches(actual:Hex,expected:string,references:Record<string,{start:number;length:number}[]>={}):boolean{
 const got=actual.slice(2).toLowerCase().split(''),want=expected.toLowerCase().split('');if(got.length!==want.length)return false;
 for(const ranges of Object.values(references))for(const {start,length} of ranges){for(let i=start*2;i<(start+length)*2;i++){got[i]='0';want[i]='0';}}
 return got.join('')===want.join('');
}
export function configuration(env=process.env):CircleConfig{
 const wallet=env.CIRCLE_WALLET_ADDRESS,approver=env.LEDGER_CONTROLLER_ADDRESS;
 if(!wallet||!isAddress(wallet)||!approver||!isAddress(approver)||!env.CIRCLE_CLI_HOME)throw Error('Explicit Circle wallet, pinned approver and CLI home are required.');
 const rpc=env.ARC_RPC_URL||DEFAULT_RPC;
 if(!['https://rpc.testnet.arc.network','https://rpc.testnet.arc.network/','https://rpc.testnet.arc.io','https://rpc.testnet.arc.io/'].includes(rpc))throw Error('Only canonical Arc testnet RPC is allowed.');
 return {wallet,approver,cli:env.CIRCLE_CLI||resolve('node_modules/.bin/circle'),cliHome:env.CIRCLE_CLI_HOME,rpc,journal:resolve(env.ECONOMY_OPERATION_DIR||'data/economy-operations')};
}
async function assertTestnet(config:CircleConfig){if(await publicClient(config).getChainId()!==CHAIN_ID)throw Error('Wrong chain.');}
function sanitizeResult(value:unknown):Record<string,Json>{
 if(!value||typeof value!=='object')throw Error('Missing Circle result.');const record=value as Record<string,unknown>;
 const result:Record<string,Json>={};for(const key of ['id','idempotencyKey','state','blockchain','txHash','userOpHash','sourceAddress','destinationAddress','contractAddress','blockHeight','operation','abiFunctionSignature','abiParameters','createDate','errorReason','errorDetails']){
  if(record[key]!==undefined)result[key]=JSON.parse(JSON.stringify(record[key])) as Json;
 }return result;
}
async function circle(config:CircleConfig,args:string[],rawAdapter=false):Promise<unknown>{
 try {
  const binary=rawAdapter?process.execPath:config.cli;const actualArgs=rawAdapter?[await circleCalldataAdapter(),...args]:args;
  const {stdout}=await exec(binary,actualArgs,{shell:false,encoding:'utf8',timeout:180000,maxBuffer:1024*1024,env:{NODE_ENV:'production',PATH:process.env.PATH,HOME:process.env.HOME,CIRCLE_CLI_HOME:config.cliHome,DO_NOT_TRACK:'1'}});
  return (JSON.parse(stdout) as {data:unknown}).data;
 } catch { throw Error('Circle CLI returned no usable result. Preserve any existing operation journal for reconciliation.'); }
}
/** Callers supply one permanent operation name for the immutable logical action. */
export async function executeCircle(config:CircleConfig,name:string,contract:Address,signature:string,parameters:string[]):Promise<Operation>{
 if(!isAddress(contract)||!/^\w+\(.+\)$|^\w+\(\)$/.test(signature))throw Error('Invalid contract call.');await assertTestnet(config);
 const args=['wallet','execute',signature,...parameters,'--contract',contract,'--address',config.wallet,'--chain',CHAIN,'--amount','0','--output','json'];
 // Preserve original journal intent; transport compatibility cannot create a new logical operation.
 const data=encodeCircleCall(signature,parameters);
 const rawArgs=['wallet','execute',data,'--contract',contract,'--address',config.wallet,'--chain',CHAIN,'--amount','0','--output','json'];
 return durableOperation(config.journal,name,{kind:'execute',args},async key=>sanitizeResult(await circle(config,[...rawArgs,'--idempotency-key',key],true)));
}
export async function executeCircleCalldata(config:CircleConfig,name:string,contract:Address,data:Hex):Promise<Operation>{
 if(!isAddress(contract)||!/^0x(?:[a-fA-F0-9]{2}){4,}$/.test(data))throw Error('Invalid calldata.');await assertTestnet(config);
 const args=['wallet','execute',data,'--contract',contract,'--address',config.wallet,'--chain',CHAIN,'--amount','0','--output','json'];
 return durableOperation(config.journal,name,{kind:'execute-calldata',args},async key=>sanitizeResult(await circle(config,[...args,'--idempotency-key',key],true)));
}
export async function estimateCircleCall(config:CircleConfig,contract:Address,signature:string,parameters:string[]):Promise<unknown>{
 if(!isAddress(contract))throw Error('Invalid contract.');await assertTestnet(config);
 return circle(config,['wallet','execute',encodeCircleCall(signature,parameters),'--contract',contract,'--address',config.wallet,'--chain',CHAIN,'--amount','0','--output','json','--estimate'],true);
}
export async function approveCircleUsdc(config:CircleConfig,name:string,settlement:Address,amountAtomic:bigint):Promise<Operation>{
 if(amountAtomic<0n||amountAtomic>=2n**256n)throw Error('Invalid bounded USDC allowance.');
 return executeCircle(config,name,'0x3600000000000000000000000000000000000000','approve(address,uint256)',[settlement,amountAtomic.toString()]);
}
export type SettlementOrder={orderId:Hex;agentId:Hex;category:number;seller:Address;serviceHash:Hex;unitHash:Hex;quantity:bigint;unitPrice:bigint;amount:bigint;inputHash:Hex;deadline:bigint;policyVersion:bigint;agentVersion:bigint;feeVersion:bigint};
export function settlementParameters(order:SettlementOrder):string[]{
 if(order.category<0||order.category>4||!Number.isInteger(order.category)||order.quantity<=0n||order.unitPrice<=0n||order.amount!==order.quantity*order.unitPrice)throw Error('Invalid settlement terms.');
 for(const value of [order.orderId,order.agentId,order.serviceHash,order.unitHash,order.inputHash])if(!/^0x[\da-f]{64}$/i.test(value))throw Error('Invalid order hash.');
 if(!isAddress(order.seller))throw Error('Invalid seller.');
 return [JSON.stringify([order.orderId,order.agentId,order.category,order.seller,order.serviceHash,order.unitHash,order.quantity.toString(),order.unitPrice.toString(),order.amount.toString(),order.inputHash,order.deadline.toString(),order.policyVersion.toString(),order.agentVersion.toString(),order.feeVersion.toString()])];
}
export async function settleCircleOrder(config:CircleConfig,name:string,settlement:Address,order:SettlementOrder):Promise<Operation>{
 return executeCircle(config,name,settlement,'settle((bytes32,bytes32,uint8,address,bytes32,bytes32,uint256,uint256,uint256,bytes32,uint256,uint64,uint64,uint64))',settlementParameters(order));
}
async function artifact(name:string):Promise<Artifact>{return JSON.parse(await readFile(resolve(`contracts/artifacts/${name}.json`),'utf8')) as Artifact;}
export async function deployCircle(config:CircleConfig,name:string,contractName:string,parameters:Address[]):Promise<Operation>{
 if(!['ObolosPolicyEnvelope','ObolosEconomicLedger','ObolosMarketSettlement'].includes(contractName)||parameters.some(x=>!isAddress(x)))throw Error('Invalid deployment.');
 await assertTestnet(config);const built=await artifact(contractName);
 const args=['contract','deploy','--bytecode',`0x${built.evm.bytecode.object}`,'--constructor-signature',`constructor(${parameters.map(()=>'address').join(',')})`,...parameters,'--address',config.wallet,'--chain',CHAIN,'--output','json'];
 return durableOperation(config.journal,name,{kind:'deploy',args},async key=>sanitizeResult(await circle(config,[...args,'--idempotency-key',key])));
}
async function receipt(config:CircleConfig,op:Operation){
 const result=op.result;const hash=result?.txHash;
 if(result?.blockchain!==CHAIN||typeof hash!=='string'||!/^0x[\da-f]{64}$/i.test(hash)||String(result.sourceAddress).toLowerCase()!==config.wallet.toLowerCase())throw Error('Missing matching Circle transaction evidence; reconcile.');
 const mined=await publicClient(config).waitForTransactionReceipt({hash:hash as Hex,confirmations:1,timeout:60000});if(mined.status!=='success')throw Error('On-chain transaction reverted.');return mined;
}
async function deployedAddress(config:CircleConfig,op:Operation,name:string):Promise<Address>{
 await receipt(config,op);const address=op.result?.contractAddress;
 if(typeof address!=='string'||!isAddress(address))throw Error('Circle deployment did not identify the created contract. Reconcile factory receipt manually.');
 const built=await artifact(name);const code=await publicClient(config).getCode({address});
 if(!code||!built.evm.deployedBytecode.immutableReferences||!runtimeMatches(code,built.evm.deployedBytecode.object,built.evm.deployedBytecode.immutableReferences))throw Error('Deployed runtime differs from compiled artifact.');return address;
}
/** A correlated pending result is not missing correlation and never proves payment. */
export function requireCircleTransactionHash(op:Operation):Hex{
 const hash=op.result?.txHash;if(typeof hash==='string'&&/^0x[\da-f]{64}$/i.test(hash))return hash as Hex;
 if(typeof op.result?.id==='string'&&op.result.id)throw Error('Circle transaction is correlated, but its transaction hash is not available yet. Preserve this operation and retry read-only reconciliation; do not submit again.');
 throw Error('No uniquely correlated transaction found. Preserve the journal and reconcile Circle challenge manually; do not create a replacement operation.');
}
/** Read-only recovery. Unknown timeout results require manual Circle correlation, never resubmission. */
export async function reconcile(config:CircleConfig,name:string):Promise<Operation>{
 validName(name);await assertTestnet(config);const filename=join(config.journal,`${name}.json`);const op=await load(filename);if(!op)throw Error('Unknown operation.');if(op.status==='failed')return op;
 let cursor:string|undefined;let matched:Record<string,Json>|undefined;
 if(typeof op.result?.id==='string'){
  const data=await circle(config,['transaction','list','--address',config.wallet,'--chain',CHAIN,'--transaction-id',op.result.id,'--output','json'],true) as {transactions?:unknown[]};
  if(!Array.isArray(data.transactions)||data.transactions.length!==1)throw Error('Missing exact Circle transaction detail.');
  const detail=sanitizeResult(data.transactions[0]);
  if(detail.id!==op.result.id||detail.blockchain!==CHAIN||String(detail.sourceAddress).toLowerCase()!==config.wallet.toLowerCase())throw Error('Circle detail differs from original wallet, chain or transaction ID.');
  matched=detail;
 }
 for(let page=0;!matched&&page<20;page++){
  const data=await circle(config,['transaction','list','--address',config.wallet,'--chain',CHAIN,'--limit','50','--output','json',...(cursor?['--cursor',cursor]:[])],true) as {transactions?:unknown[];cursor?:string};
  if(!data||!Array.isArray(data.transactions))throw Error('Unexpected Circle history envelope.');
  for(const value of data.transactions){const tx=sanitizeResult(value);if(tx.idempotencyKey===op.idempotencyKey||(op.result?.id&&tx.id===op.result.id)||(op.result?.txHash&&tx.txHash===op.result.txHash)){matched=tx;break;}}
  if(matched||data.transactions.length<50)break;const last=sanitizeResult(data.transactions.at(-1));if(typeof last.id!=='string')break;cursor=last.id;
 }
 if(matched){if(op.result?.txHash&&matched.txHash&&op.result.txHash!==matched.txHash)throw Error('Conflicting Circle transaction hash; preserve original evidence.');op.result={...op.result,...matched,idempotencyKey:op.idempotencyKey};op.status=matched.state==='FAILED'||matched.state==='CANCELLED'||matched.state==='DENIED'?'failed':'submitted';await save(filename,op);if(op.status==='failed')return op;}
 if(!op.result?.txHash&&typeof op.result?.userOpHash==='string'){
  if(op.result.blockchain!==CHAIN||String(op.result.sourceAddress).toLowerCase()!==config.wallet.toLowerCase())throw Error('Circle user operation belongs to a different wallet or chain.');
  const hash=await findFinalizedUserOperation(publicClient(config),config.wallet,op.result.userOpHash as Hex);
  if(hash){op.result.txHash=hash;op.result.chainCorrelation='finalized-user-operation-event';await save(filename,op);}
 }
 requireCircleTransactionHash(op);
 await receipt(config,op);return op;
}
export async function signPolicyDigest(digest:Hex,env=process.env):Promise<{signature:Hex;approver:Address;signerMode:'usb'|'speculos'}>{
 if(!/^0x[\da-f]{64}$/i.test(digest)||!env.LEDGER_CONTROLLER_ADDRESS||!isAddress(env.LEDGER_CONTROLLER_ADDRESS))throw Error('Expected raw 32-byte digest and pinned approver.');
 const address=env.LEDGER_CONTROLLER_ADDRESS;const path=env.LEDGER_DERIVATION_PATH||"44'/60'/0'/0/0";
 if(!/^44'\/60'\/\d+'\/\d+\/\d+$/.test(path))throw Error('Invalid derivation path.');
 const signer=signerConfiguration(env);const {default:Eth}=await import('@ledgerhq/hw-app-eth');
 const transport=signer.mode==='speculos'?new SpeculosTransport(signer.url):await (await import('@ledgerhq/hw-transport-node-hid')).default.create();
 try{
  const app=new Eth(transport);const derived=await app.getAddress(path,true);if(derived.address.toLowerCase()!==address.toLowerCase())throw Error('Signer does not match pinned approver.');
  const signed=await app.signPersonalMessage(path,digest.slice(2));const signature=`0x${signed.r}${signed.s}${signed.v.toString(16).padStart(2,'0')}` as Hex;
  if(!await verifyMessage({address,message:{raw:digest},signature}))throw Error('Signature recovery failed.');return {signature,approver:address,signerMode:signer.mode};
 }finally{await transport.close();}
}

export async function deployManagedMarket(config:CircleConfig,reserve:Address,reviewPool:Address){
 if(!isAddress(reserve)||!isAddress(reviewPool)||/^0x0{40}$/i.test(reserve)||/^0x0{40}$/i.test(reviewPool))throw Error('Explicit nonzero recipient addresses required.');
 const policyOp=await deployCircle(config,'deploy-policy','ObolosPolicyEnvelope',[config.wallet,config.approver,config.wallet]);const policy=await deployedAddress(config,policyOp,'ObolosPolicyEnvelope');
 const ledgerOp=await deployCircle(config,'deploy-ledger','ObolosEconomicLedger',[config.wallet,config.wallet]);const ledger=await deployedAddress(config,ledgerOp,'ObolosEconomicLedger');
 const settlementOp=await deployCircle(config,'deploy-market','ObolosMarketSettlement',[policy,ledger,reserve,reviewPool]);const settlement=await deployedAddress(config,settlementOp,'ObolosMarketSettlement');
 const client=publicClient(config);const read=async(address:Address,name:string,functionName:string)=>client.readContract({address,abi:(await artifact(name)).abi,functionName});
 for(const [address,name,expected] of [[policy,'ObolosPolicyEnvelope',{controller:config.wallet,approver:config.approver,guardian:config.wallet}],[ledger,'ObolosEconomicLedger',{controller:config.wallet,attester:config.wallet}],[settlement,'ObolosMarketSettlement',{policy,ledger,reserve,reviewPool,token:'0x3600000000000000000000000000000000000000'}]] as const){
  for(const [field,value] of Object.entries(expected))if(String(await read(address,name,field)).toLowerCase()!==value.toLowerCase())throw Error(`Deployment field mismatch: ${field}.`);
 }
 for(const [address,name,opName] of [[policy,'ObolosPolicyEnvelope','wire-policy'],[ledger,'ObolosEconomicLedger','wire-ledger']] as const){
  const current=String(await read(address,name,'settlement'));if(/^0x0{40}$/i.test(current)){await receipt(config,await executeCircle(config,opName,address,'wireSettlement(address)',[settlement]));}
  else if(current.toLowerCase()!==settlement.toLowerCase())throw Error('Settlement already wired to a different address.');
  if(String(await read(address,name,'settlement')).toLowerCase()!==settlement.toLowerCase())throw Error('Wiring verification failed.');
 }
 const first=await receipt(config,policyOp);
 return {chainId:CHAIN_ID,policy,ledger,settlement,fromBlock:first.blockNumber.toString(),controller:config.wallet,approver:config.approver,reserve,reviewPool};
}
async function main(){
 const [command,...args]=process.argv.slice(2);
 if(!command||command==='--help'){console.log('Usage with tsx --env-file=.env.broker scripts/economy-circle.ts:\n  deploy <reserve> <reviewPool> <output-json> --execute-testnet\n  reconcile <operation-name>\n  sign-digest <0x32-byte-digest>\nDeployment submits transactions only with --execute-testnet. Imported helpers do not run automatically. Reuse the operation journal; never delete uncertain operations.');return;}
 if(command==='sign-digest'){const result=await signPolicyDigest(args[0] as Hex);console.log(JSON.stringify(result));return;}
 const config=configuration();
 if(command==='reconcile'){const op=await reconcile(config,args[0]);console.log(JSON.stringify({name:op.name,status:op.status,result:op.result}));return;}
 if(command==='deploy'){
  if(args.length!==4||args[3]!=='--execute-testnet')throw Error('Explicit testnet execution flag and output path required.');
  const filename=resolve(args[2]);try{await readFile(filename);throw Error('Output already exists; inspect it instead of overwriting.');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  const deployment=await deployManagedMarket(config,args[0] as Address,args[1] as Address);await mkdir(resolve(filename,'..'),{recursive:true});await save(filename,deployment);console.log(JSON.stringify(deployment));return;
 }
 throw Error('Unknown command.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(error instanceof Error?error.message:'Economy operation failed.');process.exitCode=1;});
