import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { HTTPFacilitatorClient, x402ResourceServer } from '@x402/core/server';
import { ExactHederaScheme } from '@x402/hedera/exact/server';
import { Transaction } from '@x402/hedera';
import { decodePaymentSignatureHeader, encodePaymentRequiredHeader, encodePaymentResponseHeader } from '@x402/core/http';
import { BLOCKY402_URL, HBAR_ASSET, HEDERA_NETWORK, validateRepos, createQuote, fetchRepoEvidence, type PriceBook } from '@/lib/repository-service';
import { sql } from './db';
import { appOrigin, readJson } from './http';
import {hederaTokenConfig,scheduledRepositoryRequest} from './hedera-commerce';
import {verifyA2AOffer,type A2AOffer} from '../hedera/a2a';
import {normalizeTransactionId,validateSettlement} from '../integrations/hedera';

let resourceServer: Promise<x402ResourceServer> | undefined;
function server() {
  return resourceServer ??= (async()=>{
    const value = new x402ResourceServer(new HTTPFacilitatorClient({url:BLOCKY402_URL})).register(HEDERA_NETWORK,new ExactHederaScheme());
    await value.initialize(); return value;
  })().catch(error=>{resourceServer=undefined;throw error;});
}
function json(value:unknown,status=200,headers:Record<string,string>={}) {
  return NextResponse.json(value,{status,headers:{'Cache-Control':'no-store',...headers}});
}
async function prices():Promise<PriceBook> {
  const rows=await sql()`SELECT provider_id,unit_price_atomic FROM platform_service_prices`;
  const book=Object.fromEntries(rows.map(row=>[row.provider_id,row.unit_price_atomic]));
  if(!Number.isSafeInteger(book['repo-standard'])||!Number.isSafeInteger(book['repo-economy'])) throw Error('Price book unavailable');
  return book as PriceBook;
}
function recipient() {
  const value=process.env.HEDERA_PAY_TO;
  if(!value||!/^0\.0\.[1-9]\d*$/.test(value)) throw Error('Recipient missing');
  return value;
}
function operator(header:string|null) {
  const token=process.env.DATA_SERVICE_OPERATOR_TOKEN;
  if(!header||!token||token.length<24)return false;
  const a=Buffer.from(header),b=Buffer.from(`Bearer ${token}`);
  return a.length===b.length&&timingSafeEqual(a,b);
}

/** Public, metered repository service. Neon owns quote state and replay intents;
 * no signing key or Circle session is loaded by this Vercel function. */
