import {decodeEventLog,encodeAbiParameters,isAddress,keccak256,toHex,type Address, type Hex} from 'viem';
import {z} from 'zod';
import {ledgerAbi,marketAbi} from './chain';
import {resourceCategories,type ResourceCategory} from './model';

export const SERVICE_PROTOCOL='obolos.service.v1' as const;
const hex32=z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform(value=>value.toLowerCase() as Hex);
const address=z.string().refine(isAddress).transform(value=>value.toLowerCase() as Address);
const positiveInteger=z.string().regex(/^[1-9]\d*$/);
const category=z.enum(resourceCategories);
export const normalizedUnits={data:['source-record'],compute:['compute-unit'],inference:['inference-request'],verification:['verification-job'],storage:['gigabyte-hour']} as const satisfies Record<ResourceCategory,readonly string[]>;

export type ConstrainedJsonSchema={
 type:'object'|'array'|'string'|'number'|'integer'|'boolean'|'null';
 properties?:Record<string,ConstrainedJsonSchema>;required?:string[];additionalProperties?:false;
 items?:ConstrainedJsonSchema;maxItems?:number;maxLength?:number;minimum?:number;maximum?:number;
};
const schemaKeys=new Set(['type','properties','required','additionalProperties','items','maxItems','maxLength','minimum','maximum']);
function isSchema(value:unknown,depth=0):value is ConstrainedJsonSchema {
 if(depth>8||!value||typeof value!=='object'||Array.isArray(value))return false;
 const item=value as Record<string,unknown>;if(Object.keys(item).some(key=>!schemaKeys.has(key))||!['object','array','string','number','integer','boolean','null'].includes(String(item.type)))return false;
 if(item.type==='object'){
  if(item.additionalProperties!==false||!item.properties||typeof item.properties!=='object'||Array.isArray(item.properties))return false;
  const properties=item.properties as Record<string,unknown>,names=Object.keys(properties);
  if(names.length>50||names.some(name=>!name||name.length>80||!isSchema(properties[name],depth+1)))return false;
  if(item.required!==undefined&&(!Array.isArray(item.required)||item.required.some(name=>typeof name!=='string'||!names.includes(name))||new Set(item.required).size!==item.required.length))return false;
 } else if(item.properties!==undefined||item.required!==undefined||item.additionalProperties!==undefined)return false;
 if(item.type==='array'){if(!isSchema(item.items,depth+1)||!Number.isSafeInteger(item.maxItems)||Number(item.maxItems)<0||Number(item.maxItems)>1000)return false;}
 else if(item.items!==undefined||item.maxItems!==undefined)return false;
 if(item.maxLength!==undefined&&(item.type!=='string'||!Number.isSafeInteger(item.maxLength)||Number(item.maxLength)<0||Number(item.maxLength)>65536))return false;
 for(const key of ['minimum','maximum'] as const)if(item[key]!==undefined&&(typeof item[key]!=='number'||!Number.isFinite(item[key])))return false;
 if((item.minimum!==undefined||item.maximum!==undefined)&&item.type!=='number'&&item.type!=='integer')return false;
 return !(typeof item.minimum==='number'&&typeof item.maximum==='number'&&item.minimum>item.maximum);
}
export const constrainedJsonSchema=z.custom<ConstrainedJsonSchema>(value=>isSchema(value),'Invalid constrained JSON Schema');

