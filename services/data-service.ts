import express from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { mkdir, open, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Provider, RepoEvidence } from '../src/lib/contracts';
import { BLOCKY402_URL, HBAR_ASSET, HEDERA_NETWORK, validateRepos } from '../src/lib/integrations/hedera';

export type PriceBook = Record<'repo-standard' | 'repo-economy',number>;
const defaultPrices: PriceBook = {'repo-standard':100_000,'repo-economy':120_000};
export function createQuote(providerId: string, input: unknown, prices: PriceBook, payTo: string) {
  const repos = validateRepos(input);
  if (!Object.hasOwn(prices,providerId)) throw new Error('Unknown provider.');
  const unitPriceAtomic = prices[providerId as keyof PriceBook];
  const amountAtomic = unitPriceAtomic * repos.length;
  if (!Number.isSafeInteger(unitPriceAtomic) || unitPriceAtomic <= 0 || !Number.isSafeInteger(amountAtomic)) throw new Error('Invalid service price.');
  return {providerId,unitPriceAtomic,units:repos.length,amountAtomic,network:HEDERA_NETWORK,asset:'HBAR' as const,payTo,expiresAt:new Date(Date.now()+60000).toISOString()};
}

/** Fixed-host GitHub API; reject redirects so tokens never follow moved repositories. */
export async function fetchRepoEvidence(repos: string[], githubToken?: string): Promise<RepoEvidence[]> {
  return Promise.all(validateRepos(repos).map(async repo => {
    const sourceUrl = `https://api.github.com/repos/${repo}`;
    const response = await fetch(sourceUrl,{headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'AgentGDP-evidence-service',...(githubToken ? {Authorization:`Bearer ${githubToken}`} : {})},redirect:'error',signal:AbortSignal.timeout(15000)});
    if (!response.ok) throw new Error(`GitHub evidence unavailable (HTTP ${response.status}).`);
    const data = await response.json() as {private?:boolean;full_name?:string;description?:string;stargazers_count:number;forks_count:number;open_issues_count:number;pushed_at:string;language?:string;license?:{spdx_id?:string}};
    if (data.private !== false || data.full_name?.toLowerCase() !== repo.toLowerCase()) throw new Error('Only exact public repository evidence can be purchased.');
    return {repo,description:data.description ?? '',stars:data.stargazers_count,forks:data.forks_count,openIssues:data.open_issues_count,pushedAt:data.pushed_at,language:data.language ?? 'Not specified',license:data.license?.spdx_id ?? 'Not specified',sourceUrl,fetchedAt:new Date().toISOString()};
  }));
}

