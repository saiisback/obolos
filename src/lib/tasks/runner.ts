/** Private task orchestration. Payment effects remain inside the existing durable executor. */
import {constants} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {mkdir,open,rename,unlink,realpath} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {isAddress} from 'viem';
import {z} from 'zod';
import {canonicalJsonHash,validateSchemaValue,validateServiceDefinition} from '../economy/service-contract';
import {executorInputSchema,runEconomyExecutor,type ExecutorInput,type ExecutorState,type ExecutorDependencies} from '../economy/executor';
import {createTaskPlan,resolveTaskInput,taskPlanHash,taskStepOrderId,type GeneralTask,type TaskPlan} from './model';
import {parsePlannerOutput,readBoundedJson,type PlannerContext,type PlannerResult} from './planner';
const address=z.string().refine(isAddress).transform(v=>v.toLowerCase() as `0x${string}`);
const hash=z.string().regex(/^0x[\da-f]{64}$/);
const pinsSchema=z.object({origin:z.string().url().refine(v=>{const u=new URL(v);return u.protocol==='https:'&&u.origin===v;}),agentId:z.uuid(),owner:address,payer:address,workerId:z.uuid()}).strict();
export interface TaskRunnerConfig {pins:z.input<typeof pinsSchema>;key:string;directory:string;executorDirectory:string}
export interface TaskRunnerDependencies {transport:typeof fetch;planner:(context:PlannerContext)=>Promise<PlannerResult>;executorDependencies:(intent:ExecutorInput)=>ExecutorDependencies;now?:()=>number}
const taskSchema=z.object({id:z.uuid(),agentId:z.uuid(),instruction:z.string().min(1).max(12000),budgetAtomic:z.string().regex(/^[1-9]\d{0,77}$/),status:z.enum(['queued','planning','needs_approval','approved','running','completed','blocked','cancelled']),plan:z.unknown().nullable(),planHash:hash.nullable(),approvedPlanHash:hash.nullable(),approvalExpiresAt:z.string().nullable(),steps:z.array(z.object({index:z.number().int().min(0).max(4),orderId:hash,transactionHash:hash,outputHash:hash,output:z.unknown()})).max(5),error:z.string().nullable(),createdAt:z.string(),updatedAt:z.string()});
const claimSchema=z.object({task:taskSchema,claimToken:z.string().regex(/^[\da-f]{64}$/),phase:z.enum(['plan','execute'])}).strict();
type Execution={plan:TaskPlan;planHash:string;approvedPlanHash:string;approvalExpiresAt:string};
type Journal={version:1;request:{id:string;agentId:string;instruction:string;budgetAtomic:string};planning?:{blocked:string}|{summary:string;steps:{serviceHash:string;input:unknown}[]};execution?:Execution};
function same(a:unknown,b:unknown){return canonicalJsonHash(a)===canonicalJsonHash(b);}
async function readPrivate(path:string):Promise<unknown|undefined>{
 let file;try{file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return;throw Error('Private journal unavailable; preserve it for inspection');}
 try{const info=await file.stat();if(!info.isFile()||(info.mode&0o077)!==0||info.size>1024*1024||(process.getuid&&info.uid!==process.getuid()))throw Error();return JSON.parse(await file.readFile('utf8'));}catch{throw Error('Invalid private journal; preserve it for inspection');}finally{await file.close();}
}
async function save(path:string,value:unknown){
 const temp=path+'.'+randomUUID()+'.tmp',file=await open(temp,'wx',0o600);
 try{await file.writeFile(JSON.stringify(value,null,2)+'\n');await file.sync();}finally{await file.close();}
 await rename(temp,path);const directory=await open(dirname(path),'r');try{await directory.sync();}finally{await directory.close();}
}
async function privateDirectory(path:string){await mkdir(path,{recursive:true,mode:0o700});const canonical=await realpath(path),file=await open(canonical,'r');try{const info=await file.stat();if(!info.isDirectory()||(info.mode&0o077)!==0||(process.getuid&&info.uid!==process.getuid()))throw Error('Task state directory must be private and owned by this user');}finally{await file.close();}return canonical;}
function bindExecution(task:GeneralTask):Execution {
 if(!task.plan||!task.planHash||!task.approvedPlanHash||!task.approvalExpiresAt||!['approved','running'].includes(task.status))throw Error('Owner approval is required before execution');
 if(!Number.isFinite(Date.parse(task.approvalExpiresAt)))throw Error('Invalid approval expiry');
 const raw={summary:task.plan.summary,steps:task.plan.steps.map(s=>({serviceHash:s.serviceHash,input:s.input}))};
 const plan=createTaskPlan(raw,task.plan.steps.map(s=>s.definition),task.budgetAtomic);
 if(!same(plan,task.plan)||taskPlanHash(plan)!==task.planHash||task.approvedPlanHash!==task.planHash)throw Error('Approved plan authority mismatch');
 return {plan,planHash:task.planHash,approvedPlanHash:task.approvedPlanHash,approvalExpiresAt:task.approvalExpiresAt};
}
/** One claim, one planning call at most, or at most five sequential approved paid steps. */
export async function pollTaskOnce(config:TaskRunnerConfig,d:TaskRunnerDependencies):Promise<'idle'|'planned'|'blocked'|'completed'> {
 const pins=pinsSchema.parse(config.pins);if(!/^ob_test_[A-Za-z0-9_-]{43}$/.test(config.key))throw Error('Existing scoped ECONOMY_AGENT_KEY is required');
 const directory=await privateDirectory(resolve(config.directory)),executorDirectory=await privateDirectory(resolve(config.executorDirectory));
 const lockPath=join(directory,'runner.lock');let lock;try{lock=await open(lockPath,'wx',0o600);}catch{throw Error('Task runner locked; inspect the owning process before removing a stale lock');}
 try{
  const pinsPath=join(directory,'pins.json'),authority={version:1,...pins,executorDirectory},previous=await readPrivate(pinsPath);
  if(previous&&!same(previous,authority))throw Error('Local runner authority is immutable; preserve its existing pins and journals');
  if(!previous)await save(pinsPath,authority);
  const base=`/api/v1/agents/${pins.agentId}/tasks`;
  async function api(path:string,body?:unknown,authenticated=true){
   try{return await readBoundedJson(await d.transport(pins.origin+path,{method:body===undefined?'GET':'POST',headers:{accept:'application/json',...(authenticated?{Authorization:`Bearer ${config.key}`} :{}),...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(25000)}));}
   catch{throw Error('Task platform request unavailable; preserve local journals and retry the same task');}
  }
  async function identity(){const result=z.object({ownerAddress:address,tasks:z.array(taskSchema).max(100)}).parse(await api(base));if(result.ownerAddress!==pins.owner)throw Error('Scoped agent owner differs from the pinned owner');return result.tasks as GeneralTask[];}
  await identity();
  const value=await api(base,{action:'claim',workerId:pins.workerId});if(value===null)return 'idle';
  const claim=claimSchema.parse(value),task=claim.task as GeneralTask;
  if(task.agentId!==pins.agentId)throw Error('Claimed agent differs from the pinned agent');
  const tasksDirectory=await privateDirectory(join(directory,'tasks')),path=join(tasksDirectory,task.id+'.json');
  const request={id:task.id,agentId:task.agentId,instruction:task.instruction,budgetAtomic:task.budgetAtomic};
  let journal=await readPrivate(path) as Journal|undefined;
  if(journal&&(journal.version!==1||!same(journal.request,request)))throw Error('Task request is immutable; preserve its journal');
  if(!journal){journal={version:1,request};await save(path,journal);}
  const update=(body:Record<string,unknown>)=>api(`${base}/${task.id}`,{...body,claimToken:claim.claimToken});
  if(claim.phase==='plan'){
   if(task.status!=='planning'||journal.execution)throw Error('Invalid planning claim');
   try{
    if(!journal.planning||'blocked' in journal.planning){
     const services=z.object({services:z.array(z.unknown()).max(100)}).parse(await api('/api/economy/services',undefined,false)).services.map(validateServiceDefinition);
     const profiles=z.object({profiles:z.array(z.unknown()).max(100)}).parse(await api('/api/economy/service-profiles',undefined,false)).profiles as PlannerContext['profiles'];
     const result=await d.planner({instruction:task.instruction,budgetAtomic:task.budgetAtomic,services,profiles});
     // Revalidate even an injected planner implementation at the authority boundary.
     const checked=parsePlannerOutput(result.kind==='plan'?result.raw:{blocked:result.reason},{instruction:task.instruction,budgetAtomic:task.budgetAtomic,services,profiles});
     journal.planning=checked.kind==='plan'?checked.raw:{blocked:checked.reason};await save(path,journal);
    }
   }catch{await update({action:'blocked',error:'Planning could not produce a valid available service plan within this budget. Retry after checking the catalog and private planner.'});throw Error('Task planning failed; no payment was attempted');}
   if('blocked' in journal.planning){await update({action:'blocked',error:journal.planning.blocked});return 'blocked';}
   await update({action:'plan',plan:journal.planning});return 'planned';
  }
  const execution=bindExecution(task);
  if(journal.execution&&!same(journal.execution,execution))throw Error('Approved execution is immutable; preserve its original plan and journals');
  if(!journal.execution){journal.execution=execution;await save(path,journal);}
  async function assertTaskAuthority(){const current=(await identity()).find(t=>t.id===task.id);if(!current||!same(request,{id:current.id,agentId:current.agentId,instruction:current.instruction,budgetAtomic:current.budgetAtomic})||!same(bindExecution(current),execution))throw Error('Current task approval differs from immutable execution');}
  const outputs:unknown[]=[];
  try{
   for(let index=0;index<execution.plan.steps.length;index++){
    await assertTaskAuthority();
    const step=execution.plan.steps[index],orderId=taskStepOrderId(task.id,execution.planHash,index),stored=await readPrivate(join(executorDirectory,orderId+'.json')) as ExecutorState|undefined;
    if(task.steps.some(s=>s.index===index)&&!stored)throw Error('Existing paid step is missing its original local executor journal');
    if(Date.parse(execution.approvalExpiresAt)<=(d.now?.()??Date.now())&&(!stored||!['paying','paid','delivered','acknowledging','completed'].includes(stored.phase)))throw Error('Approval expired; no new unpaid step can execute');
    const input=resolveTaskInput(step.input,outputs);validateSchemaValue(input,step.definition.inputSchema);
    const intent=executorInputSchema.parse({version:1,origin:pins.origin,platformAgentId:pins.agentId,owner:pins.owner,payer:pins.payer,orderId,definition:step.definition,serviceHash:step.serviceHash,input,maxAmountAtomic:(BigInt(step.definition.quantity)*BigInt(step.definition.unitPriceAtomic)).toString(),expiry:Math.floor(Date.parse(execution.approvalExpiresAt)/1000).toString()});
    const dependencies=d.executorDependencies(intent),authenticate=dependencies.authenticate;
    const assertUnexpired=()=>{if(Date.parse(execution.approvalExpiresAt)<=(d.now?.()??Date.now()))throw Error('Approval expired; no new unpaid step can execute');};
    const state=await runEconomyExecutor(intent,executorDirectory,{...dependencies,async authenticate(value){await assertTaskAuthority();await authenticate(value);},async preflight(value,versions){assertUnexpired();return dependencies.preflight(value,versions);},async preparePayment(value){assertUnexpired();return dependencies.preparePayment(value);}});
    if(state.phase!=='completed'||!state.paymentHash||!state.outputHash||canonicalJsonHash(state.output)!==state.outputHash)throw Error('Step lacks completed durable payment and delivery evidence');
    const prior=task.steps.find(s=>s.index===index);if(prior&&(prior.orderId!==orderId||prior.transactionHash!==state.paymentHash||prior.outputHash!==state.outputHash||!same(prior.output,state.output)))throw Error('Server progress differs from the original paid output');
    outputs.push(state.output);await update({action:'progress',index,orderId});
   }
   await update({action:'complete'});return 'completed';
  }catch(error){
   // Remote/private error bodies can contain credentials or user data. Publish only fixed recovery guidance.
   await update({action:'blocked',error:'Execution paused. Preserve this task, its approved plan and private payment journals. The owner can retry the same task after the runner resolves the original order; no replacement payment or higher budget is authorized.'}).catch(()=>{});
   throw error;
  }
 }finally{await lock.close();await unlink(lockPath);}
}
