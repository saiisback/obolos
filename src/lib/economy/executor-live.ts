/** Circle-backed implementation. Importing this file performs no network or wallet actions. */
import {readFile,mkdir,open,unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createPublicClient,http,keccak256,toHex,parseAbi,type Abi,type Address,type Hex} from 'viem';
import {economyDeployment} from './chain';
import {serializeIndexReads} from './index-rpc';
import {canonicalJsonHash,validateServiceDefinition,verifyServiceSettlement} from './service-contract';
import {operationName,settlementOrder,type ExecutorDependencies,type ExecutorInput,type ExecutorState,type ExecutorAction,type Delivery} from './executor';
import {approveCircleUsdc,executeCircle,reconcile,runtimeMatches,settleCircleOrder,type CircleConfig,type Operation} from '../../../scripts/economy-circle';
const zeroHash='0x'+'0'.repeat(64),token='0x3600000000000000000000000000000000000000' as Address;
const same=(a:unknown,b:unknown)=>String(a).toLowerCase()===String(b).toLowerCase();
const pause=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms));
const tokenAbi=parseAbi(['function allowance(address,address) view returns(uint256)','function balanceOf(address) view returns(uint256)']);
export type ExecutorPolicySnapshot={agent:[Address,Address,boolean,bigint,bigint,bigint,bigint];boundOwner:string;allowed:boolean;category:[boolean,bigint,bigint,bigint,bigint];enabled:boolean;service:[Address,number,Hex,bigint,bigint,Hex];marker:string};
export function assertExecutorPolicy(input:ExecutorInput,snapshot:ExecutorPolicySnapshot){
 const {agent:a,category:c,service:s,boundOwner,allowed,enabled,marker}=snapshot,amount=BigInt(input.definition.quantity)*BigInt(input.definition.unitPriceAtomic),category=['data','compute','inference','verification','storage'].indexOf(input.definition.category);
 if(!same(a[0],input.owner)||!same(a[1],input.payer)||!same(boundOwner,input.owner)||!a[2]||!allowed)throw Error('Owner, executor, active mandate or seller allowlist rejected.');
 if(!enabled||!c[0]||amount>c[1]||a[4]+amount>a[3]||amount>a[5]||amount>c[2]||amount>BigInt(input.maxAmountAtomic))throw Error('Policy spending limits rejected.');
 if(!same(s[0],input.definition.seller)||s[1]!==category||s[2]!==keccak256(toHex(input.definition.unit))||s[3]!==BigInt(input.definition.quantity)||s[4]!==BigInt(input.definition.unitPriceAtomic)||s[5]!==keccak256(toHex(input.definition.endpoint)))throw Error('Onchain service mismatch.');
 if(marker!==zeroHash)throw Error('Order already consumed; recover its original payment journal.');
}
/** Shares Circle's per-operation lock for read/reconcile; never bypass a stale lock. */
export async function withExecutorOperationLock<T>(directory:string,name:string,work:(filename:string)=>Promise<T>):Promise<T>{
 if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,100}$/.test(name))throw Error('Invalid operation name.');
 await mkdir(directory,{recursive:true,mode:0o700});const filename=resolve(directory,name+'.json'),lockPath=filename+'.lock';let lock;
 try{lock=await open(lockPath,'wx',0o600);}catch{throw Error('Circle operation locked; no absence or recovery conclusion is safe.');}
 try{return await work(filename);}finally{await lock.close();await unlink(lockPath);}
}
export function liveExecutorDependencies(config:CircleConfig,intent:ExecutorInput,key:string,options:{deliveryAttempts?:number;pollMs?:number}={}):ExecutorDependencies {
 if(!/^ob_test_[A-Za-z0-9_-]{43}$/.test(key))throw Error('Existing scoped ECONOMY_AGENT_KEY is required.');
 if(!same(intent.payer,config.wallet))throw Error('Pinned payer differs from Circle wallet.');
 const deployment=economyDeployment();if(!deployment)throw Error('Economy is not deployed.');
 const client=serializeIndexReads(createPublicClient({transport:http(config.rpc,{timeout:20000,retryCount:0})}));
 const attempts=options.deliveryAttempts??6,pollMs=options.pollMs??10000;
 if(!Number.isInteger(attempts)||attempts<1||attempts>20||!Number.isInteger(pollMs)||pollMs<1000||pollMs>30000)throw Error('Invalid bounded delivery polling options.');
 type Artifact={abi:Abi;evm:{deployedBytecode:{object:string;immutableReferences?:Record<string,{start:number;length:number}[]>}}};
 const artifacts=new Map<string,Artifact>();
 async function artifact(name:string){if(!artifacts.has(name))artifacts.set(name,JSON.parse(await readFile(resolve(`contracts/artifacts/${name}.json`),'utf8')) as Artifact);return artifacts.get(name)!;}
 async function contract(address:Address,name:string,fn:string,args:unknown[]=[],blockNumber?:bigint):Promise<unknown>{return client.readContract({address,abi:(await artifact(name)).abi,functionName:fn,args,blockNumber});}
 const policy=(fn:string,args:unknown[]=[],blockNumber?:bigint)=>contract(deployment!.policy,'ObolosPolicyEnvelope',fn,args,blockNumber);
 const market=(fn:string,args:unknown[]=[],blockNumber?:bigint)=>contract(deployment!.settlement,'ObolosMarketSettlement',fn,args,blockNumber);
 const ledger=(fn:string,args:unknown[]=[],blockNumber?:bigint)=>contract(deployment!.ledger,'ObolosEconomicLedger',fn,args,blockNumber);
 async function api(path:string,body?:unknown,authenticated=true):Promise<unknown>{
  let response:Response;try{response=await fetch(intent.origin+path,{method:body===undefined?'GET':'POST',headers:{accept:'application/json',...(authenticated?{Authorization:`Bearer ${key}`} :{}),...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(25000)});}catch{throw Error('Platform request unavailable; retain this order for retry.');}
  if(!response.ok){const e=new Error(`Platform request failed (HTTP ${response.status}); preserve this order.`) as Error&{status:number};e.status=response.status;await response.body?.cancel();throw e;}
  if(!response.headers.get('content-type')?.startsWith('application/json'))throw Error('Platform returned non-JSON data.');
  const reader=response.body?.getReader();if(!reader)throw Error('Missing platform response.');const chunks:Uint8Array[]=[];let length=0;
  try{while(true){const next=await reader.read();if(next.done)break;length+=next.value.length;if(length>512*1024){await reader.cancel();throw Error('Platform response too large.');}chunks.push(next.value);}}finally{reader.releaseLock();}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Error('Invalid platform JSON.');}
 }
 async function finalizedReceipt(hash:Hex){
  if(await client.getChainId()!==5042002)throw Error('Wrong chain.');
  for(let attempt=0;attempt<10;attempt++){
   const receipt=await client.getTransactionReceipt({hash}).catch(()=>null);
   if(receipt){if(receipt.status!=='success')throw Error('Transaction reverted; retain immutable journal.');const block=await client.getBlock({blockTag:'finalized'});if(receipt.blockNumber<=block.number)return receipt;}
   if(attempt<9)await pause(2000);
  }
  throw Error('Transaction is not finalized; reconcile the same operation.');
 }
 async function assertUnpaid(){
  if(await client.getChainId()!==5042002)throw Error('Wrong chain.');
  const latest=await client.getBlock(),finalized=await client.getBlock({blockTag:'finalized'});
  for(const block of [latest,finalized]){
   const [marker,paid]=await Promise.all([market('orderHashes',[intent.orderId],block.number),ledger('orders',[intent.orderId],block.number)]);
   if(marker!==zeroHash||!same((paid as unknown[])[0],'0x'+'0'.repeat(40)))throw Error('Onchain order may be paid; preserve its reservation and reconcile.');
  }
 }
 async function hasOperation(state:ExecutorState,kind:ExecutorAction){
  return withExecutorOperationLock(config.journal,operationName(state,kind),async filename=>{
   try{const op=JSON.parse(await readFile(filename,'utf8')) as Operation;if(op.version!==1||op.name!==operationName(state,kind)||!['submitting','uncertain','submitted','failed'].includes(op.status))throw Error('Invalid operation journal.');return true;}
   catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;await assertUnpaid();return false;}
  });
 }
 async function reconcileLocked(state:ExecutorState,kind:ExecutorAction){return withExecutorOperationLock(config.journal,operationName(state,kind),()=>reconcile(config,operationName(state,kind)));}
 async function assertActiveService(input:ExecutorInput){
  const catalog=await api('/api/economy/services',undefined,false) as {services?:unknown[]};
  const matching=catalog.services?.filter(value=>(value as {serviceHash?:unknown})?.serviceHash===input.serviceHash);
  if(matching?.length!==1||canonicalJsonHash(validateServiceDefinition(matching[0]))!==canonicalJsonHash(input.definition))throw Error('Exact active service definition unavailable.');
 }
 async function prepareAbort(state:ExecutorState){
  if(await hasOperation(state,'pay'))throw Error('Payment journal exists; abort cannot exclude an in-flight payment.');
  await assertUnpaid();
  if(!await hasOperation(state,'approve'))return false;
  await circleReceipt(await reconcileLocked(state,'approve'),state,'approve');
  const allowance=await client.readContract({address:token,abi:tokenAbi,functionName:'allowance',args:[intent.payer,deployment!.settlement]});
  if(allowance!==0n&&allowance!==settlementOrder(state).amount)throw Error('Allowance differs from this order; manual reconciliation required.');
  return allowance!==0n;
 }
 async function circleReceipt(op:Operation,state:ExecutorState,kind:ExecutorAction):Promise<Hex>{
  if(!op.result?.txHash)op=await reconcileLocked(state,kind);
  if(op.status!=='submitted'||op.result?.blockchain!=='ARC-TESTNET'||!same(op.result.sourceAddress,config.wallet)||typeof op.result.txHash!=='string'||!/^0x[\da-f]{64}$/i.test(op.result.txHash))throw Error('Circle transaction evidence is incomplete; reconcile this operation.');
  const hash=op.result.txHash.toLowerCase() as Hex;await finalizedReceipt(hash);return hash;
 }
 async function verifyDelivery(state:ExecutorState){
  const block=await client.getBlock({blockTag:'finalized'}),p=await ledger('orders',[state.intent.orderId],block.number) as readonly [Address,Address,Hex,Hex,Hex,boolean];
  if(!same(p[0],intent.payer)||!same(p[1],intent.definition.seller)||p[2]!==intent.serviceHash||p[3]!==state.request!.inputHash||p[4]!==state.outputHash)throw Error('Matching seller delivery is not finalized; retry this same order later.');
  return p[5];
 }
 return {
  hasOperation,assertActiveService,prepareAbort,
  async abort(state){await prepareAbort(state);return circleReceipt(await approveCircleUsdc(config,operationName(state,'abort'),deployment.settlement,0n),state,'abort');},
  async verifyAborted(state){if(await hasOperation(state,'pay'))throw Error('Payment journal exists; reservation retained.');await assertUnpaid();if(state.abortRevokeRequired){const allowance=await client.readContract({address:token,abi:tokenAbi,functionName:'allowance',args:[intent.payer,deployment.settlement],blockTag:'finalized'});if(allowance!==0n)throw Error('Allowance revocation is not finalized.');}},
  async authenticate(){const identity=await api(`/api/v1/agents/${intent.platformAgentId}/economy/orders`) as {platformAgentId?:string;ownerAddress?:string};if(identity.platformAgentId!==intent.platformAgentId||!same(identity.ownerAddress,intent.owner))throw Error('Authenticated platform agent owner differs from pinned owner.');},
  async preflight(input,versions){
   if(await client.getChainId()!==5042002)throw Error('Wrong chain.');
   if(input.definition.chainId!==deployment.chainId||!same(input.definition.settlementAddress,deployment.settlement)||!same(input.definition.ledgerAddress,deployment.ledger)||!same(config.approver,deployment.approver))throw Error('Pinned deployment mismatch.');
   const block=await client.getBlock({blockTag:'finalized'}),head=await client.getBlock();if(BigInt(input.expiry)<=head.timestamp)throw Error('Unpaid intent expired; preserve the original journal.');
   await assertActiveService(input);
   for(const [address,name] of [[deployment.policy,'ObolosPolicyEnvelope'],[deployment.settlement,'ObolosMarketSettlement'],[deployment.ledger,'ObolosEconomicLedger']] as const){const built=await artifact(name),code=await client.getCode({address,blockNumber:block.number});if(!code||!runtimeMatches(code,built.evm.deployedBytecode.object,built.evm.deployedBytecode.immutableReferences))throw Error('Deployment runtime mismatch.');}
   for(const [actual,expected] of await Promise.all([
    market('policy',[],block.number).then(v=>[v,deployment.policy]),market('ledger',[],block.number).then(v=>[v,deployment.ledger]),market('token',[],block.number).then(v=>[v,token]),
    market('reserve',[],block.number).then(v=>[v,deployment.reserve]),market('reviewPool',[],block.number).then(v=>[v,deployment.reviewPool]),policy('controller',[],block.number).then(v=>[v,deployment.controller]),policy('approver',[],block.number).then(v=>[v,deployment.approver]),
    policy('settlement',[],block.number).then(v=>[v,deployment.settlement]),ledger('settlement',[],block.number).then(v=>[v,deployment.settlement]),
   ]))if(!same(actual,expected))throw Error('Deployment wiring mismatch.');
   const id=keccak256(toHex(input.platformAgentId)),category=['data','compute','inference','verification','storage'].indexOf(input.definition.category),amount=BigInt(input.definition.quantity)*BigInt(input.definition.unitPriceAtomic);
   const [agent,boundOwner,allowed,categoryPolicy,enabled,service,pv,av,fv,marker]=await Promise.all([
    policy('agents',[id],block.number),policy('executorOwners',[input.payer],block.number),policy('counterparties',[id,category,input.definition.seller],block.number),policy('categories',[category],block.number),policy('marketEnabled',[],block.number),market('services',[input.serviceHash],block.number),policy('policyVersion',[],block.number),policy('agentVersions',[id],block.number),policy('feeVersion',[],block.number),market('orderHashes',[input.orderId],block.number),
   ]);
   assertExecutorPolicy(input,{agent:agent as ExecutorPolicySnapshot['agent'],boundOwner:String(boundOwner),allowed:allowed===true,category:categoryPolicy as ExecutorPolicySnapshot['category'],enabled:enabled===true,service:service as ExecutorPolicySnapshot['service'],marker:String(marker)});
   const current={policyVersion:String(pv),agentVersion:String(av),feeVersion:String(fv)};if(versions&&canonicalJsonHash(versions)!==canonicalJsonHash(current))throw Error('Stored policy versions changed; no replacement order is permitted.');
   // eth_call checks current rolling windows/delays and mandate without requiring allowance.
   await client.simulateContract({account:deployment.settlement,address:deployment.policy,abi:(await artifact('ObolosPolicyEnvelope')).abi,functionName:'consume',args:[input.orderId,id,input.payer,category,input.definition.seller,amount,BigInt(current.policyVersion),BigInt(current.agentVersion)]});
   return current;
  },
  async prepareApproval(state){
   const amount=settlementOrder(state).amount;
   const [allowance,balance]=await Promise.all([client.readContract({address:token,abi:tokenAbi,functionName:'allowance',args:[intent.payer,deployment.settlement]}),client.readContract({address:token,abi:tokenAbi,functionName:'balanceOf',args:[intent.payer]})]);
   if(allowance!==0n)throw Error('Preexisting allowance requires explicit reconciliation before this order.');
   if(balance<amount)throw Error('Insufficient existing USDC; executor does not fund wallets.');
  },
  async approve(state){await circleReceipt(await approveCircleUsdc(config,operationName(state,'approve'),deployment.settlement,settlementOrder(state).amount),state,'approve');
  },
  async preparePayment(state){await client.simulateContract({account:intent.payer,address:deployment.settlement,abi:(await artifact('ObolosMarketSettlement')).abi,functionName:'settle',args:[settlementOrder(state)]});},
  async pay(state){const order=settlementOrder(state);return circleReceipt(await settleCircleOrder(config,operationName(state,'pay'),deployment.settlement,order),state,'pay');},
  async recover(state,kind){return circleReceipt(await reconcileLocked(state,kind),state,kind);},
  async verifyPayment(state){const receipt=await finalizedReceipt(state.paymentHash!);verifyServiceSettlement(intent.definition,state.request!,{chainId:5042002,status:receipt.status,transactionHash:receipt.transactionHash,logs:receipt.logs});},
  async deliver(request){
   for(let n=0;n<attempts;n++){
    try{const result=await api(`/api/v1/agents/${intent.platformAgentId}/economy/orders`,{request}) as {order?:Delivery};if(result.order?.state==='fulfilled')return result.order;}
    catch(error){const status=(error as {status?:number}).status;if(status!==undefined&&![409,429,502,503,504].includes(status))throw error;}
    if(n+1<attempts)await pause(pollMs);
   }
   throw Error('Delivery polling exhausted. Payment is preserved; rerun the identical private input file.');
  },
  verifyDelivery,
  async acknowledge(state){const hash=await circleReceipt(await executeCircle(config,operationName(state,'ack'),deployment.ledger,'acknowledgeDelivery(bytes32,bytes32)',[intent.orderId,state.outputHash!]),state,'ack');if(!await verifyDelivery(state))throw Error('Acknowledgment is not finalized.');return hash;},
 };
}
