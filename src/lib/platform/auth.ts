import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { isAddress, type Hex } from 'viem';
import { z } from 'zod';
import { sql } from './db';
import { appOrigin, PlatformError } from './http';
import { digestToken, makeChallenge, newToken, SESSION_SECONDS, verifyLoginSignature } from './security';

export const SESSION_COOKIE = 'obolos_session';
export const CHALLENGE_COOKIE = 'obolos_challenge';
export interface User { id: string; address: string }

export async function requireUser(req: NextRequest): Promise<User> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new PlatformError(401, 'AUTH_REQUIRED', 'Sign in with your wallet to continue.');
  const rows = await sql()`SELECT u.id, u.address FROM platform_sessions s JOIN platform_users u ON u.id=s.user_id WHERE s.token_hash=${digestToken(token)} AND s.expires_at>now()`;
  if (!rows[0]) throw new PlatformError(401, 'AUTH_REQUIRED', 'Your session has expired. Sign in again.');
  return {id: rows[0].id as string, address: rows[0].address as string};
}

export async function rateLimit(bucket: string, maximum: number, seconds: number) {
  await sql()`DELETE FROM platform_rate_limits WHERE reset_at<now()-interval '1 day'`;
  const rows = await sql()`INSERT INTO platform_rate_limits(bucket,hits,reset_at) VALUES (${digestToken(bucket)},1,now()+${seconds}*interval '1 second')
    ON CONFLICT(bucket) DO UPDATE SET hits=CASE WHEN platform_rate_limits.reset_at<=now() THEN 1 ELSE platform_rate_limits.hits+1 END,
      reset_at=CASE WHEN platform_rate_limits.reset_at<=now() THEN now()+${seconds}*interval '1 second' ELSE platform_rate_limits.reset_at END
    RETURNING hits`;
  if (Number(rows[0].hits) > maximum) throw new PlatformError(429, 'RATE_LIMITED', 'Too many requests. Wait a minute and try again.');
}

export async function issueChallenge(input: unknown) {
  const {address} = z.object({address:z.string().refine(a=>isAddress(a))}).strict().parse(input);
  await rateLimit('login-global', 300, 60);
  await rateLimit(`login:${address.toLowerCase()}`, 6, 60);
  const challenge = makeChallenge(address, appOrigin());
  const token = newToken();
  const db = sql();
  await db.transaction([
    db`DELETE FROM platform_challenges WHERE expires_at<now()-interval '1 day'`,
    db`INSERT INTO platform_challenges(token_hash,address,nonce,message,expires_at) VALUES (${digestToken(token)},${challenge.address},${challenge.nonce},${challenge.message},${challenge.expiresAt.toISOString()})`,
  ]);
  return {token, message:challenge.message};
}

export async function redeemChallenge(req: NextRequest, input: unknown) {
  const {signature} = z.object({signature:z.string().regex(/^0x[0-9a-fA-F]+$/).min(132).max(132)}).strict().parse(input);
  const token = req.cookies.get(CHALLENGE_COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new PlatformError(401, 'CHALLENGE_REQUIRED', 'Connect your wallet to request a new sign-in message.');
  const db = sql();
  const rows = await db`SELECT address,nonce,message,expires_at FROM platform_challenges WHERE token_hash=${digestToken(token)} AND used_at IS NULL AND expires_at>now()`;
  const row = rows[0];
  if (!row) throw new PlatformError(401, 'INVALID_SIGNATURE', 'The signature is invalid or expired. Request a new sign-in message.');
  // Only issued, live challenges get a limiter row. Arbitrary cookies must not
  // allocate persistent storage in this unauthenticated endpoint.
  await rateLimit(`verify:${digestToken(token)}`, 10, 60);
  if (!await verifyLoginSignature({address:row.address as string, nonce:row.nonce as string, message:row.message as string, expiresAt:new Date(row.expires_at as string)}, signature as Hex, appOrigin()))
    throw new PlatformError(401, 'INVALID_SIGNATURE', 'The signature is invalid or expired. Request a new sign-in message.');
  const sessionToken = newToken();
  // One SQL statement makes consumption, identity upsert and session creation
  // atomic. Concurrent verification of the same nonce returns only one session.
  const created = await db`WITH consumed AS (
      UPDATE platform_challenges SET used_at=now() WHERE token_hash=${digestToken(token)} AND used_at IS NULL AND expires_at>now() RETURNING address
    ), identity AS (
      INSERT INTO platform_users(id,address) SELECT ${randomUUID()}::uuid,address FROM consumed
      ON CONFLICT(address) DO UPDATE SET address=EXCLUDED.address RETURNING id,address
    ), session AS (
      INSERT INTO platform_sessions(token_hash,user_id,expires_at)
      SELECT ${digestToken(sessionToken)},id,now()+${SESSION_SECONDS}*interval '1 second' FROM identity RETURNING user_id
    ) SELECT identity.id,identity.address FROM identity JOIN session ON session.user_id=identity.id`;
  if (!created[0]) throw new PlatformError(401, 'CHALLENGE_USED', 'This sign-in message has already been used. Request a new one.');
  return {token:sessionToken, user:{id:created[0].id as string, address:created[0].address as string}};
}

export async function revokeSession(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token && /^[a-f0-9]{64}$/.test(token)) await sql()`DELETE FROM platform_sessions WHERE token_hash=${digestToken(token)}`;
}
