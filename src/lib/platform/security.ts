import { createHash, randomBytes } from 'node:crypto';
import { getAddress, verifyMessage, type Hex } from 'viem';
import { createSiweMessage, parseSiweMessage, validateSiweMessage } from 'viem/siwe';

export const LOGIN_CHAIN_ID = 5042002;
export const CHALLENGE_SECONDS = 300;
export const SESSION_SECONDS = 7 * 86400;
export function digestToken(token: string) { return createHash('sha256').update(token).digest('hex'); }
export function newToken() { return randomBytes(32).toString('hex'); }
export interface LoginChallenge { address: string; nonce: string; message: string; expiresAt: Date }

export function makeChallenge(address: string, origin: string, now = new Date()): LoginChallenge {
  const wallet = getAddress(address);
  const site = new URL(origin);
  const nonce = newToken();
  const expiresAt = new Date(now.getTime() + CHALLENGE_SECONDS * 1000);
  return {
    address: wallet.toLowerCase(), nonce, expiresAt,
    message: createSiweMessage({
      address: wallet, chainId: LOGIN_CHAIN_ID, domain: site.host, uri: site.origin,
      version: '1', nonce, issuedAt: now, expirationTime: expiresAt,
      statement: 'Sign in to your Obolos testnet workspace. This does not authorize payments or grant spending permissions.',
    }),
  };
}

// The first release supports EOA identity wallets. Contract wallet verification
// needs chain-specific ERC-1271 validation and must not be treated as EOA recovery.
export async function verifyLoginSignature(challenge: LoginChallenge, signature: Hex, origin: string, now = new Date()) {
  try {
    const parsed = parseSiweMessage(challenge.message);
    if (challenge.expiresAt.getTime() <= now.getTime() || !parsed.issuedAt || parsed.issuedAt > now ||
        parsed.uri !== new URL(origin).origin || parsed.chainId !== LOGIN_CHAIN_ID ||
        parsed.expirationTime?.getTime() !== challenge.expiresAt.getTime()) return false;
    if (!validateSiweMessage({message: parsed, address: getAddress(challenge.address), domain: new URL(origin).host, nonce: challenge.nonce, time: now})) return false;
    return await verifyMessage({address: getAddress(challenge.address), message: challenge.message, signature});
  } catch { return false; }
}
