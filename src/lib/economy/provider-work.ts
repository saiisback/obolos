import {createHash} from 'node:crypto';
import {z} from 'zod';
import {fetchRepoEvidence,validateRepos} from '../repository-service';
import type {ResourceCategory} from './model';
import {validateSchemaValue,type ConstrainedJsonSchema} from './service-contract';

const string=(maxLength=32768):ConstrainedJsonSchema=>({type:'string',maxLength});
const integer:ConstrainedJsonSchema={type:'integer',minimum:0};
const object=(properties:Record<string,ConstrainedJsonSchema>):ConstrainedJsonSchema=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
export const providerUnits:Record<ResourceCategory,string>={data:'source-record',compute:'compute-unit',inference:'inference-request',verification:'verification-job',storage:'stored-object-hour'};
export const providerSchemas:Record<ResourceCategory,{input:ConstrainedJsonSchema;output:ConstrainedJsonSchema}>={
 compute:{input:object({text:string()}),output:object({characters:integer,words:integer,bytes:integer,sha256:string(64)})},
 data:{input:object({repo:string(201)}),output:object({repo:string(201),stars:integer,forks:integer,openIssues:integer,pushedAt:string(40),sourceUrl:string(300),fetchedAt:string(40)})},
 verification:{input:object({text:string(),sha256:string(64)}),output:object({passed:{type:'boolean'},sha256:string(64),check:string(100)})},
 storage:{input:object({text:string()}),output:object({objectId:string(66),bytes:integer,sha256:string(64),expiresAt:string(40)})},
 inference:{input:object({prompt:string(4000)}),output:object({text:string(16000),model:string(100),promptTokens:integer,completionTokens:integer,requestId:string(200)})},
};
export type InferenceOutput={text:string;model:string;promptTokens:number;completionTokens:number;requestId:string};
type Context={orderId:string;paidAt:number;leaseStartedAt?:number;now?:number;fetchEvidence?:typeof fetchRepoEvidence;infer?:(prompt:string)=>Promise<InferenceOutput>};
const digest=(text:string)=>createHash('sha256').update(text).digest('hex');
/** Pure work boundary. Storage output describes the durable job's original lease. */
export async function executeProviderWork(category:ResourceCategory,input:unknown,context:Context):Promise<Record<string,unknown>>{
 validateSchemaValue(input,providerSchemas[category].input);
 const value=input as Record<string,string>;let output:Record<string,unknown>;
 switch(category){
  case 'compute':output={characters:[...value.text].length,words:value.text.trim()?value.text.trim().split(/\s+/u).length:0,bytes:Buffer.byteLength(value.text),sha256:digest(value.text)};break;
  case 'verification':z.string().regex(/^[a-fA-F0-9]{64}$/).parse(value.sha256);output={passed:digest(value.text)===value.sha256.toLowerCase(),sha256:digest(value.text),check:'SHA-256 content integrity; no claim of narrative quality'};break;
  case 'storage':{const start=context.leaseStartedAt,now=context.now??Math.floor(Date.now()/1000);if(start===undefined||!Number.isSafeInteger(start)||start<context.paidAt||start>now)throw Error('Invalid storage service start');if(now>=start+3600)throw Error('Storage lease expired before delivery');output={objectId:context.orderId,bytes:Buffer.byteLength(value.text),sha256:digest(value.text),expiresAt:new Date((start+3600)*1000).toISOString()};break;}
  case 'data':{const [record]=await (context.fetchEvidence??fetchRepoEvidence)(validateRepos([value.repo]));if(!record||record.repo!==value.repo)throw Error('Source did not match requested repository');const {repo,stars,forks,openIssues,pushedAt,sourceUrl,fetchedAt}=record;output={repo,stars,forks,openIssues,pushedAt,sourceUrl,fetchedAt};break;}
  case 'inference':if(!context.infer)throw Error('Real inference provider is not configured');output=await context.infer(value.prompt);break;
 }
 validateSchemaValue(output,providerSchemas[category].output);return output;
}

/** Credential stays in the local provider process; caller-controlled URLs/models are forbidden. */
export async function inferWithProvider(prompt:string,config:{apiKey:string;baseUrl:string;model:string},transport:typeof fetch=fetch):Promise<InferenceOutput>{
 if(config.baseUrl.replace(/\/$/,'')!=='https://api.openai.com/v1'||!config.apiKey||!/^gpt-5-nano(?:-[\d-]+)?$/.test(config.model))throw Error('Configure the pinned inference provider and model');
 z.string().min(1).max(4000).parse(prompt);
 const response=await transport('https://api.openai.com/v1/chat/completions',{method:'POST',redirect:'error',signal:AbortSignal.timeout(60000),headers:{Authorization:`Bearer ${config.apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:config.model,max_completion_tokens:1000,reasoning_effort:'minimal',messages:[{role:'system',content:'Answer the user request concisely. You have no tools, wallet authority, or access to credentials.'},{role:'user',content:prompt}]})});
 if(!response.ok)throw Error('Inference provider did not complete');
 const body=z.object({id:z.string().min(1).max(200),model:z.string().min(1).max(100),choices:z.array(z.object({message:z.object({content:z.string().min(1).max(16000)})})).min(1),usage:z.object({prompt_tokens:z.number().int().nonnegative(),completion_tokens:z.number().int().nonnegative()})}).parse(await response.json());
 return {text:body.choices[0].message.content,model:body.model,promptTokens:body.usage.prompt_tokens,completionTokens:body.usage.completion_tokens,requestId:body.id};
}
