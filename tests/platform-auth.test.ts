import { describe, expect, it } from 'vitest';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { makeChallenge, verifyLoginSignature, digestToken } from '../src/lib/platform/security';

describe('wallet identity signatures', () => {
  const account = privateKeyToAccount(generatePrivateKey());
  const now = new Date('2026-09-09T00:00:00Z');
  const origin = 'https://obolos.app';
  it('accepts the exact domain-bound identity message signed by its wallet', async () => {
    const challenge = makeChallenge(account.address, origin, now);
    const signature = await account.signMessage({ message: challenge.message });
    expect(await verifyLoginSignature(challenge, signature, origin, now)).toBe(true);
    expect(challenge.message).toContain('This does not authorize payments');
  });
  it('rejects a signature from another wallet', async () => {
    const challenge = makeChallenge(account.address, origin, now);
    const other = privateKeyToAccount(generatePrivateKey());
    expect(await verifyLoginSignature(challenge, await other.signMessage({message: challenge.message}), origin, now)).toBe(false);
  });
  it('rejects wrong domain and expired challenges', async () => {
    const challenge = makeChallenge(account.address, origin, now);
    const signature = await account.signMessage({message: challenge.message});
    expect(await verifyLoginSignature(challenge, signature, 'https://attacker.example', now)).toBe(false);
    expect(await verifyLoginSignature(challenge, signature, origin, new Date(now.getTime() + 300001))).toBe(false);
  });
  it('does not accept future-issued messages or changes to the bound address', async () => {
    const challenge = makeChallenge(account.address, origin, now);
    const signature = await account.signMessage({message: challenge.message});
    expect(await verifyLoginSignature(challenge, signature, origin, new Date(now.getTime() - 1000))).toBe(false);
    const other = privateKeyToAccount(generatePrivateKey());
    expect(await verifyLoginSignature({...challenge, address:other.address}, signature, origin, now)).toBe(false);
  });
  it('uses random challenges and never stores bearer tokens as their digest', () => {
    const a = makeChallenge(account.address, origin, now);
    const b = makeChallenge(account.address, origin, now);
    expect(a.nonce).not.toBe(b.nonce);
    expect(digestToken('secret')).not.toContain('secret');
    expect(digestToken('secret')).toHaveLength(64);
  });
});
