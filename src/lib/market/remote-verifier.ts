import {lookup} from 'node:dns/promises';
import {request as httpsRequest,type RequestOptions} from 'node:https';
import {isIP} from 'node:net';
import ipaddr from 'ipaddr.js';
import {z} from 'zod';
import type {Report} from '../contracts';
import {addressSchema,marketReportSchema} from './contracts';
import {PlatformError} from '../platform/http';

const timeoutMs=12000;
const responseLimit=128*1024;
const paidOrderSchema=z.object({
 id:z.uuid(),serviceId:z.uuid(),revision:z.number().int().positive(),recipient:addressSchema,
 amountAtomic:z.number().int().min(1000).max(1000000),transactionHash:z.string().regex(/^0x[\da-fA-F]{64}$/),
 reportDigest:z.string().regex(/^[\da-fA-F]{64}$/),receiptUrl:z.url().refine(value=>new URL(value).protocol==='https:'),
}).strict();
const responseSchema=z.object({checks:z.array(z.object({label:z.string().trim().min(1).max(200),passed:z.boolean(),detail:z.string().max(1000)}).strict()).min(1).max(50)}).strict();
export type RemotePaidOrder=z.infer<typeof paidOrderSchema>;
export type RemoteVerificationResult=z.infer<typeof responseSchema>;
export type RemoteVerifierDependencies={
 resolve:(hostname:string)=>Promise<{address:string;family:number}[]>;
 request:typeof httpsRequest;
};
const defaults:RemoteVerifierDependencies={resolve:hostname=>lookup(hostname,{all:true,verbatim:true}),request:httpsRequest};
function failure(code:string,message:string){return new PlatformError(502,code,message);}

/** Syntax validation can run when publishing. DNS is resolved again for each execution. */
export function validateRemoteVerifierUrl(value:string):URL {
 let url:URL;
 try{url=new URL(value);}catch{throw new PlatformError(400,'INVALID_VERIFIER_URL','Enter a public HTTPS verifier URL.');}
 const hostname=url.hostname.toLowerCase();
 if(value.trim()!==value||url.protocol!=='https:'||url.username||url.password||value.includes('?')||value.includes('#')||url.port||isIP(hostname.replace(/^\[|\]$/g,''))||hostname.length>253||!hostname.includes('.')||hostname.endsWith('.')||!hostname.split('.').every(part=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part))||/(^|\.)(localhost|local|internal|invalid|test|example|home|lan|onion)$/.test(hostname)) {
  throw new PlatformError(400,'INVALID_VERIFIER_URL','Verifier URLs must use a public DNS hostname over HTTPS on port 443, without credentials, query parameters or fragments.');
 }
 return url;
}

/** Fail closed on special-purpose addresses, including IPv4-mapped IPv6. */
export function isPublicVerifierAddress(value:string):boolean {
 if(!isIP(value))return false;
 const address=ipaddr.parse(value);
 if(address.range()!=='unicast')return false;
 if(address.kind()==='ipv4') {
  const ipv4=address as ipaddr.IPv4;
  return !ipv4.match(ipaddr.IPv4.parse('198.18.0.0'),15);
 }
 const ipv6=address as ipaddr.IPv6;
 // Only global unicast allocation; exclude protocol assignments and docs ranges.
 return ipv6.match(ipaddr.IPv6.parse('2000::'),3)&&!ipv6.match(ipaddr.IPv6.parse('2001::'),23)&&!ipv6.match(ipaddr.IPv6.parse('3fff::'),20);
}

