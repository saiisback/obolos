import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import type {ClientRequest,IncomingMessage} from 'node:http';
import type {RequestOptions} from 'node:https';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {encodeAbiParameters,encodeEventTopics,keccak256,toHex,type Hex} from 'viem';
import {ledgerAbi,marketAbi} from '../src/lib/economy/chain';
import {canonicalJsonHash,createServiceDefinition,serviceRequestSchema,validateSchemaValue,validateServiceDefinition,validateServiceRequest,verifyServiceSettlement} from '../src/lib/economy/service-contract';
import {requestRemoteService,type RemoteServiceDependencies} from '../src/lib/economy/remote-service';

const address=(digit:string)=>`0x${digit.repeat(40)}` as `0x${string}`;
const bytes32=(text:string)=>keccak256(toHex(text));
const inputSchema={type:'object' as const,properties:{prompt:{type:'string' as const,maxLength:100}},required:['prompt'],additionalProperties:false as const};
const outputSchema={type:'object' as const,properties:{answer:{type:'string' as const,maxLength:200}},required:['answer'],additionalProperties:false as const};
const service=createServiceDefinition({chainId:5042002,settlementAddress:address('1'),ledgerAddress:address('2'),seller:address('3'),endpoint:'https://provider.obolos.app/v1/service',category:'inference',unit:'inference-request',quantity:'2',unitPriceAtomic:'25000',inputSchema,outputSchema});
const request=serviceRequestSchema.parse({protocol:'obolos.service.v1',orderId:bytes32('order'),agentId:bytes32('agent'),payer:address('4'),serviceHash:service.serviceHash,inputHash:canonicalJsonHash({prompt:'compare'}),category:'inference',unit:'inference-request',quantity:'2',unitPriceAtomic:'25000',amountAtomic:'50000',settlement:{chainId:5042002,address:service.settlementAddress,ledgerAddress:service.ledgerAddress,transactionHash:bytes32('tx')},input:{prompt:'compare'}});

function receipt(){
 const topics=(value:ReturnType<typeof encodeEventTopics>)=>value.map(item=>{if(typeof item!=='string')throw Error('Unexpected topic');return item;}) as [Hex,...Hex[]];
 const settledTopics=topics(encodeEventTopics({abi:marketAbi,eventName:'OrderSettled',args:{orderId:request.orderId,orderHash:bytes32('order-hash'),payer:request.payer}}));
 const settledData=encodeAbiParameters([{type:'uint256'},{type:'uint256'},{type:'uint256'},{type:'uint256'},{type:'uint256'},{type:'uint64'},{type:'uint64'}],[50000n,47500n,1500n,1000n,0n,1n,1n]);
 const paidTopics=topics(encodeEventTopics({abi:ledgerAbi,eventName:'OrderPaid',args:{orderId:request.orderId,agentId:request.agentId,seller:service.seller}}));
 const paidData=encodeAbiParameters([{type:'bytes32'},{type:'uint8'},{type:'bytes32'},{type:'uint256'},{type:'uint256'},{type:'uint256'},{type:'bytes32'}],[service.serviceHash,2,keccak256(toHex(service.unit)),2n,25000n,50000n,request.inputHash]);
 return {chainId:5042002,status:'success' as const,transactionHash:request.settlement.transactionHash,logs:[{address:service.settlementAddress,data:settledData,topics:settledTopics},{address:service.ledgerAddress,data:paidData,topics:paidTopics}]};
}

