import { NextRequest } from 'next/server';
import { createRun } from '@/lib/engine';
import { brokerHealth } from '@/lib/gateway';
import { body,fail,ok,requireOperator,requireSession,sameOrigin } from '@/lib/http';
import { store } from '@/lib/store';
export async function POST(req:NextRequest){try{
 sameOrigin(req);const owner=requireSession(req),input=await body(req);
 if(input.mode==='live'){requireOperator(req);if(!/^0x[0-9a-fA-F]{40}$/.test(process.env.LEDGER_CONTROLLER_ADDRESS??''))throw new Error('Pin the Ledger controller address before a live run.');if(!(await brokerHealth()).ready)throw new Error('Live integrations are not ready. Complete the connection checklist.');}
 const run=createRun(input);return ok(await store.insert(owner,run));
}catch(e){return fail(e);}}
