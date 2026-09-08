import Transport from '@ledgerhq/hw-transport';

/** Emulator access is an explicit local development mode, never a USB fallback. */
export function speculosOrigin(value: string): string {
  if (!/^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(?::([1-9]\d{0,4}))?\/?$/.test(value)) {
    throw Error('Speculos URL must be a loopback HTTP origin without credentials, path, query, or fragment.');
  }
  const url = new URL(value);
  if (url.hostname === 'localhost') url.hostname = '127.0.0.1';
  return url.origin;
}

export function signerConfiguration(env: Record<string, string | undefined>): { mode: 'usb' } | { mode: 'speculos'; url: string } {
  const mode = env.LEDGER_SIGNER_MODE || 'usb';
  if (mode === 'usb') return { mode };
  if (mode !== 'speculos') throw Error('LEDGER_SIGNER_MODE must be usb or speculos.');
  return { mode, url: speculosOrigin(env.LEDGER_SPECULOS_URL || 'http://127.0.0.1:5002') };
}

/** Real Speculos REST APDU exchange; user confirmation remains in the emulator UI. */
export class SpeculosTransport extends Transport {
  private readonly endpoint: string;
  private closed = false;
  private active?: AbortController;

  constructor(origin: string) {
    super();
    this.endpoint = `${speculosOrigin(origin)}/apdu`;
    this.setExchangeTimeout(120_000);
  }

  async exchange(apdu: Buffer, { abortTimeoutMs }: { abortTimeoutMs?: number } = {}): Promise<Buffer> {
    if (this.closed) throw Error('Speculos transport is closed.');
    if (apdu.length < 4 || apdu.length > 260) throw Error('Invalid APDU size.');
    return this.exchangeAtomicImpl(async () => {
      const controller = new AbortController();
      this.active = controller;
      const timeout = abortTimeoutMs ?? this.exchangeTimeout;
      if (!Number.isFinite(timeout) || timeout <= 0) throw Error('Invalid Speculos exchange timeout.');
      const timer = setTimeout(() => controller.abort(new Error('Speculos APDU exchange timed out.')), timeout);
      try {
        const response = await fetch(this.endpoint, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: apdu.toString('hex') }),
          redirect: 'error', signal: controller.signal,
        });
        if (!response.ok || !response.body) throw Error(`Speculos APDU HTTP error (${response.status}).`);
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > 65_536) {
              await reader.cancel();
              throw Error('Speculos APDU response is too large.');
            }
            chunks.push(value);
          }
        } finally { reader.releaseLock(); }
        let envelope: unknown;
        try { envelope = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
        catch { throw Error('Invalid Speculos APDU response JSON.'); }
        if (!envelope || typeof envelope !== 'object' || 'error' in envelope || !('data' in envelope) ||
            typeof envelope.data !== 'string' || !/^(?:[a-fA-F0-9]{2}){2,}$/.test(envelope.data)) {
          throw Error('Invalid Speculos APDU response envelope.');
        }
        return Buffer.from(envelope.data, 'hex');
      } finally {
        clearTimeout(timer);
        this.active = undefined;
      }
    });
  }

  async close(): Promise<void> {
    this.closed = true;
    this.active?.abort(new Error('Speculos transport is closed.'));
  }
}