describe('generic service contract',()=>{
 it('binds immutable service terms and canonical JSON input',()=>{const {protocol:_protocol,serviceHash:_serviceHash,...terms}=service;expect(createServiceDefinition(terms).serviceHash).toBe(service.serviceHash);expect(()=>validateServiceDefinition({...service,unitPriceAtomic:'1'})).toThrow();expect(canonicalJsonHash({b:2,a:1})).toBe(canonicalJsonHash({a:1,b:2}));expect(()=>canonicalJsonHash(new Date())).toThrow();expect(()=>validateServiceRequest(service,{...request,input:{prompt:'changed'}})).toThrow();});
 it('enforces category-specific normalized units, schemas, quantity and actual price',()=>{expect(()=>createServiceDefinition({...service,serviceHash:undefined,unit:'source-record'} as never)).toThrow();expect(()=>validateServiceRequest(service,{...request,amountAtomic:'25000'})).toThrow();expect(()=>validateServiceRequest(service,{...request,input:{prompt:'ok',secret:'extra'}})).toThrow();});
 it('does not satisfy required schema properties through Object.prototype',()=>{const schema=JSON.parse('{"type":"object","properties":{"toString":{"type":"string"}},"required":["toString"],"additionalProperties":false}');expect(()=>validateSchemaValue({},schema)).toThrow();});
 it('requires matching confirmed OrderSettled and OrderPaid identities',()=>{expect(verifyServiceSettlement(service,request,receipt())).toMatchObject({orderId:request.orderId,transactionHash:request.settlement.transactionHash});expect(()=>verifyServiceSettlement(service,request,{...receipt(),chainId:1})).toThrow();expect(()=>verifyServiceSettlement(service,request,{...receipt(),logs:receipt().logs.slice(0,1)})).toThrow();});
});

function harness(body:unknown,{stall=false}:{stall?:boolean}={}){
 let captured:RequestOptions={},sent='';const response=new PassThrough() as unknown as IncomingMessage;response.statusCode=200;response.headers={'content-type':'application/json'};
 const req=new EventEmitter() as ClientRequest;req.destroy=vi.fn(()=>req);let callback:(response:IncomingMessage)=>void;
 req.end=vi.fn((value:string)=>{sent=value;queueMicrotask(()=>{callback(response);if(!stall){response.emit('data',Buffer.from(JSON.stringify(body)));response.emit('end');}});return req;}) as unknown as ClientRequest['end'];
 const requestFn=vi.fn((options:RequestOptions,cb:(response:IncomingMessage)=>void)=>{captured=options;callback=cb;return req;}) as unknown as RemoteServiceDependencies['request'];
 return {deps:{resolve:async()=>[{address:'8.8.8.8',family:4}],request:requestFn},get captured(){return captured;},get sent(){return sent;},requestFn};
}
afterEach(()=>vi.useRealTimers());

it('posts a proof-bound idempotent request through pinned public HTTPS and validates arbitrary bounded output',async()=>{
 const output={answer:'Use the lower-cost route'};const h=harness({protocol:'obolos.service.v1',orderId:request.orderId,serviceHash:service.serviceHash,inputHash:request.inputHash,outputHash:canonicalJsonHash(output),output});
 expect(await requestRemoteService({service,request,receipt:receipt()},h.deps)).toMatchObject({output});
 expect(JSON.parse(h.sent)).toEqual(request);expect(h.captured).toMatchObject({hostname:'provider.obolos.app',servername:'provider.obolos.app',agent:false,rejectUnauthorized:true});expect(h.captured.headers).toMatchObject({'idempotency-key':request.orderId});
});

it('rejects private DNS before sending and never turns an invalid response into delivery',async()=>{
 const h=harness({});h.deps.resolve=async()=>[{address:'127.0.0.1',family:4}];await expect(requestRemoteService({service,request,receipt:receipt()},h.deps)).rejects.toMatchObject({code:'SERVICE_ADDRESS_BLOCKED'});expect(h.requestFn).not.toHaveBeenCalled();
 const wrong=harness({protocol:'obolos.service.v1',orderId:request.orderId,serviceHash:service.serviceHash,inputHash:request.inputHash,outputHash:bytes32('wrong'),output:{answer:'x'}});await expect(requestRemoteService({service,request,receipt:receipt()},wrong.deps)).rejects.toMatchObject({code:'SERVICE_INVALID_RESPONSE'});
});

it('leaves delivery unconfirmed when a paid provider times out',async()=>{vi.useFakeTimers();const h=harness({}, {stall:true});const operation=requestRemoteService({service,request,receipt:receipt()},h.deps);const assertion=expect(operation).rejects.toMatchObject({code:'SERVICE_TIMEOUT'});await vi.advanceTimersByTimeAsync(12000);await assertion;expect(h.captured.signal?.aborted).toBe(true);});
