import Transport from '@ledgerhq/hw-transport';
import { request, type ClientRequest } from 'node:http';

export function emulatorUrl():URL {
 const value=process.env.OBOLOS_SPECULOS_SYNC_URL||'http://127.0.0.1:5001';
 if(!/^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(?::([1-9]\d{0,4}))?\/?$/.test(value))throw new Error('Speculos must use a local loopback HTTP origin without credentials or paths.');
 const url=new URL(value);if(url.hostname==='localhost')url.hostname='127.0.0.1';return url;
}

/** Direct APDU-only transport: Node HTTP does not follow redirects or use proxy environment variables. */
export class SyncTransport extends Transport {
 private readonly endpoint:URL;
 private closed=false;
 private pending?:ClientRequest;
 constructor(origin:string){
  super();
  if(!/^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(?::([1-9]\d{0,4}))?\/?$/.test(origin))throw new Error('Speculos must use a local loopback HTTP origin.');
  this.endpoint=new URL(origin);if(this.endpoint.hostname==='localhost')this.endpoint.hostname='127.0.0.1';this.endpoint.pathname='/apdu';this.setExchangeTimeout(120_000);
 }
 async exchange(apdu:Buffer,{abortTimeoutMs}:{abortTimeoutMs?:number}={}):Promise<Buffer>{
  if(this.closed)throw new Error('Speculos transport is closed.');
  if(apdu.length<4||apdu.length>260)throw new Error('Invalid APDU size.');
  const timeout=abortTimeoutMs??this.exchangeTimeout;
  if(!Number.isFinite(timeout)||timeout<=0)throw new Error('Invalid Speculos timeout.');
  return this.exchangeAtomicImpl(()=>new Promise<Buffer>((resolve,reject)=>{
   const body=JSON.stringify({data:apdu.toString('hex')});
   let timer:ReturnType<typeof setTimeout>;let settled=false;
   const fail=(error:Error)=>{if(settled)return;settled=true;clearTimeout(timer);this.pending=undefined;reject(error);};
   const req=request(this.endpoint,{method:'POST',agent:false,headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},res=>{
    if(res.statusCode!==200){fail(new Error(`Speculos APDU HTTP error (${res.statusCode}).`));req.destroy();res.destroy();return;}
    const chunks:Buffer[]=[];let size=0;
    res.on('data',(chunk:Buffer)=>{if(settled)return;size+=chunk.length;if(size>65_536){fail(new Error('Speculos APDU response is too large.'));req.destroy();res.destroy();return;}chunks.push(chunk);});
    res.on('error',()=>fail(new Error('Speculos APDU response interrupted.')));
    res.on('end',()=>{
     if(settled)return;settled=true;clearTimeout(timer);this.pending=undefined;
     let envelope:unknown;
     try{envelope=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{reject(new Error('Invalid Speculos APDU response JSON.'));return;}
     if(!envelope||typeof envelope!=='object'||'error' in envelope||!('data' in envelope)||typeof envelope.data!=='string'||!/^(?:[a-fA-F0-9]{2}){2,}$/.test(envelope.data)){reject(new Error('Invalid Speculos APDU response envelope.'));return;}
     resolve(Buffer.from(envelope.data,'hex'));
    });
   });
   this.pending=req;
   timer=setTimeout(()=>{fail(new Error('Speculos APDU exchange timed out.'));req.destroy();},timeout);
   req.on('error',()=>fail(new Error('Speculos APDU connection failed.')));
   req.end(body);
  }));
 }
 async close(){this.closed=true;this.pending?.destroy(new Error('Speculos transport is closed.'));this.pending=undefined;}
}

let active:SyncTransport|null=null;
export async function openTransport(){
 if(active)return active;
 const transport=new SyncTransport(emulatorUrl().origin);
 try{
  const response=await transport.send(0xe0,0x04,0,0);
  if(response.subarray(0,-2).toString()!=='Ledger Sync')throw new Error('Expected Ledger Sync app in Speculos.');
  active=transport;return transport;
 }catch(error){await transport.close();throw error;}
}
export async function closeTransport(){const transport=active;active=null;await transport?.close();}
export const withDevice=(_deviceId:string)=>(fn:any)=>{if(!active)throw new Error('Speculos Sync session not open');return fn(active);};
