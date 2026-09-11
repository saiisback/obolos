import { NextRequest,NextResponse } from 'next/server';
import { advanceRun,approveRun,pauseRun,requireLiveRun } from '@/lib/engine';
import { liveGateway } from '@/lib/gateway';
import { body,fail,ok,requireOperator,requireSession,sameOrigin } from '@/lib/http';
import { store } from '@/lib/store';
import { verifyAudit } from '@/lib/policy';
export const runtime='nodejs';export const dynamic='force-dynamic';
type Context={params:Promise<{id:string;action:string}>};
export async function POST(req:NextRequest,context:Context){try{
 sameOrigin(req);const owner=requireSession(req),{id,action}=await context.params;
 const existing=await store.get(owner,id);requireLiveRun(existing);requireOperator(req);
 if(action==='shock')throw new Error('Price changes must originate from the seller. Refresh real quotes before purchasing.');
 if(!['advance','pause','approve'].includes(action))throw new Error('Unknown run action.');
 const input=action==='approve'?await body(req):{};
 return ok(await store.mutate(owner,id,async run=>{
  if(action==='advance')return advanceRun(run,liveGateway);
  if(action==='pause')return pauseRun(run);
  if(action==='approve')return approveRun(run,input);
  throw new Error('Unknown run action.');
 }));
}catch(e){return fail(e);}}
export async function GET(req:NextRequest,context:Context){try{
 const owner=requireSession(req),{id,action}=await context.params,run=await store.get(owner,id);
 if(action!=='export')return ok(run);
 return NextResponse.json({schema:'obolos.evidence.v1',exportedAt:new Date().toISOString(),auditChainValid:verifyAudit(run.events),disclosure:run.mode==='rehearsal'?'Illustrative data and simulated payments. Not sponsor qualification evidence.':'Live mode: inspect each settled receipt and source timestamp. Configuration alone does not establish qualification.',run},{headers:{'Content-Disposition':`attachment; filename="obolos-${run.id}.json"`,'Cache-Control':'no-store'}});
}catch(e){return fail(e);}}
