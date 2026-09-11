import {NextRequest} from 'next/server';
import {requireUser} from '@/lib/platform/auth';
import {listOwnedEconomyPurchases} from '@/lib/platform/economy-purchases';
import {platformError, platformJson} from '@/lib/platform/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    return platformJson(await listOwnedEconomyPurchases(user.id));
  } catch (error) {return platformError(error);}
}
