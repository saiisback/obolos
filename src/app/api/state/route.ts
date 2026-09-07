import { NextRequest } from 'next/server';
import { brokerHealth } from '@/lib/gateway';
import { ok,fail,session,setSession,operator } from '@/lib/http';
import { store } from '@/lib/store';
import type { DashboardState } from '@/lib/contracts';
import { liveConfiguration } from '@/lib/live-readiness';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(req:NextRequest){try{
 const owner=session(req),health=await brokerHealth();
 const liveEnabled=health.ready&&liveConfiguration(process.env);
 const data:DashboardState={runs:owner?await store.list(owner):[],integrations:health.integrations,liveEnabled,operatorAuthenticated:operator(req),priceControlsEnabled:operator(req)&&!!process.env.DATA_SERVICE_OPERATOR_TOKEN};
 const response=ok(data);if(!owner)setSession(response);return response;
}catch(e){return fail(e);}}