export async function requestRemoteVerification(input:{endpoint:string;report:Report;order:RemotePaidOrder;idempotencyKey:string},dependencies:RemoteVerifierDependencies=defaults):Promise<RemoteVerificationResult> {
 const url=validateRemoteVerifierUrl(input.endpoint);
 const order=paidOrderSchema.parse(input.order),report=marketReportSchema.parse(input.report);
 const idempotencyKey=z.string().min(1).max(128).regex(/^[A-Za-z0-9_.:-]+$/).parse(input.idempotencyKey);
 const payload=JSON.stringify({protocol:'obolos.verifier.v1',order,report});
 const controller=new AbortController();
 const timeout=failure('VERIFIER_TIMEOUT','The paid verifier did not finish within 12 seconds.');
 let timer:ReturnType<typeof setTimeout>|undefined;
 const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(timeout);},timeoutMs);});
 try {
  const operation=(async()=>{
   const addresses=await dependencies.resolve(url.hostname);
   if(controller.signal.aborted)throw timeout;
   // Reject the whole answer if any entry could route to a non-public network.
   if(!addresses.length||addresses.some(record=>![4,6].includes(record.family)||record.family!==isIP(record.address)||!isPublicVerifierAddress(record.address)))throw failure('VERIFIER_ADDRESS_BLOCKED','The verifier hostname must resolve only to public addresses.');
   const pinned=addresses[0];
   return new Promise<RemoteVerificationResult>((resolve,reject)=>{
    const options:RequestOptions={
     protocol:'https:',hostname:url.hostname,servername:url.hostname,port:443,path:`${url.pathname}${url.search}`,method:'POST',
     agent:false,signal:controller.signal,rejectUnauthorized:true,
     headers:{'content-type':'application/json',accept:'application/json','content-length':Buffer.byteLength(payload),'idempotency-key':idempotencyKey},
     // Connect to the checked address while preserving TLS/SNI and Host validation.
     lookup:((_hostname:string,opts:{all?:boolean},callback:(...args:unknown[])=>void)=>{
      if(opts.all)callback(null,[{address:pinned.address,family:pinned.family}]);
      else callback(null,pinned.address,pinned.family);
     }) as RequestOptions['lookup'],
    };
    const req=dependencies.request(options,res=>{
     const rejectResponse=(error:Error)=>{reject(error);res.destroy();req.destroy();};
     if(!res.statusCode||res.statusCode<200||res.statusCode>=300){rejectResponse(failure('VERIFIER_HTTP_ERROR','The paid verifier returned an unsuccessful response. Redirects are not followed.'));return;}
     if(!/^application\/json(?:\s*;|\s*$)/i.test(String(res.headers['content-type']??''))||res.headers['content-encoding']&&res.headers['content-encoding']!=='identity'){rejectResponse(failure('VERIFIER_INVALID_RESPONSE','The verifier must return an uncompressed JSON response.'));return;}
     if(Number(res.headers['content-length'])>responseLimit){rejectResponse(failure('VERIFIER_RESPONSE_TOO_LARGE','The verifier response exceeded 128 KiB.'));return;}
     const chunks:Buffer[]=[];let bytes=0;
     res.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>responseLimit){rejectResponse(failure('VERIFIER_RESPONSE_TOO_LARGE','The verifier response exceeded 128 KiB.'));return;}chunks.push(Buffer.from(chunk));});
     res.on('error',()=>reject(failure('VERIFIER_CONNECTION_FAILED','The verifier connection ended before a complete response.')));
     res.on('aborted',()=>reject(failure('VERIFIER_CONNECTION_FAILED','The verifier connection ended before a complete response.')));
     res.on('end',()=>{try{resolve(responseSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8'))));}catch{reject(failure('VERIFIER_INVALID_RESPONSE','The verifier returned invalid checks.'));}});
    });
    req.on('error',()=>reject(controller.signal.aborted?timeout:failure('VERIFIER_CONNECTION_FAILED','Could not securely connect to the paid verifier.')));
    req.end(payload);
   });
  })();
  return await Promise.race([operation,deadline]);
 }catch(error){if(error instanceof PlatformError)throw error;throw failure('VERIFIER_CONNECTION_FAILED','Could not securely connect to the paid verifier.');
 }finally{if(timer)clearTimeout(timer);controller.abort();}
}