export async function createDataService() {
  const payTo = process.env.HEDERA_PAY_TO ?? '';
  if (!/^0\.0\.[1-9]\d*$/.test(payTo)) throw new Error('HEDERA_PAY_TO must be a numeric testnet account.');
  const publicUrl = new URL(process.env.DATA_SERVICE_PUBLIC_URL ?? 'http://127.0.0.1:4402/');
  if (!publicUrl.pathname.endsWith('/')) publicUrl.pathname += '/';
  const directory = path.resolve(process.env.DATA_SERVICE_DATA_DIR ?? 'data/data-service');
  await mkdir(directory,{recursive:true,mode:0o700});
  const priceFile = path.join(directory,'prices.json');
  let prices = {...defaultPrices};
  try { prices = JSON.parse(await readFile(priceFile,'utf8')) as PriceBook; } catch(error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  for (const id of Object.keys(defaultPrices)) createQuote(id,['octocat/Hello-World'],prices,payTo);
  const {HTTPFacilitatorClient,x402ResourceServer} = await import('@x402/core/server');
  const {ExactHederaScheme} = await import('@x402/hedera/exact/server');
  const {Transaction} = await import('@x402/hedera');
  const {encodePaymentRequiredHeader,decodePaymentSignatureHeader,encodePaymentResponseHeader} = await import('@x402/core/http');
  const server = new x402ResourceServer(new HTTPFacilitatorClient({url:BLOCKY402_URL})).register(HEDERA_NETWORK,new ExactHederaScheme());
  await server.initialize();
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({limit:'8kb'}));
  app.use((_req,res,next) => { res.setHeader('Cache-Control','no-store'); next(); });
  app.get('/health',(_req,res) => res.json({ready:true,network:HEDERA_NETWORK,facilitator:BLOCKY402_URL}));
  app.get('/discovery',(_req,res) => {
    const providers: Provider[] = Object.keys(defaultPrices).map(id => ({id,name:id === 'repo-standard' ? 'Repository Standard' : 'Repository Economy',description:'Live public GitHub metadata, timestamped per request. Both tiers use the same source for transparent price competition.',network:HEDERA_NETWORK,asset:'HBAR',unit:'repository',unitPriceAtomic:prices[id as keyof PriceBook],endpoint:new URL(`evidence/${id}`,publicUrl).href}));
    res.json(providers);
  });
  app.post('/quote',(req,res) => {
    try { res.json(createQuote(req.body?.providerId,req.body?.repos,prices,payTo)); } catch { res.status(400).json({error:'Invalid provider or repository request.'}); }
  });
  let priceQueue = Promise.resolve();
  app.post('/operator/prices',async (req,res) => {
    const expected = process.env.DATA_SERVICE_OPERATOR_TOKEN;
    const actual = req.get('Authorization') ?? '';
    if (!expected || expected.length < 24 || Buffer.byteLength(actual) !== Buffer.byteLength(`Bearer ${expected}`) || !timingSafeEqual(Buffer.from(actual),Buffer.from(`Bearer ${expected}`))) { res.status(401).json({error:'Operator authentication required.'}); return; }
    const {providerId,unitPriceAtomic} = req.body ?? {};
    if (!Object.hasOwn(defaultPrices,providerId) || !Number.isSafeInteger(unitPriceAtomic) || unitPriceAtomic < 1 || unitPriceAtomic > 100_000_000) { res.status(400).json({error:'Price must be 1–100,000,000 tinybar per repository.'}); return; }
    const save = priceQueue.then(async () => {
      const updated = {...prices,[providerId]:unitPriceAtomic};
      await writeFile(priceFile+'.tmp',JSON.stringify(updated),{mode:0o600});
      await rename(priceFile+'.tmp',priceFile);
      prices = updated;
    });
    priceQueue = save.catch(() => {});
    await save;
    res.json({providerId,unitPriceAtomic});
  });
  app.post('/evidence/:providerId',async (req,res) => {
    let repos: string[];
    let quote: ReturnType<typeof createQuote>;
    const providerId = String(req.params.providerId);
    try { repos = validateRepos(req.body?.repos); quote = createQuote(providerId,repos,prices,payTo); } catch { res.status(400).json({error:'Invalid provider or repository request.'}); return; }
    const requirements = (await server.buildPaymentRequirements({scheme:'exact',network:HEDERA_NETWORK,payTo,price:{asset:HBAR_ASSET,amount:String(quote.amountAtomic)},maxTimeoutSeconds:60}))[0];
    const resource = {url:new URL(`evidence/${providerId}`,publicUrl).href,description:`Live GitHub evidence for ${repos.length} repositories`,mimeType:'application/json'};
    const challenge = {x402Version:2,resource,accepts:[requirements]};
    const signature = req.get('PAYMENT-SIGNATURE');
    if (!signature) { res.setHeader('PAYMENT-REQUIRED',encodePaymentRequiredHeader(challenge)); res.status(402).json(challenge); return; }
    if (signature.length > 24000) { res.status(400).json({error:'Oversized payment signature.'}); return; }
    let payload;
    try { payload = decodePaymentSignatureHeader(signature); } catch { res.status(400).json({error:'Malformed payment signature.'}); return; }
    const accepted = payload.accepted;
    if (payload.x402Version !== 2 || payload.resource?.url !== resource.url || !accepted || ['scheme','network','asset','amount','payTo','maxTimeoutSeconds'].some(key => accepted[key as keyof typeof accepted] !== requirements[key as keyof typeof requirements]) || accepted.extra?.feePayer !== requirements.extra.feePayer) { res.setHeader('PAYMENT-REQUIRED',encodePaymentRequiredHeader(challenge)); res.status(402).json({error:'Payment terms changed; fetch a fresh quote.'}); return; }
    const verification = await server.verifyPayment(payload,requirements);
    if (!verification.isValid) { res.status(402).json({error:'Payment verification failed.'}); return; }
    // Fetch before settlement: unavailable or rate-limited GitHub data is never charged.
    let evidence: RepoEvidence[];
    try { evidence = await fetchRepoEvidence(repos,process.env.GITHUB_TOKEN); } catch { res.status(502).json({error:'GitHub evidence unavailable; payment was not submitted.'}); return; }
    // Key by native transaction id: JSON reordering and a new HTTP key cannot bypass replay protection.
    if (typeof payload.payload.transaction !== 'string') { res.status(400).json({error:'Missing native payment transaction.'}); return; }
    const transactionId = Transaction.fromBytes(Buffer.from(payload.payload.transaction,'base64')).transactionId?.toString();
    if (!transactionId) { res.status(400).json({error:'Missing native transaction id.'}); return; }
    const digest = createHash('sha256').update(transactionId).digest('hex');
    const intentFile = path.join(directory,`payment-${digest}.json`);
    let lock;
    try { lock = await open(intentFile,'wx',0o600); } catch(error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; res.status(409).json({error:'Payment already submitted; reconcile the existing transaction.'}); return; }
    try { await lock.writeFile(JSON.stringify({status:'intent',transactionId,providerId,repos,amountAtomic:quote.amountAtomic,createdAt:new Date().toISOString()})); await lock.sync(); } finally { await lock.close(); }
    const settlement = await server.settlePayment(payload,requirements);
    res.setHeader('PAYMENT-RESPONSE',encodePaymentResponseHeader(settlement));
    if (!settlement.success || !settlement.transaction || settlement.network !== HEDERA_NETWORK) { res.status(502).json({error:'Settlement failed or uncertain; reconcile before retrying.'}); return; }
    await writeFile(intentFile,JSON.stringify({status:'settled',settlement,providerId,repos,evidence,amountAtomic:quote.amountAtomic}),{mode:0o600});
    res.json({evidence,quote});
  });
  app.use((_error:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction) => { res.status(500).json({error:'Data service could not complete this request. Reconcile any submitted payment before retrying.'}); });
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  createDataService().then(app => app.listen(Number(process.env.DATA_SERVICE_PORT ?? 4402),process.env.DATA_SERVICE_HOST ?? '127.0.0.1',() => console.log('AgentGDP Hedera data service listening.'))).catch(() => { console.error('Data service startup failed. Check recipient configuration and Blocky402 connectivity.'); process.exitCode=1; });
}
