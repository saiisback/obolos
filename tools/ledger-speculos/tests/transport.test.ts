import { afterEach, expect, test } from 'bun:test';
import { createServer, type RequestListener, type Server } from 'node:http';
import { SyncTransport, closeTransport, emulatorUrl, openTransport } from '../src/device/speculos';
const servers:Server[]=[];
const originalUrl=process.env.OBOLOS_SPECULOS_SYNC_URL;
afterEach(async()=>{await closeTransport();if(originalUrl===undefined)delete process.env.OBOLOS_SPECULOS_SYNC_URL;else process.env.OBOLOS_SPECULOS_SYNC_URL=originalUrl;await Promise.all(servers.splice(0).map(server=>new Promise<void>(resolve=>{server.closeAllConnections();server.close(()=>resolve());})));});
async function endpoint(handler:RequestListener){const server=createServer(handler);servers.push(server);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw Error('No listener');return `http://127.0.0.1:${address.port}`;}

test('canonicalizes localhost and refuses credentials, remote, path and normalized path tricks',()=>{
 for(const url of ['http://evil.example','https://127.0.0.1:5001','http://u:p@127.0.0.1:5001','http://127.0.0.1:5001/a','http://127.0.0.1:5001/../','http://127.0.0.1:5001?x=1','http://127.0.0.1:5001#x']){process.env.OBOLOS_SPECULOS_SYNC_URL=url;expect(emulatorUrl).toThrow();}
 process.env.OBOLOS_SPECULOS_SYNC_URL='http://localhost:5001';expect(emulatorUrl().hostname).toBe('127.0.0.1');
});
test('posts exact APDU bytes and preserves response and device failure status',async()=>{
 const url=await endpoint(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;if(req.url!=='/apdu'||req.method!=='POST'||JSON.parse(body).data!=='e004000000'){res.writeHead(400).end();return;}res.end('{"data":"4c65646765722053796e639000"}');});
 const transport=new SyncTransport(url);expect((await transport.send(0xe0,4,0,0)).subarray(0,-2).toString()).toBe('Ledger Sync');await transport.close();await expect(transport.send(0xe0,4,0,0)).rejects.toThrow('closed');
 const refusal=await endpoint((_req,res)=>res.end('{"data":"6985"}'));await expect(new SyncTransport(refusal).send(0xe0,4,0,0)).rejects.toMatchObject({statusCode:0x6985});
});
test('never follows redirects to another origin',async()=>{
 let targetRequests=0;const target=await endpoint((_req,res)=>{targetRequests++;res.end('{"data":"9000"}');});const url=await endpoint((_req,res)=>res.writeHead(302,{location:target}).end());
 await expect(new SyncTransport(url).send(0xe0,4,0,0)).rejects.toThrow();expect(targetRequests).toBe(0);
});
test('rejects malformed envelopes and HTTP errors without reflecting their contents',async()=>{
 for(const body of ['{"error":"PRIVATE-MARKER"}','{"data":"z9000"}','{"data":"9"}','{"data":null}','not-json']){const url=await endpoint((_req,res)=>res.end(body));try{await new SyncTransport(url).send(0xe0,4,0,0);throw Error('Unexpected success');}catch(error){expect((error as Error).message).not.toContain('PRIVATE-MARKER');expect((error as Error).message).not.toBe('Unexpected success');}}
 const url=await endpoint((_req,res)=>res.writeHead(500).end('PRIVATE-MARKER'));await expect(new SyncTransport(url).send(0xe0,4,0,0)).rejects.toThrow('HTTP');
});
test('bounds responses and times out even after headers arrive',async()=>{
 const large=await endpoint((_req,res)=>{res.write('{"data":"');res.end('a'.repeat(70_000));});await expect(new SyncTransport(large).send(0xe0,4,0,0)).rejects.toThrow('large');
 const hanging=await endpoint((_req,res)=>{res.writeHead(200);res.write('');});const transport=new SyncTransport(hanging);transport.setExchangeTimeout(25);await expect(transport.send(0xe0,4,0,0)).rejects.toThrow(/timeout|timed out|aborted/i);
});
test('validates Sync app identity without reflecting emulator response bytes',async()=>{
 process.env.OBOLOS_SPECULOS_SYNC_URL=await endpoint((_req,res)=>res.end(JSON.stringify({data:Buffer.concat([Buffer.from('PRIVATE-MARKER'),Buffer.from('9000','hex')]).toString('hex')})));
 await expect(openTransport()).rejects.toThrow('Expected Ledger Sync');
 try{await openTransport();}catch(error){expect((error as Error).message).not.toContain('PRIVATE-MARKER');}
});
