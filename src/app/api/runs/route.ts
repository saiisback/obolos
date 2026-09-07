import { NextRequest } from 'next/server';
import { createRun } from '@/lib/engine';
import { brokerHealth } from '@/lib/gateway';
import { body,fail,ok,requireOperator,requireSession,sameOrigin } from '@/lib/http';
import { store } from '@/lib/store';
import { liveConfiguration } from '@/lib/live-readiness';
export async function POST(req:NextRequest){try{
 sameOrigin(req);const owner=requireSession(req),input=await body(req);
 if(input.mode==='live'){requireOperator(req);if(!liveConfiguration(process.env))throw new Error('Configure the operator, pinned Ledger controller and data service URL before a live run.');if(!(await brokerHealth()).ready)throw new Error('Live integrations are not ready. Complete the connection checklist.');}
 const run=createRun(input);return ok(await store.insert(owner,run));
}catch(e){return fail(e);}}
