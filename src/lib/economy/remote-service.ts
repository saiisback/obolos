import {lookup} from 'node:dns/promises';
import {request as httpsRequest,type RequestOptions} from 'node:https';
import {isIP} from 'node:net';
import {PlatformError} from '../platform/http';
import {isPublicVerifierAddress,validateRemoteVerifierUrl} from '../market/remote-verifier';
import {canonicalJsonHash,serviceResponseSchema,validateSchemaValue,validateServiceDefinition,validateServiceRequest,verifyServiceSettlement,type ServiceDefinition,type ServiceReceipt,type ServiceRequest,type ServiceResponse} from './service-contract';

const timeoutMs=12000,responseLimit=128*1024;
export type RemoteServiceDependencies={resolve:(hostname:string)=>Promise<{address:string;family:number}[]>;request:typeof httpsRequest};
const defaults:RemoteServiceDependencies={resolve:hostname=>lookup(hostname,{all:true,verbatim:true}),request:httpsRequest};
const failure=(code:string,message:string)=>new PlatformError(502,code,message);

/** Calls a paid service only after independently validating its Arc settlement receipt. */
export async function requestRemoteService(input:{service:ServiceDefinition;request:ServiceRequest;receipt:ServiceReceipt},dependencies:RemoteServiceDependencies=defaults):Promise<ServiceResponse> {
 const service=validateServiceDefinition(input.service),request=validateServiceRequest(service,input.request);verifyServiceSettlement(service,request,input.receipt);
 const url=validateRemoteVerifierUrl(service.endpoint),payload=JSON.stringify(request),controller=new AbortController();
 const timeout=failure('SERVICE_TIMEOUT','The paid service did not finish within 12 seconds. Delivery remains unconfirmed.');let timer:ReturnType<typeof setTimeout>|undefined;
 const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(timeout);},timeoutMs);});
 try{return await Promise.race([(async()=>{
  const addresses=await dependencies.resolve(url.hostname);if(controller.signal.aborted)throw timeout;
  if(!addresses.length||addresses.some(record=>![4,6].includes(record.family)||record.family!==isIP(record.address)||!isPublicVerifierAddress(record.address)))throw failure('SERVICE_ADDRESS_BLOCKED','The service hostname must resolve only to public addresses.');
  const pinned=addresses[0];return new Promise<ServiceResponse>((resolve,reject)=>{
   const options:RequestOptions={protocol:'https:',hostname:url.hostname,servername:url.hostname,port:443,path:url.pathname,method:'POST',agent:false,signal:controller.signal,rejectUnauthorized:true,headers:{'content-type':'application/json',accept:'application/json','content-length':Buffer.byteLength(payload),'idempotency-key':request.orderId},lookup:((_hostname:string,opts:{all?:boolean},callback:(...args:unknown[])=>void)=>opts.all?callback(null,[{address:pinned.address,family:pinned.family}]):callback(null,pinned.address,pinned.family)) as RequestOptions['lookup']};
   const req=dependencies.request(options,res=>{let settled=false;const finish=(error:Error)=>{if(settled)return;settled=true;reject(error);res.destroy();req.destroy();};
    if(!res.statusCode||res.statusCode<200||res.statusCode>=300){finish(failure('SERVICE_HTTP_ERROR','The paid service returned an unsuccessful response. Redirects are not followed.'));return;}
    if(!/^application\/json(?:\s*;|\s*$)/i.test(String(res.headers['content-type']??''))||res.headers['content-encoding']&&res.headers['content-encoding']!=='identity'){finish(failure('SERVICE_INVALID_RESPONSE','The service must return uncompressed JSON.'));return;}
    if(Number(res.headers['content-length'])>responseLimit){finish(failure('SERVICE_RESPONSE_TOO_LARGE','The service response exceeded 128 KiB.'));return;}
    const chunks:Buffer[]=[];let bytes=0;res.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>responseLimit){finish(failure('SERVICE_RESPONSE_TOO_LARGE','The service response exceeded 128 KiB.'));return;}chunks.push(Buffer.from(chunk));});
    res.on('error',()=>finish(failure('SERVICE_CONNECTION_FAILED','The service connection ended before a complete response.')));res.on('aborted',()=>finish(failure('SERVICE_CONNECTION_FAILED','The service connection ended before a complete response.')));
    res.on('end',()=>{if(settled)return;try{const result=serviceResponseSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));if(result.orderId!==request.orderId||result.serviceHash!==service.serviceHash||result.inputHash!==request.inputHash||result.outputHash!==canonicalJsonHash(result.output))throw Error();validateSchemaValue(result.output,service.outputSchema,responseLimit);settled=true;resolve(result);}catch{finish(failure('SERVICE_INVALID_RESPONSE','The service returned invalid or unbound output.'));}});
   });req.on('error',()=>reject(controller.signal.aborted?timeout:failure('SERVICE_CONNECTION_FAILED','Could not securely connect to the paid service.')));req.end(payload);
  });
 })(),deadline]);}catch(error){if(error instanceof PlatformError)throw error;throw failure('SERVICE_CONNECTION_FAILED','Could not securely connect to the paid service.');}finally{if(timer)clearTimeout(timer);controller.abort();}
}
