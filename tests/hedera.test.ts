import { describe, expect, it } from 'vitest';
import type { PaymentRequirements } from '@x402/core/types';
import { validateRepos, validatePaymentRequirements, validateSettlement, validateMirrorTransfer } from '../src/lib/integrations/hedera';
import { createQuote } from '../services/data-service';

const purchase = { runId: 'run-1', requestId: 'req-1', repos: ['vercel/next.js', 'facebook/react'], providerId: 'repo-standard', unitPriceAtomic: 100, maxAmountAtomic: 200, mandateExpiresAt: new Date(Date.now()+3_600_000).toISOString() };
const requirements = { scheme: 'exact', network: 'hedera:testnet' as const, asset: '0.0.0', amount: '200', payTo: '0.0.123', maxTimeoutSeconds: 60, extra: {feePayer: '0.0.456'} };
describe('Hedera metering and payment boundaries', () => {
  it('meters the server unit price for each distinct repository', () => {
    expect(createQuote('repo-standard', purchase.repos, {'repo-standard': 100, 'repo-economy': 80}, '0.0.123')).toMatchObject({unitPriceAtomic: 100, units: 2, amountAtomic: 200});
  });
  it.each([[], ['a/b','c/d','e/f','g/h'], ['a/b','A/B'], ['https://evil.test/x'], ['a/..'], ['a/b?token=x']].map(value => ({value})))('rejects unsafe repository request $value', ({value}) => {
    expect(() => validateRepos(value)).toThrow();
  });
  it.each([{network:'hedera:mainnet'}, {asset:'0.0.99'}, {payTo:'0.0.999'}, {amount:'201'}, {amount:'2e2'}, {scheme:'upto'}, {extra:{feePayer:'0.0.999'}}, {maxTimeoutSeconds:900}])('refuses signing changed terms %j', mutation => {
    expect(() => validatePaymentRequirements({...requirements,...mutation} as PaymentRequirements, purchase, '0.0.123', '0.0.456')).toThrow();
  });
  it('accepts exactly the approved testnet native payment', () => {
    expect(validatePaymentRequirements(requirements, purchase, '0.0.123','0.0.456')).toBe(200);
  });
  it('checks cap independently of quoted unit price', () => {
    expect(() => validatePaymentRequirements(requirements, {...purchase,maxAmountAtomic:199},'0.0.123','0.0.456')).toThrow();
  });
  it.each([undefined, {success:false}, {success:true,network:'hedera:mainnet',transaction:'0.0.456@1234567890.000000001'}, {success:true,network:'hedera:testnet',transaction:''}])('rejects unproven settlement %j', value => {
    expect(() => validateSettlement(value,'0.0.777')).toThrow();
  });
  it('requires mirror consensus success and matching payer/payee transfers', () => {
    const tx = {transactions:[{result:'SUCCESS',name:'CRYPTOTRANSFER',transfers:[{account:'0.0.777',amount:-200},{account:'0.0.123',amount:200}]}]};
    expect(() => validateMirrorTransfer(tx,'0.0.777','0.0.123',200)).not.toThrow();
    expect(() => validateMirrorTransfer(tx,'0.0.888','0.0.123',200)).toThrow();
    expect(() => validateMirrorTransfer(tx,'0.0.777','0.0.123',201)).toThrow();
  });
});

describe('broker Hedera adapter', () => {
  it('accepts run-scoped idempotency keys and refuses a second signature after ambiguous transport', async () => {
    const {vi} = await import('vitest');
    const {mkdtemp,rm} = await import('node:fs/promises');
    const {tmpdir} = await import('node:os');
    const {join} = await import('node:path');
    const {PrivateKey} = await import('@x402/hedera');
    const {purchaseHederaData} = await import('../src/lib/integrations/hedera');
    const directory = await mkdtemp(join(tmpdir(),'obolos-payment-test-'));
    vi.stubEnv('DATA_SERVICE_URL','http://127.0.0.1:4402');
    vi.stubEnv('HEDERA_PAY_TO','0.0.123');
    vi.stubEnv('BROKER_DATA_DIR',directory);
    let signedRequests = 0;
    vi.stubGlobal('fetch',vi.fn(async (url: URL|string, options?: RequestInit) => {
      if (String(url).endsWith('/supported')) return Response.json({kinds:[{x402Version:2,scheme:'exact',network:'hedera:testnet',extra:{feePayer:'0.0.456'}}]});
      if (new Headers(options?.headers).has('PAYMENT-SIGNATURE')) { signedRequests++; throw new Error('Transport interrupted'); }
      const challenge = {x402Version:2,resource:{url:'http://127.0.0.1:4402/evidence/repo-standard'},accepts:[requirements]};
      return new Response(null,{status:402,headers:{'PAYMENT-REQUIRED':Buffer.from(JSON.stringify(challenge)).toString('base64')}});
    }));
    const credentials = {accountId:'0.0.777',privateKey:PrivateKey.generateED25519().toStringDer()};
    const input = {...purchase,requestId:'run-1:data'};
    try {
      await expect(purchaseHederaData(input,credentials)).rejects.toThrow('Transport interrupted');
      expect(signedRequests).toBe(1);
      await expect(purchaseHederaData(input,credentials)).rejects.toThrow('already attempted');
      expect(signedRequests).toBe(1);
    } finally { vi.unstubAllGlobals(); vi.unstubAllEnvs(); await rm(directory,{recursive:true,force:true}); }
  });
});

