import { createHash,createHmac,randomBytes,timingSafeEqual } from 'node:crypto';
import { mkdirSync,readFileSync,writeFileSync } from 'node:fs';
import { resolve,join } from 'node:path';
import { NextRequest,NextResponse } from 'next/server';
import { ZodError } from 'zod';

function secret(){
 if(process.env.SESSION_SECRET)return process.env.SESSION_SECRET;
 // Runtime private storage is mounted separately, never bundled into server output.
 const dir=resolve(/* turbopackIgnore: true */ process.env.AGENTGDP_DATA_DIR??'data/app');mkdirSync(dir,{recursive:true,mode:0o700});const file=join(dir,'session.key');
 try{return readFileSync(file,'utf8');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;const key=randomBytes(32).toString('hex');try{writeFileSync(file,key,{mode:0o600,flag:'wx'});return key;}catch{return readFileSync(file,'utf8');}}
}
function sign(value:string){return createHmac('sha256',secret()).update(value).digest('hex');}
export function equal(a:string,b:string){return timingSafeEqual(createHash('sha256').update(a).digest(),createHash('sha256').update(b).digest());}
function decode(value?:string){if(!value)return undefined;const [id,signature]=value.split('.');return id&&signature&&equal(sign(id),signature)?id:undefined;}
export function session(req:NextRequest){return decode(req.cookies.get('ag_session')?.value);}
export function requireSession(req:NextRequest){const owner=session(req);if(!owner)throw new Error('Open the dashboard to start a session.');return owner;}
export function operator(req:NextRequest){const value=decode(req.cookies.get('ag_operator')?.value);return !!process.env.OPERATOR_TOKEN&&value===createHash('sha256').update(process.env.OPERATOR_TOKEN).digest('hex');}
export function requireOperator(req:NextRequest){if(!operator(req))throw new Error('Operator authentication is required for live actions.');}
export function sameOrigin(req:NextRequest){
 const origin=req.headers.get('origin');
 // Next normalizes loopback URLs to localhost; Host retains the browser's actual authority.
 // A deployed reverse proxy must pin APP_ORIGIN to its public HTTPS origin.
 const expected=process.env.APP_ORIGIN??`${req.nextUrl.protocol}//${req.headers.get('host')??req.nextUrl.host}`;
 if(req.headers.get('sec-fetch-site')==='cross-site'||(origin&&origin!==expected))throw new Error('Cross-origin actions are not allowed.');
}
export async function body(req:NextRequest){
 const text=await req.text();if(text.length>50000)throw new Error('Request exceeds the size limit.');return JSON.parse(text);
}
export function ok<T>(data:T){return NextResponse.json({data},{headers:{'Cache-Control':'no-store'}});}
export function fail(error:unknown){const message=error instanceof ZodError?'Check the repository names and mandate values.':error instanceof SyntaxError?'Invalid JSON request.':error instanceof Error?error.message:'The operation failed.';return NextResponse.json({error:message},{status:message==='Run not found.'?404:400,headers:{'Cache-Control':'no-store'}});}
export function setSession(response:NextResponse,id=randomBytes(24).toString('hex'),name='ag_session'){
 response.cookies.set(name,`${id}.${sign(id)}`,{httpOnly:true,sameSite:'strict',secure:process.env.COOKIE_SECURE==='true',path:'/',maxAge:86400*7});return id;
}
export function operatorIdentity(){return createHash('sha256').update(process.env.OPERATOR_TOKEN??'').digest('hex');}
