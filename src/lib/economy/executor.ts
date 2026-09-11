/** Local-only durable purchaser. All external effects enter through explicit boundaries. */
import {randomUUID} from 'node:crypto';
import {mkdir,open,readFile,rename,unlink} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {keccak256,toHex,isAddress,type Hex} from 'viem';
import {z} from 'zod';
import {canonicalJsonHash,serviceDefinitionSchema,validateServiceDefinition,validateSchemaValue,validateServiceRequest,type ServiceRequest} from './service-contract';
const hex=z.string().regex(/^0x[\da-f]{64}$/i).transform(v=>v.toLowerCase() as Hex);
const address=z.string().refine(isAddress).transform(v=>v.toLowerCase() as `0x${string}`);
export const executorInputSchema=z.object({version:z.literal(1),origin:z.string().url().refine(value=>{const u=new URL(value);return u.protocol==='https:'&&u.origin===value;}),platformAgentId:z.uuid(),orderId:hex.refine(v=>!/^0x0+$/.test(v)),owner:address,payer:address,definition:serviceDefinitionSchema,serviceHash:hex,input:z.unknown(),maxAmountAtomic:z.string().regex(/^[1-9]\d*$/),expiry:z.string().regex(/^[1-9]\d*$/)}).strict();
export type ExecutorInput=z.infer<typeof executorInputSchema>;
export type Versions={policyVersion:string;agentVersion:string;feeVersion:string};
export type ExecutorState={version:1;intent:ExecutorInput;intentHash:Hex;versions:Versions;phase:'prepared'|'approving'|'approved'|'paying'|'paid'|'delivered'|'acknowledging'|'completed'|'aborting'|'aborted';abortHash?:Hex;abortRevokeRequired?:boolean;request?:ServiceRequest;paymentHash?:Hex;output?:unknown;outputHash?:Hex;acknowledgmentHash?:Hex};
export type Delivery={orderId:string;serviceHash:string;transactionHash:string;state:string;output?:unknown;outputHash?:string};
export type ExecutorAction='approve'|'pay'|'ack'|'abort';
export type ExecutorDependencies={prepareApproval:(state:ExecutorState)=>Promise<void>;preparePayment:(state:ExecutorState)=>Promise<void>;assertActiveService:(input:ExecutorInput)=>Promise<void>;hasOperation:(state:ExecutorState,kind:ExecutorAction)=>Promise<boolean>;prepareAbort:(state:ExecutorState)=>Promise<boolean>;abort:(state:ExecutorState)=>Promise<Hex>;verifyAborted:(state:ExecutorState)=>Promise<void>;authenticate:(input:ExecutorInput)=>Promise<void>;preflight:(input:ExecutorInput,versions?:Versions)=>Promise<Versions>;approve:(state:ExecutorState)=>Promise<void>;pay:(state:ExecutorState)=>Promise<Hex>;recover:(state:ExecutorState,kind:ExecutorAction)=>Promise<Hex>;verifyPayment:(state:ExecutorState)=>Promise<void>;deliver:(request:ServiceRequest)=>Promise<Delivery>;verifyDelivery:(state:ExecutorState)=>Promise<boolean>;acknowledge:(state:ExecutorState)=>Promise<Hex>};
export function operationName(state:ExecutorState,kind:ExecutorAction){return `executor-${state.intent.orderId.slice(2)}-${kind}`;}
export function settlementOrder(state:ExecutorState){const i=state.intent,s=i.definition;return {orderId:i.orderId,agentId:keccak256(toHex(i.platformAgentId)),category:['data','compute','inference','verification','storage'].indexOf(s.category),seller:s.seller,serviceHash:s.serviceHash,unitHash:keccak256(toHex(s.unit)),quantity:BigInt(s.quantity),unitPrice:BigInt(s.unitPriceAtomic),amount:BigInt(s.quantity)*BigInt(s.unitPriceAtomic),inputHash:canonicalJsonHash(i.input),deadline:BigInt(i.expiry),policyVersion:BigInt(state.versions.policyVersion),agentVersion:BigInt(state.versions.agentVersion),feeVersion:BigInt(state.versions.feeVersion)};}
async function read(path:string):Promise<unknown|undefined>{try{return JSON.parse(await readFile(path,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return;throw Error('Invalid executor journal; preserve it for inspection.');}}
async function save(path:string,value:unknown){const tmp=path+'.'+randomUUID()+'.tmp',file=await open(tmp,'wx',0o600);try{await file.writeFile(JSON.stringify(value,null,2)+'\n');await file.sync();}finally{await file.close();}await rename(tmp,path);const dir=await open(dirname(path),'r');try{await dir.sync();}finally{await dir.close();}}
function requestFor(state:ExecutorState):ServiceRequest {const i=state.intent,s=i.definition,o=settlementOrder(state);if(!state.paymentHash)throw Error('Missing payment proof.');return validateServiceRequest(s,{protocol:s.protocol,orderId:i.orderId,agentId:o.agentId,payer:i.payer,serviceHash:s.serviceHash,inputHash:o.inputHash,category:s.category,unit:s.unit,quantity:s.quantity,unitPriceAtomic:s.unitPriceAtomic,amountAtomic:o.amount.toString(),settlement:{chainId:5042002,address:s.settlementAddress,ledgerAddress:s.ledgerAddress,transactionHash:state.paymentHash},input:i.input});}
export async function runEconomyExecutor(value:unknown,directory:string,d:ExecutorDependencies,options:{abortUnpaid?:boolean}={}):Promise<ExecutorState>{
 const intent=executorInputSchema.parse(value);validateServiceDefinition(intent.definition);validateSchemaValue(intent.input,intent.definition.inputSchema);
 if(intent.serviceHash!==intent.definition.serviceHash||BigInt(intent.definition.quantity)*BigInt(intent.definition.unitPriceAtomic)>BigInt(intent.maxAmountAtomic))throw Error('Service or maximum amount mismatch.');
 await mkdir(directory,{recursive:true,mode:0o700});let lock;const lockPath=join(directory,'executor.lock');try{lock=await open(lockPath,'wx',0o600);}catch{throw Error('Executor locked; inspect the owning process before removing a stale lock.');}
 try{
  const path=join(directory,intent.orderId+'.json'),intentHash=canonicalJsonHash(intent);let state=await read(path) as ExecutorState|undefined;
  if(state&&(state.version!==1||state.intentHash!==intentHash||canonicalJsonHash(state.intent)!==intentHash))throw Error('Order intent is immutable; preserve the original input and journal.');
  if(state&&!['prepared','approving','approved','paying','paid','delivered','acknowledging','completed','aborting','aborted'].includes(state.phase))throw Error('Invalid executor phase.');
  if(!options.abortUnpaid)await d.authenticate(intent);
  const reservationPath=join(directory,'allowance-reservation.json'),reservation=await read(reservationPath) as {orderId:string}|undefined;
  if(reservation&&reservation.orderId!==intent.orderId)throw Error('Another order holds the allowance reservation; reconcile that order first.');
  if(!state&&options.abortUnpaid)throw Error('No stored unpaid order to abort.');
  if(!state){const versions=await d.preflight(intent);state={version:1,intent,intentHash,versions,phase:'prepared'};await save(path,state);}
  const persist=()=>save(path,state);
  const release=async()=>{try{await unlink(reservationPath);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}const dir=await open(directory,'r');try{await dir.sync();}finally{await dir.close();}};
  if(state.phase==='aborted'){await d.verifyAborted(state);await release();return state;}
  if(options.abortUnpaid||state.phase==='aborting'){
   if(!['prepared','approving','approved','paying','aborting'].includes(state.phase))throw Error('A paid order cannot be aborted.');
   if(state.phase!=='aborting'){state.abortRevokeRequired=await d.prepareAbort(state);state.phase='aborting';await persist();}
   if(state.abortRevokeRequired){
    state.abortHash=await d.hasOperation(state,'abort')?await d.recover(state,'abort'):await d.abort(state);
   }
   await d.verifyAborted(state);state.phase='aborted';await persist();await release();return state;
  }
  // A crash before Circle's durable submit boundary is distinguishable from an
  // uncertain external submission only under the operation lock and chain evidence.
  if(state.phase==='approving'&&!await d.hasOperation(state,'approve')){state.phase='prepared';await persist();await release();}
  if(state.phase==='paying'&&!await d.hasOperation(state,'pay')){state.phase='approved';await persist();}
  if(state.phase==='prepared'||state.phase==='approving'||state.phase==='approved'){
   const versions=await d.preflight(intent,state.versions);if(canonicalJsonHash(versions)!==canonicalJsonHash(state.versions))throw Error('Stored policy versions are immutable.');
   if(state.phase==='approving'){await d.recover(state,'approve');state.phase='approved';await persist();}
   if(state.phase==='prepared'){
    await d.prepareApproval(state);
    await save(reservationPath,{orderId:intent.orderId,payer:intent.payer});state.phase='approving';await persist();
    try{await d.approve(state);}catch(error){if(!await d.hasOperation(state,'approve')){state.phase='prepared';await persist();await release();}throw error;}
    state.phase='approved';await persist();
   }
   // Simulate with the approved allowance before persisting an irreversible phase.
   // Recheck platform authorization and the exact offer after the slow approval.
   await d.preparePayment(state);await d.authenticate(intent);await d.assertActiveService(intent);
   state.phase='paying';await persist();
   try{state.paymentHash=await d.pay(state);}catch(error){if(!await d.hasOperation(state,'pay')){state.phase='approved';await persist();}throw error;}
   state.request=requestFor(state);state.phase='paid';await persist();
  }else if(state.phase==='paying'){
   state.paymentHash=await d.recover(state,'pay');state.request=requestFor(state);state.phase='paid';await persist();
  }
  if(!state.request||canonicalJsonHash(state.request)!==canonicalJsonHash(requestFor(state)))throw Error('Stored request is missing or differs from immutable terms.');
  await d.verifyPayment(state);
  if(reservation||state.phase==='paid')await release();
  if(state.phase==='paid'){
   const result=await d.deliver(state.request);if(result.state!=='fulfilled')throw Error('Paid delivery remains pending; retry the same input.');
   if(result.orderId!==intent.orderId||result.serviceHash!==intent.serviceHash||result.transactionHash!==state.paymentHash||result.outputHash!==canonicalJsonHash(result.output))throw Error('Unbound provider output.');
   validateSchemaValue(result.output,intent.definition.outputSchema,128*1024);state.output=result.output;state.outputHash=result.outputHash as Hex;state.phase='delivered';await persist();
  }
  if(state.outputHash!==canonicalJsonHash(state.output))throw Error('Stored output hash mismatch.');
  const alreadyAcknowledged=await d.verifyDelivery(state);
  if(state.phase==='completed'){if(!alreadyAcknowledged)throw Error('Acknowledgment not finalized.');return state;}
  if(state.phase==='acknowledging'){state.acknowledgmentHash=await d.recover(state,'ack');if(!await d.verifyDelivery(state))throw Error('Acknowledgment not finalized.');state.phase='completed';await persist();return state;}
  if(alreadyAcknowledged){state.phase='completed';await persist();return state;}
  state.phase='acknowledging';await persist();state.acknowledgmentHash=await d.acknowledge(state);state.phase='completed';await persist();return state;
 }finally{await lock.close();await unlink(lockPath);}
}
