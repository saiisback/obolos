import { NextRequest,NextResponse } from 'next/server';
import { advanceRun,applyShock,approveRun,pauseRun } from '@/lib/engine';
import { liveGateway,rehearsalGateway } from '@/lib/gateway';
import { body,fail,ok,requireOperator,requireSession,sameOrigin } from '@/lib/http';
import { store } from '@/lib/store';
import { verifyAudit } from '@/lib/policy';
export const runtime='nodejs';export const dynamic='force-dynamic';
type Context={params:Promise<{id:string;action:string}>};
export async function POST(req:NextRequest,context:Context){try{
 sameOrigin(req);const owner=requireSession(req),{id,action}=await context.params;
 const existing=await store.get(owner,id);if(existing.mode==='live')requireOperator(req);
 const input=action==='approve'?await body(req):{};
 return ok(await store.mutate(owner,id,async run=>{
  if(action==='advance')return advanceRun(run,run.mode==='live'?liveGateway:rehearsalGateway);
  if(action==='pause')return pauseRun(run);
  if(action==='approve')return approveRun(run,input);
  if(action==='shock'){
   if(run.mode==='live'){
    if(!['mandate','discovery','purchase'].includes(run.stage)||['completed','failed','awaiting_approval'].includes(run.status))throw new Error('Apply the price change before the data purchase.');
    const endpoint=process.env.DATA_SERVICE_URL,token=process.env.DATA_SERVICE_OPERATOR_TOKEN;
    if(!endpoint||!token)throw new Error('Provider price controls are not configured.');
    const providers=await liveGateway.discover();
    for(const [i,p] of providers.entries()){
     const response=await fetch(`${endpoint.replace(/\/$/,'')}/operator/prices`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({providerId:p.id,unitPriceAtomic:400000+i*50000}),signal:AbortSignal.timeout(10000)});
     if(!response.ok)throw new Error('The provider rejected a price update. Rediscover quotes before proceeding.');
    }
   }
   return applyShock(run);
  }
  throw new Error('Unknown run action.');
 }));
}catch(e){return fail(e);}}
export async function GET(req:NextRequest,context:Context){try{
 const owner=requireSession(req),{id,action}=await context.params,run=await store.get(owner,id);
 if(action!=='export')return ok(run);
 return NextResponse.json({schema:'agentgdp.evidence.v1',exportedAt:new Date().toISOString(),auditChainValid:verifyAudit(run.events),disclosure:run.mode==='rehearsal'?'Illustrative data and simulated payments. Not sponsor qualification evidence.':'Live mode: inspect each settled receipt and source timestamp. Configuration alone does not establish qualification.',run},{headers:{'Content-Disposition':`attachment; filename="agentgdp-${run.id}.json"`,'Cache-Control':'no-store'}});
}catch(e){return fail(e);}}
