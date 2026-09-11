import {beforeEach,describe,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
const state=vi.hoisted(()=>({run:{} as unknown,mutate:vi.fn()}));
vi.mock('../src/lib/store',()=>({store:{get:async()=>state.run,mutate:state.mutate}}));
vi.mock('../src/lib/http',async()=>({...await vi.importActual('../src/lib/http'),sameOrigin:()=>{},requireSession:()=> 'owner',requireOperator:()=>{}}));
import {createRun} from '../src/lib/engine';
import {POST} from '../src/app/api/runs/[id]/[action]/route';
beforeEach(()=>state.mutate.mockReset());
describe('legacy run HTTP boundary',()=>{
 it('rejects every mutation of a stored rehearsal before obtaining a store mutation lock',async()=>{
  const run={...createRun({mode:'live',repos:['vercel/next.js']}),mode:'rehearsal' as const};state.run=run;const before=JSON.stringify(run);
  for(const action of ['advance','approve','pause','shock']){const r=await POST(new NextRequest('http://localhost/api/runs/id/'+action,{method:'POST',body:'{}'}),{params:Promise.resolve({id:run.id,action})});expect(r.status).toBe(400);expect((await r.json()).error).toMatch(/read-only/);}
  expect(state.mutate).not.toHaveBeenCalled();expect(JSON.stringify(run)).toBe(before);
 });
 it('rejects artificial price shock for live runs without changing providers or run state',async()=>{
  const run=createRun({mode:'live',repos:['vercel/next.js']});state.run=run;
  const r=await POST(new NextRequest('http://localhost/api/runs/id/shock',{method:'POST',body:'{}'}),{params:Promise.resolve({id:run.id,action:'shock'})});
  expect(r.status).toBe(400);expect((await r.json()).error).toMatch(/seller/i);expect(state.mutate).not.toHaveBeenCalled();
 });
});
