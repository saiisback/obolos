import { NextRequest } from 'next/server';
import { requireUser, SESSION_COOKIE } from '@/lib/platform/auth';
import { databaseConfigured } from '@/lib/platform/db';
import { PlatformError, platformError, platformJson } from '@/lib/platform/http';
export async function GET(req: NextRequest) {
  try {
    const configured = databaseConfigured();
    if (!configured || !req.cookies.get(SESSION_COOKIE)) return platformJson({user:null, configured});
    return platformJson({user:await requireUser(req), configured});
  } catch (error) {
    if (error instanceof PlatformError && error.status === 401) return platformJson({user:null, configured:true});
    return platformError(error);
  }
}
