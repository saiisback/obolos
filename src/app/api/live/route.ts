import { NextRequest } from 'next/server';
import { brokerHealth, brokerRequest } from '@/lib/gateway';
import { fail, ok, operator, requireSession } from '@/lib/http';
import { brokerWalletsSchema } from '@/lib/live-contracts';
import { buildLiveOverview, safeServiceUrl } from '@/lib/live-readiness';
import { store } from '@/lib/store';

export const runtime='nodejs';
export const dynamic='force-dynamic';
async function inspectService(url:string|null):Promise<boolean> {
  if(!url)return false;
  try {
    const response=await fetch(`${url}/health`,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(8000)});
    if(!response.ok)return false;
    const result=await response.json();
    return result.ready===true&&result.network==='hedera:testnet'&&result.facilitator==='https://api.testnet.blocky402.com';
  }catch{return false;}
}
export async function GET(req:NextRequest) {
  try {
    const owner=requireSession(req),authenticated=operator(req);
    const [health,runs,wallets,serviceReachable]=await Promise.all([
      brokerHealth(),store.list(owner),
      authenticated?brokerRequest('/wallets').then(value=>brokerWalletsSchema.parse(value)).catch(()=>undefined):Promise.resolve(undefined),
      authenticated?inspectService(safeServiceUrl(process.env.DATA_SERVICE_URL)):Promise.resolve(false),
    ]);
    return ok(buildLiveOverview({authenticated,env:process.env,runs,health,wallets,serviceReachable}));
  }catch(error){return fail(error);}
}