function assertJson(value:unknown,limit:number):void {
 const visit=(current:unknown,depth:number):void=>{if(depth>12)throw Error('JSON nesting exceeds limit');if(current===null||typeof current==='string'||typeof current==='boolean')return;if(typeof current==='number'){if(!Number.isFinite(current))throw Error('JSON number must be finite');return;}if(Array.isArray(current)){if(current.length>1000)throw Error('JSON array exceeds limit');for(const child of current)visit(child,depth+1);return;}if(typeof current!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(current)))throw Error('Value is not JSON');const entries=Object.entries(current as Record<string,unknown>);if(entries.length>1000)throw Error('JSON object exceeds limit');for(const [key,child] of entries){if(!key||key.length>256)throw Error('Invalid JSON key');visit(child,depth+1);}};
 visit(value,0);if(new TextEncoder().encode(canonicalJson(value)).byteLength>limit)throw Error('JSON payload exceeds limit');
}
export function canonicalJson(value:unknown):string {
 const encode=(current:unknown):string=>{if(current===null||typeof current==='string'||typeof current==='boolean'||typeof current==='number')return JSON.stringify(current);if(Array.isArray(current))return `[${current.map(encode).join(',')}]`;return `{${Object.entries(current as Record<string,unknown>).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,child])=>`${JSON.stringify(key)}:${encode(child)}`).join(',')}}`;};
 return encode(value);
}
export function canonicalJsonHash(value:unknown):Hex {assertJson(value,128*1024);return keccak256(toHex(canonicalJson(value)));}
function matchesSchema(value:unknown,schema:ConstrainedJsonSchema):boolean {
 switch(schema.type){case'null':return value===null;case'boolean':return typeof value==='boolean';case'string':return typeof value==='string'&&(schema.maxLength===undefined||value.length<=schema.maxLength);case'number':case'integer':return typeof value==='number'&&Number.isFinite(value)&&(schema.type==='number'||Number.isInteger(value))&&(schema.minimum===undefined||value>=schema.minimum)&&(schema.maximum===undefined||value<=schema.maximum);case'array':return Array.isArray(value)&&(schema.maxItems===undefined||value.length<=schema.maxItems)&&value.every(item=>matchesSchema(item,schema.items!));case'object':if(!value||typeof value!=='object'||Array.isArray(value))return false;{const record=value as Record<string,unknown>,properties=schema.properties!;return (schema.required??[]).every(key=>Object.hasOwn(record,key))&&Object.entries(record).every(([key,item])=>Object.hasOwn(properties,key)&&matchesSchema(item,properties[key]));}}
}
export function validateSchemaValue(value:unknown,schema:ConstrainedJsonSchema,limit=64*1024):void {assertJson(value,limit);if(!matchesSchema(value,constrainedJsonSchema.parse(schema)))throw Error('JSON value does not match service schema');}

const serviceBase=z.object({chainId:z.literal(5042002),settlementAddress:address,ledgerAddress:address,seller:address,endpoint:z.string().url(),category,unit:z.string().min(1).max(80),quantity:positiveInteger,unitPriceAtomic:positiveInteger,inputSchema:constrainedJsonSchema,outputSchema:constrainedJsonSchema}).strict();
export const serviceDefinitionSchema=serviceBase.extend({protocol:z.literal(SERVICE_PROTOCOL),serviceHash:hex32}).strict();
export type ServiceDefinition=z.infer<typeof serviceDefinitionSchema>;
export function createServiceDefinition(input:z.input<typeof serviceBase>):ServiceDefinition {
 const parsed=serviceBase.parse(input);if(!normalizedUnits[parsed.category].includes(parsed.unit as never))throw Error('Unit does not match service category');
 const endpoint=new URL(parsed.endpoint);if(endpoint.href!==parsed.endpoint)throw Error('Endpoint must be canonical');
 const unitHash=keccak256(toHex(parsed.unit)),endpointHash=keccak256(toHex(parsed.endpoint));
 const serviceHash=keccak256(encodeAbiParameters([{type:'uint256'},{type:'address'},{type:'address'},{type:'uint8'},{type:'bytes32'},{type:'uint256'},{type:'uint256'},{type:'bytes32'}],[5042002n,parsed.settlementAddress,parsed.seller,resourceCategories.indexOf(parsed.category),unitHash,BigInt(parsed.quantity),BigInt(parsed.unitPriceAtomic),endpointHash]));
 return serviceDefinitionSchema.parse({...parsed,protocol:SERVICE_PROTOCOL,serviceHash});
}
export function validateServiceDefinition(value:unknown):ServiceDefinition {
 const parsed=serviceDefinitionSchema.parse(value),{protocol:_protocol,serviceHash,...terms}=parsed;
 if(createServiceDefinition(terms).serviceHash!==serviceHash)throw Error('Service hash does not match immutable service terms');
 return parsed;
}