describe('public service HTTP boundary', () => {
  it('changes live quotes only with operator authorization and returns a metered v2 challenge', async () => {
    const {vi} = await import('vitest');
    const {mkdtemp,rm} = await import('node:fs/promises');
    const {tmpdir} = await import('node:os');
    const {join} = await import('node:path');
    const {createDataService} = await import('../services/data-service');
    const directory = await mkdtemp(join(tmpdir(),'obolos-service-test-'));
    const localFetch = globalThis.fetch;
    vi.stubEnv('HEDERA_PAY_TO','0.0.123');
    vi.stubEnv('DATA_SERVICE_DATA_DIR',directory);
    vi.stubEnv('DATA_SERVICE_OPERATOR_TOKEN','unit-test-operator-token-with-length');
    vi.stubGlobal('fetch',vi.fn(async (url: URL|string) => {
      if (!String(url).endsWith('/supported')) throw new Error('Unexpected external request');
      return Response.json({kinds:[{x402Version:2,scheme:'exact',network:'hedera:testnet',extra:{feePayer:'0.0.456'}}],extensions:[],signers:{'hedera:*':['0.0.456']}});
    }));
    const app = await createDataService();
    const server = app.listen(0,'127.0.0.1');
    await new Promise<void>(resolve => server.once('listening',resolve));
    const address = server.address() as {port:number};
    const base = `http://127.0.0.1:${address.port}`;
    const post = (route:string,body:unknown,authorized=false) => localFetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',...(authorized?{Authorization:'Bearer unit-test-operator-token-with-length'}:{})},body:JSON.stringify(body)});
    try {
      const forbidden = await post('/operator/prices',{providerId:'repo-standard',unitPriceAtomic:400000});
      expect(forbidden.status).toBe(401);
      const initial = await post('/quote',{providerId:'repo-standard',repos:purchase.repos});
      expect(await initial.json()).toMatchObject({unitPriceAtomic:100000,amountAtomic:200000,units:2});
      expect((await post('/operator/prices',{providerId:'repo-standard',unitPriceAtomic:400000},true)).status).toBe(200);
      const challenge = await post('/evidence/repo-standard',{repos:purchase.repos});
      expect(challenge.status).toBe(402);
      expect(challenge.headers.has('PAYMENT-REQUIRED')).toBe(true);
      expect(await challenge.json()).toMatchObject({x402Version:2,accepts:[{asset:'0.0.0',amount:'800000',network:'hedera:testnet',payTo:'0.0.123'}]});
      expect((await post('/evidence/repo-standard',{repos:['a/b','A/B']})).status).toBe(400);
    } finally {
      await new Promise<void>((resolve,reject) => server.close(error => error?reject(error):resolve()));
      vi.unstubAllGlobals(); vi.unstubAllEnvs(); await rm(directory,{recursive:true,force:true});
    }
  });
});

it('returns a settled receipt only for the signed transaction with exact mirror proof, then reuses the result', async () => {
  const {vi} = await import('vitest');
  const {mkdtemp,rm} = await import('node:fs/promises');
  const {tmpdir} = await import('node:os');
  const {join} = await import('node:path');
  const {PrivateKey,Transaction} = await import('@x402/hedera');
  const {purchaseHederaData} = await import('../src/lib/integrations/hedera');
  const directory = await mkdtemp(join(tmpdir(),'obolos-settled-test-'));
  vi.stubEnv('DATA_SERVICE_URL','http://127.0.0.1:4402');
  vi.stubEnv('HEDERA_PAY_TO','0.0.123');
  vi.stubEnv('BROKER_DATA_DIR',directory);
  let paidRequests = 0;
  let transactionId = '';
  const evidence = purchase.repos.map(repo => ({repo,description:'Public source',stars:5,forks:2,openIssues:1,pushedAt:'2026-09-07T10:00:00Z',language:'TypeScript',license:'MIT',sourceUrl:`https://api.github.com/repos/${repo}`,fetchedAt:new Date().toISOString()}));
  vi.stubGlobal('fetch',vi.fn(async (url: URL|string, options?: RequestInit) => {
    if (String(url).endsWith('/supported')) return Response.json({kinds:[{x402Version:2,scheme:'exact',network:'hedera:testnet',extra:{feePayer:'0.0.456'}}]});
    if (String(url).startsWith('https://testnet.mirrornode.hedera.com/')) return Response.json({transactions:[{name:'CRYPTOTRANSFER',result:'SUCCESS',transfers:[{account:'0.0.777',amount:-200},{account:'0.0.123',amount:200}]}]});
    const signature = new Headers(options?.headers).get('PAYMENT-SIGNATURE');
    if (signature) {
      paidRequests++;
      const payload = JSON.parse(Buffer.from(signature,'base64').toString('utf8')) as {payload:{transaction:string}};
      transactionId = Transaction.fromBytes(Buffer.from(payload.payload.transaction,'base64')).transactionId!.toString();
      const settlement = {success:true,payer:'0.0.777',network:'hedera:testnet',transaction:transactionId};
      return Response.json({evidence},{headers:{'PAYMENT-RESPONSE':Buffer.from(JSON.stringify(settlement)).toString('base64')}});
    }
    return new Response(null,{status:402,headers:{'PAYMENT-REQUIRED':Buffer.from(JSON.stringify({x402Version:2,resource:{url:'http://127.0.0.1:4402/evidence/repo-standard'},accepts:[requirements]})).toString('base64')}});
  }));
  const credentials = {accountId:'0.0.777',privateKey:PrivateKey.generateED25519().toStringDer()};
  try {
    const result = await purchaseHederaData(purchase,credentials);
    expect(result.receipt).toMatchObject({mode:'live',status:'settled',amountAtomic:200,units:2,transactionId});
    expect(result.evidence).toEqual(evidence);
    expect(await purchaseHederaData(purchase,credentials)).toEqual(result);
    expect(paidRequests).toBe(1);
    await expect(purchaseHederaData({...purchase,unitPriceAtomic:90},credentials)).rejects.toThrow('different terms');
  } finally { vi.unstubAllGlobals(); vi.unstubAllEnvs(); await rm(directory,{recursive:true,force:true}); }
});

