import { NextRequest } from 'next/server';
import { CHALLENGE_COOKIE, SESSION_COOKIE, redeemChallenge } from '@/lib/platform/auth';
import { cookieOptions, platformError, platformJson, readJson, requireOrigin } from '@/lib/platform/http';
import { SESSION_SECONDS } from '@/lib/platform/security';
export async function POST(req: NextRequest) {
  try {
    requireOrigin(req);
    const result = await redeemChallenge(req, await readJson(req));
    const response = platformJson({user:result.user});
    response.cookies.set(SESSION_COOKIE,result.token,cookieOptions(SESSION_SECONDS));
    response.cookies.set(CHALLENGE_COOKIE,'',cookieOptions(0));
    return response;
  } catch (error) { return platformError(error); }
}
