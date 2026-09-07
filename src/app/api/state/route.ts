import { NextRequest } from 'next/server';
import { brokerHealth } from '@/lib/gateway';
import { ok,fail,session,setSession,operator } from '@/lib/http';
import { store } from '@/lib/store';
import type { DashboardState } from '@/lib/contracts';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(req:NextRequest){try{
 const owner=session(req),health=await brokerHealth();
 const liveEnabled=health.ready&&!!process.env.OPERATOR_TOKEN&&/^0x[0-9a-fA-F]{40}$/.test(process.env.LEDGER_CONTROLLER_ADDRESS??'');
 const data:DashboardState={runs:owner?await store.list(owner):[],integrations:health.integrations,liveEnabled,operatorAuthenticated:operator(req)};
 const response=ok(data);if(!owner)setSession(response);return response;
}catch(e){return fail(e);}}
