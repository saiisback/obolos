import { createHash } from 'node:crypto';
import { mkdir, open, readFile, rename } from 'node:fs/promises';
import path from 'node:path';
import type { PaymentRequirements, SettleResponse } from '@x402/core/types';
import type { DataPurchase, Receipt, RepoEvidence } from '../contracts';

import { HEDERA_NETWORK, BLOCKY402_URL, HBAR_ASSET, validateRepos } from '../repository-service';
export { HEDERA_NETWORK, BLOCKY402_URL, HBAR_ASSET, validateRepos } from '../repository-service';
const accountPattern = /^0\.0\.[1-9]\d*$/;
const providerIds = ['repo-standard', 'repo-economy'];
type PurchaseResult = { evidence: RepoEvidence[]; receipt: Receipt };
export interface HederaCredentials { accountId: string; privateKey: string; keyType?: 'ecdsa' | 'ed25519' | 'der' }

function positiveAtomic(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function assertMandateActive(expiresAt: string): void {
  const expiry = typeof expiresAt === 'string' ? Date.parse(expiresAt) : NaN;
  if (!Number.isFinite(expiry) || expiry <= Date.now()) throw new Error('Data mandate is expired or has an invalid expiry; payment authorization is required.');
}

export function validatePaymentRequirements(value: PaymentRequirements, input: DataPurchase, payTo: string, feePayer: string): number {
  const repos = validateRepos(input.repos);
  const amount = input.unitPriceAtomic * repos.length;
  if (!providerIds.includes(input.providerId) || !positiveAtomic(input.unitPriceAtomic) || !positiveAtomic(input.maxAmountAtomic) || !positiveAtomic(amount) || amount > input.maxAmountAtomic) throw new Error('Approved data allowance is invalid or insufficient.');
  if (!value || value.scheme !== 'exact' || value.network !== HEDERA_NETWORK || value.asset !== HBAR_ASSET || value.payTo !== payTo || !accountPattern.test(payTo)) throw new Error('Payment network, asset, scheme or recipient violates the mandate.');
  if (!/^\d+$/.test(value.amount) || BigInt(value.amount) !== BigInt(amount)) throw new Error('Provider price changed; renew the quote before authorizing payment.');
  if (!Number.isInteger(value.maxTimeoutSeconds) || value.maxTimeoutSeconds < 1 || value.maxTimeoutSeconds > 120 || !accountPattern.test(feePayer) || value.extra?.feePayer !== feePayer) throw new Error('Untrusted facilitator fee payer or transaction lifetime.');
  if (value.extra?.paymentFlow && value.extra.paymentFlow !== 'authorization') throw new Error('Unsupported payment flow.');
  return amount;
}

export function normalizeTransactionId(id: string): string {
  return id.replace('@','-').replace(/\.(\d+)$/,'-$1');
}

export function validateSettlement(value: unknown, payer: string): SettleResponse {
  const result = value as SettleResponse | undefined;
  if (!result || result.success !== true || result.network !== HEDERA_NETWORK || result.payer !== payer || typeof result.transaction !== 'string' || !/^0\.0\.[1-9]\d*-\d{10,}-\d{1,9}$/.test(normalizeTransactionId(result.transaction))) throw new Error('Payment settlement is unproven; reconcile before retrying.');
  return result;
}

export function validateMirrorTransfer(value: unknown, payer: string, payTo: string, amount: number): void {
  const body = value as {transactions?: {result?: string; name?: string; transfers?: {account:string;amount:number}[];token_transfers?:unknown[]}[]};
  const matches = body?.transactions?.some(tx => tx.result === 'SUCCESS' && tx.name === 'CRYPTOTRANSFER' && !tx.token_transfers?.length &&
    tx.transfers?.filter(t => t.account === payer).reduce((sum,t) => sum+t.amount,0) === -amount &&
    tx.transfers?.filter(t => t.account === payTo).reduce((sum,t) => sum+t.amount,0) === amount);
  if (!matches) throw new Error('Hedera mirror node has not proven the exact native transfer; reconcile before retrying.');
}

export function validateEvidence(value: unknown, repos: string[]): RepoEvidence[] {
  if (!Array.isArray(value) || value.length !== repos.length) throw new Error('Provider returned incomplete evidence.');
  return value.map((entry, index) => {
    const e = entry as RepoEvidence;
    if (!e || e.repo?.toLowerCase() !== repos[index].toLowerCase() || e.sourceUrl !== `https://api.github.com/repos/${repos[index]}` || !Number.isFinite(Date.parse(e.fetchedAt)) || !Number.isFinite(Date.parse(e.pushedAt)) || ![e.stars,e.forks,e.openIssues].every(n => Number.isSafeInteger(n) && n >= 0) || ![e.description,e.language,e.license].every(s => typeof s === 'string' && s.length <= 10000)) throw new Error('Provider evidence failed source/schema validation.');
    return e;
  });
}

function serviceBase(): URL {
  if (!process.env.DATA_SERVICE_URL) throw new Error('DATA_SERVICE_URL is required for live purchases.');
  const url = new URL(process.env.DATA_SERVICE_URL);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1','localhost','[::1]'].includes(url.hostname))) || url.username || url.password || url.search || url.hash) throw new Error('Data service must use HTTPS, or loopback HTTP.');
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url;
}

async function durableWrite(filename: string, content: unknown, exclusive = false): Promise<void> {
  const target = exclusive ? filename : `${filename}.${process.pid}.tmp`;
  const file = await open(target, exclusive ? 'wx' : 'w', 0o600);
  try { await file.writeFile(JSON.stringify(content)); await file.sync(); } finally { await file.close(); }
  if (!exclusive) await rename(target, filename);
}

/** Broker only. Once an intent exists, uncertainty never creates another signed transfer. */
export async function purchaseHederaData(input: DataPurchase, credentials?: HederaCredentials): Promise<PurchaseResult> {
  assertMandateActive(input.mandateExpiresAt);
  const repos = validateRepos(input.repos);
  if (!/^[A-Za-z0-9_:-]{1,180}$/.test(input.requestId) || !/^[A-Za-z0-9_-]{1,180}$/.test(input.runId) || !providerIds.includes(input.providerId)) throw new Error('Invalid purchase identity.');
  const base = serviceBase();
  const payTo = process.env.HEDERA_PAY_TO ?? '';
  const secret = credentials ?? {accountId: process.env.HEDERA_PAYER_ACCOUNT_ID ?? '',privateKey: process.env.HEDERA_PAYER_PRIVATE_KEY ?? '',keyType: (process.env.HEDERA_PAYER_KEY_TYPE ?? 'der') as HederaCredentials['keyType']};
  if (!accountPattern.test(secret.accountId) || !secret.privateKey || !accountPattern.test(payTo) || payTo === secret.accountId) throw new Error('Configure distinct Hedera testnet payer and recipient accounts in the broker.');
  const fingerprint = createHash('sha256').update(JSON.stringify({input,base:base.href,payTo,payer:secret.accountId})).digest('hex');
  const directory = path.resolve(process.env.BROKER_DATA_DIR ?? 'data/broker','hedera');
  await mkdir(directory,{recursive:true,mode:0o700});
  const journal = path.join(directory,createHash('sha256').update(input.requestId).digest('hex')+'.json');
  try {
    const existing = JSON.parse(await readFile(journal,'utf8')) as {fingerprint:string;result?:PurchaseResult};
    if (existing.fingerprint !== fingerprint) throw new Error('Purchase idempotency key was reused with different terms.');
    if (existing.result) return existing.result;
    throw new Error('Purchase already attempted; reconcile the recorded intent before any retry.');
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const endpoint = new URL(`evidence/${input.providerId}`,base);
  const options: RequestInit = {method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':input.requestId},body:JSON.stringify({repos}),redirect:'error',signal:AbortSignal.timeout(30000)};
  const unpaid = await fetch(endpoint,options);
  if (unpaid.status !== 402) throw new Error('Provider did not return an x402 payment challenge.');
  const {decodePaymentRequiredHeader,encodePaymentSignatureHeader,decodePaymentResponseHeader} = await import('@x402/core/http');
  const header = unpaid.headers.get('PAYMENT-REQUIRED');
  if (!header || header.length > 24000) throw new Error('Missing or oversized x402 challenge.');
  const required = decodePaymentRequiredHeader(header);
  if (required.x402Version !== 2 || required.accepts?.length !== 1 || required.resource?.url !== endpoint.href) throw new Error('Unexpected x402 protocol, resource or payment alternatives.');
  const supportedResponse = await fetch(`${BLOCKY402_URL}/supported`,{signal:AbortSignal.timeout(15000),redirect:'error'});
  if (!supportedResponse.ok) throw new Error('Blocky402 testnet facilitator unavailable.');
  const supported = await supportedResponse.json() as {kinds:{x402Version:number;scheme:string;network:string;extra?:{feePayer?:string}}[]};
  const feePayer = supported.kinds.find(k => k.x402Version === 2 && k.scheme === 'exact' && k.network === HEDERA_NETWORK)?.extra?.feePayer;
  if (!feePayer) throw new Error('Blocky402 does not advertise native Hedera testnet support.');
  const amount = validatePaymentRequirements(required.accepts[0],input,payTo,feePayer);
  if (feePayer === secret.accountId || feePayer === payTo) throw new Error('Payer, payee and facilitator must be distinct.');
  const {createClientHederaSigner,PrivateKey,Transaction} = await import('@x402/hedera');
  const {ExactHederaScheme} = await import('@x402/hedera/exact/client');
  let key;
  try { key = secret.keyType === 'ecdsa' ? PrivateKey.fromStringECDSA(secret.privateKey) : secret.keyType === 'ed25519' ? PrivateKey.fromStringED25519(secret.privateKey) : PrivateKey.fromString(secret.privateKey); }
  catch { throw new Error('Hedera payer key could not be decoded.'); }
  // Lock before signing; signing/transport failures require operator reconciliation.
  await durableWrite(journal,{fingerprint,status:'intent',requestId:input.requestId,createdAt:new Date().toISOString(),amountAtomic:amount},true);
  const signer = createClientHederaSigner(secret.accountId,key,{network:HEDERA_NETWORK});
  // Discovery, facilitator lookup, imports and durable intent I/O may outlive approval.
  assertMandateActive(input.mandateExpiresAt);
  const signed = await new ExactHederaScheme(signer).createPaymentPayload(2,required.accepts[0]);
  const payload = {x402Version:2,resource:required.resource,accepted:required.accepts[0],payload:signed.payload};
  // Bind settlement to this signed transaction, not an old receipt.
  const transactionBytes = signed.payload.transaction;
  if (typeof transactionBytes !== 'string') throw new Error('Hedera signer did not produce a transaction.');
  const transactionId = Transaction.fromBytes(Buffer.from(transactionBytes,'base64')).transactionId?.toString();
  if (!transactionId) throw new Error('Signed transfer has no transaction id.');
  await durableWrite(journal,{fingerprint,status:'signed',requestId:input.requestId,transactionId,amountAtomic:amount});
  // Do not transmit even an already signed authorization after mandate expiry.
  assertMandateActive(input.mandateExpiresAt);
  const response = await fetch(endpoint,{...options,headers:{...options.headers,'PAYMENT-SIGNATURE':encodePaymentSignatureHeader(payload)},signal:AbortSignal.timeout(90000)});
  const settlementHeader = response.headers.get('PAYMENT-RESPONSE');
  if (!response.ok || !settlementHeader || settlementHeader.length > 24000) throw new Error('Paid request has no successful settlement response; reconcile before retrying.');
  const settlement = validateSettlement(decodePaymentResponseHeader(settlementHeader),secret.accountId);
  if (normalizeTransactionId(settlement.transaction) !== normalizeTransactionId(transactionId)) throw new Error('Settlement transaction differs from the signed intent.');
  const mirrorUrl = `https://testnet.mirrornode.hedera.com/api/v1/transactions/${encodeURIComponent(normalizeTransactionId(transactionId))}`;
  // Poll only the read-only proof endpoint; never repeat a paid HTTP request.
  let proofError: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const mirror = await fetch(mirrorUrl,{signal:AbortSignal.timeout(15000),redirect:'error'});
      if (!mirror.ok) throw new Error('Mirror receipt unavailable.');
      validateMirrorTransfer(await mirror.json(),secret.accountId,payTo,amount);
      proofError = undefined; break;
    } catch (error) { proofError = error; if (attempt < 4) await new Promise(resolve => setTimeout(resolve,2000)); }
  }
  if (proofError) throw new Error('Payment may have settled but mirror proof is unavailable; reconcile recorded transaction before retrying.');
  const body = await response.json() as {evidence:unknown};
  const evidence = validateEvidence(body.evidence,repos);
  const result: PurchaseResult = {evidence,receipt:{id:`hedera-${input.requestId}`,requestId:input.requestId,mode:'live',network:HEDERA_NETWORK,asset:'HBAR',amountAtomic:amount,units:repos.length,provider:input.providerId,status:'settled',timestamp:new Date().toISOString(),transactionId,explorerUrl:`https://hashscan.io/testnet/transaction/${encodeURIComponent(transactionId)}`}};
  await durableWrite(journal,{fingerprint,status:'settled',result});
  return result;
}