it.each(['upfront', 'unpaid request', 'supported response', 'durable intent', 'signed intent'] as const)('never sends payment when the mandate expires during %s', async phase => {
  const {vi} = await import('vitest');
  const {mkdtemp,rm} = await import('node:fs/promises');
  const {existsSync,readFileSync} = await import('node:fs');
  const {createHash} = await import('node:crypto');
  const {tmpdir} = await import('node:os');
  const {join} = await import('node:path');
  const {PrivateKey} = await import('@x402/hedera');
  const {purchaseHederaData} = await import('../src/lib/integrations/hedera');
  const directory = await mkdtemp(join(tmpdir(),'obolos-expiry-test-'));
  const expiresAt = Date.now()+60_000;
  let now = phase === 'upfront' ? expiresAt : expiresAt-60_000;
  const input = {...purchase,mandateExpiresAt:new Date(expiresAt).toISOString()};
  const intent = join(directory,'hedera',createHash('sha256').update(input.requestId).digest('hex')+'.json');
  const clock = vi.spyOn(Date,'now').mockImplementation(() => {
    if (existsSync(intent)) {
      if (phase === 'durable intent') return expiresAt;
      if (phase === 'signed intent' && JSON.parse(readFileSync(intent,'utf8')).status === 'signed') return expiresAt;
    }
    return now;
  });
  const signing = vi.spyOn(PrivateKey.prototype,'sign');
  vi.stubEnv('DATA_SERVICE_URL','http://127.0.0.1:4402');
  vi.stubEnv('HEDERA_PAY_TO','0.0.123');
  vi.stubEnv('BROKER_DATA_DIR',directory);
  let signedRequests = 0;
  const transport = vi.fn(async (url:URL|string,options?:RequestInit) => {
    if (new Headers(options?.headers).has('PAYMENT-SIGNATURE')) { signedRequests++; throw new Error('Expired payment was sent'); }
    if (String(url).endsWith('/supported')) {
      if (phase === 'supported response') now = expiresAt;
      return Response.json({kinds:[{x402Version:2,scheme:'exact',network:'hedera:testnet',extra:{feePayer:'0.0.456'}}]});
    }
    if (phase === 'unpaid request') now = expiresAt;
    return new Response(null,{status:402,headers:{'PAYMENT-REQUIRED':Buffer.from(JSON.stringify({x402Version:2,resource:{url:'http://127.0.0.1:4402/evidence/repo-standard'},accepts:[requirements]})).toString('base64')}});
  });
  vi.stubGlobal('fetch',transport);
  const credentials = {accountId:'0.0.777',privateKey:PrivateKey.generateED25519().toStringDer()};
  try {
    await expect(purchaseHederaData(input,credentials)).rejects.toThrow(/mandate.*expired/i);
    if (phase === 'signed intent') expect(signing).toHaveBeenCalled();
    else expect(signing).not.toHaveBeenCalled();
    expect(signedRequests).toBe(0);
    if (phase === 'upfront') expect(transport).not.toHaveBeenCalled();
    const signatureCount = signing.mock.calls.length;
    await expect(purchaseHederaData(input,credentials)).rejects.toThrow(/mandate.*expired/i);
    expect(signing.mock.calls).toHaveLength(signatureCount);
    expect(signedRequests).toBe(0);
  } finally { clock.mockRestore(); signing.mockRestore(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); await rm(directory,{recursive:true,force:true}); }
});
