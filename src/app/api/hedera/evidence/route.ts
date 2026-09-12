import {hederaPublicConfig} from '@/lib/platform/hedera-commerce';
import {publicHederaEvidence} from '@/lib/hedera/public-evidence';
export const runtime='nodejs';
const headers={'Cache-Control':'no-store'};
/** Four public config rows only. This endpoint neither signs nor initiates a payment. */
export async function GET() {
 try{
  const [hts,identityService,identityBuyer,release]=await Promise.all(['hts','identity-service','identity-buyer','release'].map(id=>hederaPublicConfig(id as 'hts'|'identity-service'|'identity-buyer'|'release')));
  return Response.json(publicHederaEvidence({hts,identityService,identityBuyer,release}),{headers});
 }catch{return Response.json({error:'Public Hedera evidence is temporarily unavailable.'},{status:503,headers});}
}
