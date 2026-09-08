import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';

export class PlatformError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export function platformJson(value: unknown, status = 200) {
  return NextResponse.json(value, {status, headers: {'Cache-Control': 'private, no-store', 'Vary': 'Cookie, Authorization', 'X-Content-Type-Options': 'nosniff'}});
}
export function platformError(error: unknown) {
  if (error instanceof PlatformError) return platformJson({error:error.message, code:error.code}, error.status);
  if (error instanceof ZodError || error instanceof SyntaxError) return platformJson({error:'Check the request fields and try again.', code:'INVALID_REQUEST'}, 400);
  // Database errors can include connection strings or SQL parameters. Do not
  // send or log raw exceptions from authentication and credential operations.
  return platformJson({error:'The workspace service is unavailable. Please try again shortly.', code:'SERVICE_UNAVAILABLE'}, 503);
}
export function appOrigin() {
  const value = process.env.APP_ORIGIN;
  if (!value && process.env.NODE_ENV === 'production') throw new PlatformError(503, 'CONFIGURATION_REQUIRED', 'The public application origin is not configured.');
  const url = new URL(value || 'http://localhost:3000');
  if (url.pathname !== '/' || url.search || url.hash || url.username || url.password ||
      !['http:', 'https:'].includes(url.protocol)) throw new PlatformError(503, 'CONFIGURATION_REQUIRED', 'The public application origin is invalid.');
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') throw new PlatformError(503, 'CONFIGURATION_REQUIRED', 'Production wallet login requires HTTPS.');
  return url.origin;
}
export function requireOrigin(req: NextRequest) {
  if (req.headers.get('origin') !== appOrigin() || req.headers.get('sec-fetch-site') === 'cross-site')
    throw new PlatformError(403, 'INVALID_ORIGIN', 'This action must start from your Obolos workspace.');
}
export async function readJson(req: NextRequest): Promise<unknown> {
  if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new PlatformError(415, 'JSON_REQUIRED', 'Send application/json.');
  const limit = 16384;
  if (Number(req.headers.get('content-length') || '0') > limit) throw new PlatformError(413, 'REQUEST_TOO_LARGE', 'The request is too large.');
  const reader = req.body?.getReader();
  if (!reader) throw new PlatformError(400, 'INVALID_REQUEST', 'A JSON body is required.');
  let length = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const {value, done} = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) { await reader.cancel(); throw new PlatformError(413, 'REQUEST_TOO_LARGE', 'The request is too large.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export function cookieOptions(maxAge: number) {
  return {httpOnly: true, secure: appOrigin().startsWith('https:'), sameSite: 'lax' as const, path: '/', maxAge};
}