export const serviceRequestSchema=z.object({protocol:z.literal(SERVICE_PROTOCOL),orderId:hex32,agentId:hex32,payer:address,serviceHash:hex32,inputHash:hex32,category,unit:z.string(),quantity:positiveInteger,unitPriceAtomic:positiveInteger,amountAtomic:positiveInteger,settlement:z.object({chainId:z.literal(5042002),address,ledgerAddress:address,transactionHash:hex32}).strict(),input:z.unknown()}).strict();
export type ServiceRequest=z.infer<typeof serviceRequestSchema>;
export const serviceResponseSchema=z.object({protocol:z.literal(SERVICE_PROTOCOL),orderId:hex32,serviceHash:hex32,inputHash:hex32,outputHash:hex32,output:z.unknown()}).strict();
export type ServiceResponse=z.infer<typeof serviceResponseSchema>;
export function validateServiceRequest(service:ServiceDefinition,value:unknown):ServiceRequest {
 const request=serviceRequestSchema.parse(value),amount=BigInt(request.quantity)*BigInt(request.unitPriceAtomic);
 if(request.serviceHash!==service.serviceHash||request.category!==service.category||request.unit!==service.unit||request.quantity!==service.quantity||request.unitPriceAtomic!==service.unitPriceAtomic||BigInt(request.amountAtomic)!==amount||request.settlement.chainId!==service.chainId||request.settlement.address!==service.settlementAddress||request.settlement.ledgerAddress!==service.ledgerAddress||request.inputHash!==canonicalJsonHash(request.input))throw Error('Service request does not match immutable order terms');
 validateSchemaValue(request.input,service.inputSchema);return request;
}

export interface ServiceReceipt {chainId:number;status:'success'|'reverted';transactionHash:Hex;logs:{address:Address|string;data:Hex;topics:[]|[Hex,...Hex[]]}[]}
export function verifyServiceSettlement(service:ServiceDefinition,request:ServiceRequest,receipt:ServiceReceipt){
 if(receipt.chainId!==5042002||receipt.status!=='success'||receipt.transactionHash.toLowerCase()!==request.settlement.transactionHash)throw Error('Settlement receipt is not confirmed on Arc testnet');
 let settled=false,paid=false;
 for(const log of receipt.logs){try{
  if(log.address.toLowerCase()===service.settlementAddress){const event=decodeEventLog({abi:marketAbi,data:log.data,topics:log.topics,strict:true});if(event.eventName==='OrderSettled'){const a=event.args;if(a.orderId===request.orderId&&a.payer.toLowerCase()===request.payer&&a.amount===BigInt(request.amountAtomic))settled=true;}}
  if(log.address.toLowerCase()===service.ledgerAddress){const event=decodeEventLog({abi:ledgerAbi,data:log.data,topics:log.topics,strict:true});if(event.eventName==='OrderPaid'){const a=event.args;if(a.orderId===request.orderId&&a.agentId===request.agentId&&a.seller.toLowerCase()===service.seller&&a.serviceHash===service.serviceHash&&a.category===resourceCategories.indexOf(service.category)&&a.unitHash===keccak256(toHex(service.unit))&&a.quantity===BigInt(request.quantity)&&a.unitPrice===BigInt(request.unitPriceAtomic)&&a.amount===BigInt(request.amountAtomic)&&a.inputHash===request.inputHash)paid=true;}}
 }catch{continue;}}
 if(!settled||!paid)throw Error('Receipt does not contain matching OrderSettled and OrderPaid events');
 return {chainId:5042002 as const,orderId:request.orderId,transactionHash:receipt.transactionHash,serviceHash:service.serviceHash,inputHash:request.inputHash};
}
