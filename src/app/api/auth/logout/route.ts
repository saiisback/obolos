import { NextRequest } from 'next/server';
import { CHALLENGE_COOKIE, SESSION_COOKIE, revokeSession } from '@/lib/platform/auth';
import { cookieOptions, platformError, platformJson, requireOrigin } from '@/lib/platform/http';
export async function POST(req: NextRequest) {
  try {
    requireOrigin(req);
    await revokeSession(req);
    const response = platformJson({ok:true});
    response.cookies.set(SESSION_COOKIE,'',cookieOptions(0));
    response.cookies.set(CHALLENGE_COOKIE,'',cookieOptions(0));
    return response;
  } catch (error) { return platformError(error); }
}
