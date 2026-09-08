import { NextRequest } from 'next/server';
import { CHALLENGE_COOKIE, issueChallenge } from '@/lib/platform/auth';
import { cookieOptions, platformError, platformJson, readJson, requireOrigin } from '@/lib/platform/http';
import { CHALLENGE_SECONDS } from '@/lib/platform/security';
export async function POST(req: NextRequest) {
  try {
    requireOrigin(req);
    const result = await issueChallenge(await readJson(req));
    const response = platformJson({message:result.message});
    response.cookies.set(CHALLENGE_COOKIE, result.token, cookieOptions(CHALLENGE_SECONDS));
    return response;
  } catch (error) { return platformError(error); }
}
