import {afterEach,describe,expect,it,vi} from 'vitest';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import type {IncomingMessage,ClientRequest} from 'node:http';
import type {RequestOptions} from 'node:https';
import {isPublicVerifierAddress,requestRemoteVerification,validateRemoteVerifierUrl,type RemoteVerifierDependencies} from '../src/lib/market/remote-verifier';
import type {Report} from '../src/lib/contracts';
const id='11111111-1111-4111-8111-111111111111';
const now='2026-09-10T10:00:00.000Z';
const input={endpoint:'https://verify.obolos.app/v1/check',idempotencyKey:`order:${id}`,order:{id,serviceId:id,revision:1,recipient:`0x${'1'.repeat(40)}`,amountAtomic:1000,transactionHash:`0x${'a'.repeat(64)}`,reportDigest:'b'.repeat(64),receiptUrl:`https://obolos.app/api/market/orders/${id}/receipt`},report:{title:'Report',summary:'Evidence summary',recommendation:'Compare',generatedBy:'model',createdAt:now,checks:[],verified:false,evidence:[{repo:'openai/codex',description:'Code',stars:1,forks:2,openIssues:3,pushedAt:now,language:'TypeScript',license:'MIT',sourceUrl:'https://api.github.com/repos/openai/codex',fetchedAt:now}]} as Report};
const valid={checks:[{label:'Evidence match',passed:true,detail:'All purchased metrics match.'}]};
function harness(options:{status?:number;contentType?:string;body?:unknown;raw?:string;chunks?:Buffer[];stall?:boolean}={}) {
 let captured:RequestOptions={},sent='';
 const response=new PassThrough() as unknown as IncomingMessage;
 response.statusCode=options.status??200;response.headers={'content-type':options.contentType??'application/json; charset=utf-8'};
 const req=new EventEmitter() as ClientRequest;
 req.destroy=vi.fn(()=>req);req.end=vi.fn((body:string)=>{
  sent=body;
  queueMicrotask(()=>{callback(response);if(!options.stall&&!response.destroyed){if(options.chunks){for(const chunk of options.chunks)response.emit('data',chunk);response.emit('end');}else response.emit('data',Buffer.from(options.raw??JSON.stringify(options.body??valid))),response.emit('end');}});
  return req;
 }) as unknown as ClientRequest['end'];
 let callback:(response:IncomingMessage)=>void;
 const request=vi.fn((config:RequestOptions,cb:(response:IncomingMessage)=>void)=>{captured=config;callback=cb;return req;}) as unknown as RemoteVerifierDependencies['request'];
 const resolve=vi.fn(async()=>[{address:'8.8.8.8',family:4}]);
 return {deps:{resolve,request},get captured(){return captured;},get sent(){return sent;},req};
}
afterEach(()=>vi.useRealTimers());
describe('public verifier destination restrictions',()=>{
 it.each(['http://public.site/v1','https://user:pass@public.site/v1','https://public.site/v1?token=secret','https://public.site/v1?','https://public.site/v1#','https://public.site:444/v1','https://127.0.0.1/','https://2130706433/','https://0x7f000001/','https://[::ffff:127.0.0.1]/','https://localhost/','https://admin.local/','https://metadata.internal/','https://public.site./',' https://public.site/'])('blocks unsafe URL %s',value=>{expect(()=>validateRemoteVerifierUrl(value)).toThrow();});
 it('accepts an exact public HTTPS path and default port',()=>{expect(validateRemoteVerifierUrl('https://verify.obolos.app:443/v1/check').href).toBe('https://verify.obolos.app/v1/check');});
 it.each(['127.0.0.1','10.0.0.1','172.16.0.1','192.168.0.1','169.254.169.254','100.64.0.1','0.0.0.0','198.18.0.1','192.0.2.1','203.0.113.1','224.0.0.1','240.0.0.1','::1','::ffff:8.8.8.8','::ffff:127.0.0.1','fe80::1','fc00::1','2001:db8::1','2002:7f00:1::','64:ff9b::7f00:1','100::1','3fff::1','bad'])('blocks unsafe DNS address %s',value=>{expect(isPublicVerifierAddress(value)).toBe(false);});
 it.each(['8.8.8.8','1.1.1.1','2606:4700:4700::1111','2001:4860:4860::8888'])('accepts public address %s',value=>expect(isPublicVerifierAddress(value)).toBe(true));
 it('rejects mixed public/private DNS answers before opening a connection',async()=>{const h=harness();h.deps.resolve.mockResolvedValue([{address:'8.8.8.8',family:4},{address:'::ffff:127.0.0.1',family:6}]);await expect(requestRemoteVerification(input,h.deps)).rejects.toMatchObject({code:'VERIFIER_ADDRESS_BLOCKED'});expect(h.deps.request).not.toHaveBeenCalled();});
});
it('pins the checked IP while retaining TLS hostname and exact payload/idempotency',async()=>{
 const h=harness();expect(await requestRemoteVerification(input,h.deps)).toEqual(valid);
 expect(JSON.parse(h.sent)).toEqual({protocol:'obolos.verifier.v1',order:input.order,report:input.report});
 expect(h.captured).toMatchObject({hostname:'verify.obolos.app',servername:'verify.obolos.app',path:'/v1/check',port:443,method:'POST',agent:false,rejectUnauthorized:true});
 expect(h.captured.headers).toEqual({'content-type':'application/json',accept:'application/json','content-length':Buffer.byteLength(h.sent),'idempotency-key':input.idempotencyKey});
 const lookup=h.captured.lookup as unknown as (host:string,opts:{all?:boolean},cb:ReturnType<typeof vi.fn>)=>void;
 const cb=vi.fn();lookup('another-rebinding-name',{all:false},cb);expect(cb).toHaveBeenCalledWith(null,'8.8.8.8',4);
 const all=vi.fn();lookup('another-rebinding-name',{all:true},all);expect(all).toHaveBeenCalledWith(null,[{address:'8.8.8.8',family:4}]);
 expect(h.deps.resolve).toHaveBeenCalledTimes(1);
});
it.each([301,302,307,308,401,500])('rejects status %s without following or retrying',async status=>{const h=harness({status});await expect(requestRemoteVerification(input,h.deps)).rejects.toMatchObject({code:'VERIFIER_HTTP_ERROR'});expect(h.deps.request).toHaveBeenCalledTimes(1);});
it.each([{contentType:'text/html'}, {raw:'not JSON'}, {body:{checks:[]}}, {body:{checks:[{label:'x',passed:'yes',detail:'x'}]}}, {body:{checks:[{label:'x'.repeat(201),passed:true,detail:''}]}}, {body:{checks:[{label:'x',passed:true,detail:'x'.repeat(1001)}]}}, {body:{checks:Array(51).fill(valid.checks[0])}}, {body:{...valid,secret:'unexpected'}}])('rejects invalid response %#',async options=>{const h=harness(options);await expect(requestRemoteVerification(input,h.deps)).rejects.toMatchObject({code:'VERIFIER_INVALID_RESPONSE'});});
it('caps streamed bytes even without Content-Length',async()=>{const h=harness({chunks:[Buffer.alloc(64000),Buffer.alloc(70000)]});await expect(requestRemoteVerification(input,h.deps)).rejects.toMatchObject({code:'VERIFIER_RESPONSE_TOO_LARGE'});expect(h.req.destroy).toHaveBeenCalled();});
it('bounds stalled responses and aborts the request signal',async()=>{vi.useFakeTimers();const h=harness({stall:true});const task=requestRemoteVerification(input,h.deps);const assertion=expect(task).rejects.toMatchObject({code:'VERIFIER_TIMEOUT'});await vi.advanceTimersByTimeAsync(12000);await assertion;expect(h.captured.signal?.aborted).toBe(true);});
it('bounds stalled DNS and never opens a connection after the deadline',async()=>{vi.useFakeTimers();const h=harness();let finish:(value:{address:string;family:number}[])=>void;h.deps.resolve.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));const task=requestRemoteVerification(input,h.deps);const assertion=expect(task).rejects.toMatchObject({code:'VERIFIER_TIMEOUT'});await vi.advanceTimersByTimeAsync(12000);await assertion;finish!([{address:'8.8.8.8',family:4}]);await Promise.resolve();expect(h.deps.request).not.toHaveBeenCalled();});
it('does not forward credential-shaped or extra order properties',async()=>{const h=harness();await expect(requestRemoteVerification({...input,order:{...input.order,apiKey:'do-not-send'} as typeof input.order},h.deps)).rejects.toThrow();expect(h.deps.request).not.toHaveBeenCalled();});
