import { createServer, type Server, type RequestListener } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { SpeculosTransport, signerConfiguration, speculosOrigin } from '../scripts/speculos-transport';

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => {
    server.closeAllConnections(); server.close(() => resolve());
  })));
});
async function endpoint(handler: RequestListener) {
  const server = createServer(handler); servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('Missing test listener');
  return `http://127.0.0.1:${address.port}`;
}

describe('explicit local emulator signer selection', () => {
  it('keeps USB as default even when an emulator URL is present', () => {
    expect(signerConfiguration({ LEDGER_SPECULOS_URL: 'http://127.0.0.1:5002' })).toEqual({ mode: 'usb' });
    expect(signerConfiguration({ LEDGER_SIGNER_MODE: 'speculos' })).toEqual({ mode: 'speculos', url: 'http://127.0.0.1:5002' });
    expect(() => signerConfiguration({ LEDGER_SIGNER_MODE: 'automatic' })).toThrow();
  });
  it.each(['https://127.0.0.1:5002', 'http://example.com', 'http://192.168.1.2', 'http://127.0.0.1:5002/apdu', 'http://user:pass@127.0.0.1:5002', 'http://127.0.0.1:5002?x=1', 'http://127.0.0.1:5002#x', 'http://127.0.0.1:5002/../', 'http://127.0.0.1:0', 'http://127.0.0.1:65536'])('rejects unsafe emulator URL %s', url => {
    expect(() => speculosOrigin(url)).toThrow();
  });
  it('pins localhost to the IPv4 loopback address', () => {
    expect(speculosOrigin('http://localhost:5002/')).toBe('http://127.0.0.1:5002');
    expect(speculosOrigin('http://[::1]:5002')).toBe('http://[::1]:5002');
  });
});

describe('Speculos APDU transport HTTP boundary', () => {
  it('posts exact APDU bytes and returns the real protocol response including status', async () => {
    const url = await endpoint(async (request, response) => {
      let body = ''; for await (const chunk of request) body += chunk;
      if (request.method !== 'POST' || request.url !== '/apdu' || JSON.parse(body).data !== 'e002000000') {
        response.writeHead(400).end(); return;
      }
      response.setHeader('content-type', 'application/json'); response.end('{"data":"aabb9000"}');
    });
    const transport = new SpeculosTransport(url);
    expect((await transport.send(0xe0, 0x02, 0, 0)).toString('hex')).toBe('aabb9000');
    await transport.close();
    await expect(transport.exchange(Buffer.from('e002000000', 'hex'))).rejects.toThrow(/closed/i);
  });
  it('preserves device rejection status rather than manufacturing success', async () => {
    const url = await endpoint((_request, response) => response.end('{"data":"6985"}'));
    await expect(new SpeculosTransport(url).send(0xe0, 0x08, 0, 0)).rejects.toMatchObject({ statusCode: 0x6985 });
  });
  it.each(['{"error":"emulator failed"}', '{"data":"9"}', '{"data":"zz9000"}', '{"data":""}', '{"data":42}', 'not json'])('rejects malformed/error envelopes %s', async body => {
    const url = await endpoint((_request, response) => response.end(body));
    await expect(new SpeculosTransport(url).exchange(Buffer.from('e002000000', 'hex'))).rejects.toThrow();
  });
  it('rejects HTTP failures and redirects without following them', async () => {
    for (const status of [302, 500]) {
      const url = await endpoint((_request, response) => response.writeHead(status, { location: 'http://example.com' }).end('{"data":"9000"}'));
      await expect(new SpeculosTransport(url).exchange(Buffer.from('e002000000', 'hex'))).rejects.toThrow();
    }
  });
  it('bounds streamed responses without requiring Content-Length', async () => {
    const url = await endpoint((_request, response) => { response.write('{"data":"'); response.end('a'.repeat(70_000)); });
    await expect(new SpeculosTransport(url).exchange(Buffer.from('e002000000', 'hex'))).rejects.toThrow(/large|size/i);
  });
  it('rejects invalid APDU lengths before sending them', async () => {
    const transport = new SpeculosTransport('http://127.0.0.1:1');
    await expect(transport.exchange(Buffer.alloc(0))).rejects.toThrow(/APDU/);
    await expect(transport.exchange(Buffer.alloc(261))).rejects.toThrow(/APDU/);
  });
  it('times out while waiting for a response body, including user approval', async () => {
    const url = await endpoint((_request, response) => { response.writeHead(200); response.write(''); });
    const transport = new SpeculosTransport(url); transport.setExchangeTimeout(25);
    await expect(transport.exchange(Buffer.from('e002000000', 'hex'))).rejects.toThrow(/timed out|timeout|aborted/i);
  });
});
