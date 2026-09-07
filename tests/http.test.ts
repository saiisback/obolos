import {describe,it,expect} from 'vitest';
import {NextRequest,NextResponse} from 'next/server';
import {sameOrigin,session,setSession,operator,operatorIdentity} from '../src/lib/http';
describe('web authorization boundary',()=>{
 it('uses the browser-facing host when Next normalizes loopback to localhost',()=>{
  expect(()=>sameOrigin(new NextRequest('http://localhost:3000/api/runs',{headers:{origin:'http://127.0.0.1:3000',host:'127.0.0.1:3000','sec-fetch-site':'same-origin'}}))).not.toThrow();
  expect(()=>sameOrigin(new NextRequest('http://localhost:3000/api/runs',{headers:{origin:'http://evil.test',host:'127.0.0.1:3000'}}))).toThrow('Cross-origin');
 });
 it('rejects cross-origin mutations',()=>{
  expect(()=>sameOrigin(new NextRequest('https://app.test/api/runs',{headers:{origin:'https://evil.test'}}))).toThrow('Cross-origin');
  expect(()=>sameOrigin(new NextRequest('https://app.test/api/runs',{headers:{origin:'https://app.test'}}))).not.toThrow();
 });
 it('pins a configured public origin and rejects cross-site fetch metadata',()=>{
  process.env.APP_ORIGIN='https://public.test';try{
   expect(()=>sameOrigin(new NextRequest('http://localhost:3000/api/runs',{headers:{origin:'https://public.test',host:'localhost:3000'}}))).not.toThrow();
   expect(()=>sameOrigin(new NextRequest('http://localhost:3000/api/runs',{headers:{origin:'http://localhost:3000',host:'localhost:3000'}}))).toThrow('Cross-origin');
   expect(()=>sameOrigin(new NextRequest('https://public.test/api/runs',{headers:{origin:'https://public.test','sec-fetch-site':'cross-site'}}))).toThrow('Cross-origin');
  }finally{delete process.env.APP_ORIGIN;}
 });
 it('rejects a tampered session cookie',()=>{
  const response=NextResponse.json({});setSession(response,'alice');const cookie=response.cookies.get('ag_session')!.value;
  expect(session(new NextRequest('http://localhost',{headers:{cookie:`ag_session=${cookie}`}}))).toBe('alice');
  expect(session(new NextRequest('http://localhost',{headers:{cookie:`ag_session=${cookie.replace('alice','bob')}`}}))).toBeUndefined();
 });
 it('invalidates operator sessions when the operator token changes',()=>{
  process.env.OPERATOR_TOKEN='test-operator-1';try{
   const response=NextResponse.json({});setSession(response,operatorIdentity(),'ag_operator');const req=new NextRequest('http://localhost',{headers:{cookie:`ag_operator=${response.cookies.get('ag_operator')!.value}`}});
   expect(operator(req)).toBe(true);process.env.OPERATOR_TOKEN='test-operator-2';expect(operator(req)).toBe(false);
  }finally{delete process.env.OPERATOR_TOKEN;}
 });
});