export async function publicDataRequest(req:NextRequest,path:string[]) {
  let stage='recipient';
  try {
    if(path.join('/')==='scheduled/evidence'&&req.method==='POST')return scheduledRepositoryRequest(req);
    const tokenPath=path[0]==='hts';
    const token=tokenPath?await hederaTokenConfig():null;
    if(tokenPath&&!token)return json({error:'HTS service is not configured.'},503);
    if(tokenPath)path=path.slice(1);
    const endpoint=path.join('/');
    const payTo=token?.payTo??recipient();
    stage='origin';
    const publicBase=`${appOrigin()}/x402${token?'/hts':''}`;
    const priceBook=()=>token?Promise.resolve({'repo-standard':token.unitPriceAtomic,'repo-economy':token.unitPriceAtomic}):prices();
    if(token&&req.method==='GET'&&path.length===2&&path[0]==='receipts'){
      if(!/^0\.0\.[1-9]\d*@\d{10,}\.\d{1,9}$/.test(path[1]))return json({error:'Invalid native transaction identity.'},400);
      const rows=await sql()`SELECT transaction_id,provider_id,repos,amount_atomic,asset,state,settlement,evidence FROM platform_service_payments WHERE transaction_id=${path[1]} AND asset=${token.asset}`;
      const row=rows[0];if(!row)return json({error:'Payment record not found.'},404);
      if(row.state!=='settled')return json({error:'Payment is pending; reconcile its original transaction.'},409);
      // This endpoint serves only the public repository product, never private workspace jobs.
      return json({transactionId:row.transaction_id,providerId:row.provider_id,repos:row.repos,amountAtomic:row.amount_atomic,asset:row.asset,state:row.state,settlement:row.settlement,evidence:row.evidence});
    }
    stage='database';
    if(req.method==='GET'&&endpoint==='health') {
      await priceBook();
      return json({ready:true,network:HEDERA_NETWORK,facilitator:BLOCKY402_URL,storage:'postgres'});
    }
    if(req.method==='GET'&&endpoint==='discovery') {
      const book=await priceBook();
      return json(Object.entries(book).map(([id,unitPriceAtomic])=>({id,name:id==='repo-standard'?'Repository Standard':'Repository Economy',description:'Current public GitHub repository metadata, paid per repository.',network:HEDERA_NETWORK,asset:token?.asset??'HBAR',...(token?{symbol:token.symbol,decimals:token.decimals}:{}),unit:'repository',unitPriceAtomic,endpoint:`${publicBase}/evidence/${id}`})));
    }
    if(req.method!=='POST')return json({error:'Service endpoint not found.'},404);
    if(endpoint==='operator/prices') {
      if(token)return json({error:'HTS terms require operator provisioning.'},405);
      if(!operator(req.headers.get('authorization')))return json({error:'Operator authentication required.'},401);
      const input=await readJson(req) as {providerId?:unknown;unitPriceAtomic?:unknown};
      if(!['repo-standard','repo-economy'].includes(String(input.providerId))||!Number.isSafeInteger(input.unitPriceAtomic)||Number(input.unitPriceAtomic)<1||Number(input.unitPriceAtomic)>100000000)return json({error:'Invalid price.'},400);
      await sql()`UPDATE platform_service_prices SET unit_price_atomic=${Number(input.unitPriceAtomic)} WHERE provider_id=${String(input.providerId)}`;
      return json({providerId:input.providerId,unitPriceAtomic:input.unitPriceAtomic});
    }
    if(endpoint!=='quote'&&!(path.length===2&&path[0]==='evidence'))return json({error:'Service endpoint not found.'},404);
    const input=await readJson(req) as {providerId?:unknown;repos?:unknown;a2aOfferToken?:unknown};
    let repos:string[],quote:ReturnType<typeof createQuote>;
    const providerId=endpoint==='quote'?String(input.providerId):path[1];
    try {repos=validateRepos(input.repos);quote=createQuote(providerId,repos,await priceBook(),payTo);}catch{return json({error:'Invalid provider or repository request.'},400);}
    if(endpoint==='quote')return json({...quote,...(token?{asset:token.asset,symbol:token.symbol,decimals:token.decimals}:{})});
    let offer:A2AOffer|undefined;
    if(input.a2aOfferToken!==undefined){
      try{
        if(token||typeof input.a2aOfferToken!=='string')throw Error();
        offer=verifyA2AOffer(input.a2aOfferToken);
        if(req.headers.get('idempotency-key')!==offer.paymentRequestId||offer.providerId!==providerId||offer.resourceUrl!==`${publicBase}/evidence/${providerId}`||offer.payTo!==payTo||offer.amountAtomic!==quote.amountAtomic||offer.unitPriceAtomic!==quote.unitPriceAtomic||JSON.stringify(offer.repos)!==JSON.stringify(repos))throw Error();
      }catch{return json({error:'Invalid, changed or expired A2A offer.'},400);}
    }
    stage='facilitator';
    const service=await server();
    const requirements=(await service.buildPaymentRequirements({scheme:'exact',network:HEDERA_NETWORK,payTo,price:{asset:token?.asset??HBAR_ASSET,amount:String(quote.amountAtomic)},maxTimeoutSeconds:60}))[0];
    const resource={url:`${publicBase}/evidence/${providerId}`,description:`Live GitHub evidence for ${repos.length} repositories`,mimeType:'application/json'};
    const challenge={x402Version:2,resource,accepts:[requirements]};
    const signature=req.headers.get('payment-signature');
    if(!signature)return json(challenge,402,{'PAYMENT-REQUIRED':encodePaymentRequiredHeader(challenge)});
    if(signature.length>24000)return json({error:'Oversized payment signature.'},400);
    let payload;
    try{payload=decodePaymentSignatureHeader(signature);}catch{return json({error:'Malformed payment signature.'},400);}
    const accepted=payload.accepted;
    if(payload.x402Version!==2||payload.resource?.url!==resource.url||!accepted||['scheme','network','asset','amount','payTo','maxTimeoutSeconds'].some(key=>accepted[key as keyof typeof accepted]!==requirements[key as keyof typeof requirements])||accepted.extra?.feePayer!==requirements.extra.feePayer)
      return json({error:'Payment terms changed; fetch a fresh quote.'},402,{'PAYMENT-REQUIRED':encodePaymentRequiredHeader(challenge)});
    const verified=await service.verifyPayment(payload,requirements);
    if(!verified.isValid||typeof verified.payer!=='string'||!/^0\.0\.[1-9]\d*$/.test(verified.payer))return json({error:'Payment verification failed or native payer is unproven.'},402);
    if(offer&&verified.payer!==offer.payer)return json({error:'Payment payer differs from negotiated offer.'},402);
    let evidence;
    try{evidence=await fetchRepoEvidence(repos,process.env.GITHUB_TOKEN);}catch{return json({error:'GitHub evidence unavailable; payment was not submitted.'},502);}
    if(typeof payload.payload.transaction!=='string')return json({error:'Missing native transaction.'},400);
    const transactionId=Transaction.fromBytes(Buffer.from(payload.payload.transaction,'base64')).transactionId?.toString();
    if(!transactionId)return json({error:'Missing native transaction ID.'},400);
    if(offer&&(Date.parse(offer.expiresAt)<=Date.now()||Date.parse(offer.mandateExpiresAt)<=Date.now()))return json({error:'A2A spending authority expired before settlement.'},409);
    // One persistent unique native transaction identity, across instances and
    // reordered requests. Ambiguous settlement leaves a reserved intent forever.
    const claimed=await sql()`INSERT INTO platform_service_payments(transaction_id,provider_id,repos,amount_atomic,asset,offer_id,offer_request_key)
      VALUES(${transactionId},${providerId},${JSON.stringify(repos)}::jsonb,${quote.amountAtomic},${token?.asset??HBAR_ASSET},${offer?.offerId??null},${offer?`${offer.payer}:${offer.requestId}`:null}) ON CONFLICT DO NOTHING RETURNING transaction_id`;
    if(!claimed[0])return json({error:'Payment already submitted; reconcile the existing transaction.'},409);
    if(offer&&(Date.parse(offer.expiresAt)<=Date.now()||Date.parse(offer.mandateExpiresAt)<=Date.now()))return json({error:'A2A authority expired. Reserved intent requires reconciliation.'},409);
    const settlement=await service.settlePayment(payload,requirements);
    const responseHeader={'PAYMENT-RESPONSE':encodePaymentResponseHeader(settlement)};
    if(!settlement.success||!settlement.transaction||settlement.network!==HEDERA_NETWORK)return json({error:'Settlement failed or uncertain; reconcile before retrying.'},502,responseHeader);
    try{
      validateSettlement(settlement,verified.payer);
      if(normalizeTransactionId(settlement.transaction)!==normalizeTransactionId(transactionId))throw Error('Settlement transaction mismatch.');
    }catch{return json({error:'Settlement identity is unproven; reconcile the reserved original transaction before retrying.'},502,responseHeader);}
    await sql()`UPDATE platform_service_payments SET state='settled',settlement=${JSON.stringify(settlement)}::jsonb,evidence=${JSON.stringify(evidence)}::jsonb,settled_at=now() WHERE transaction_id=${transactionId} AND state='pending'`;
    return json({evidence,quote},200,responseHeader);
  } catch {
    console.error('Public data service unavailable', {stage});
    return json({error:'Data service unavailable. Reconcile any submitted payment before retrying.'},503);
  }
}
