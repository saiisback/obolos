import {NextRequest} from 'next/server';
import {runExampleProvider,type ProviderReceipt} from '@/lib/market/example-provider';
import {appOrigin,PlatformError,platformError,platformJson,readJson} from '@/lib/platform/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:NextRequest) {
  try {
    const serviceId=process.env.EXAMPLE_VERIFIER_SERVICE_ID,recipient=process.env.EXAMPLE_VERIFIER_RECIPIENT;
    if(!serviceId || !/^[a-f\d-]{36}$/i.test(serviceId) || !recipient || !/^0x[a-f\d]{40}$/i.test(recipient))throw new PlatformError(503,'PROVIDER_NOT_CONFIGURED','The example provider requires its own service ID and payout recipient.');
    const result=await runExampleProvider(await readJson(request,128*1024),async id=>{
      const response=await fetch(`${appOrigin()}/api/market/orders/${id}/receipt`,{signal:AbortSignal.timeout(6000),redirect:'error',cache:'no-store'});
      if(!response.ok)throw new PlatformError(403,'PAID_REQUEST_REQUIRED','A confirmed payment receipt is required.');
      return ((await response.json()) as {receipt:ProviderReceipt}).receipt;
    },{serviceId,recipient});
    return platformJson(result);
  }catch(error){return platformError(error);}
}
