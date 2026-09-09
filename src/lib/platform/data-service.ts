import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { HTTPFacilitatorClient, x402ResourceServer } from '@x402/core/server';
import { ExactHederaScheme } from '@x402/hedera/exact/server';
import { Transaction } from '@x402/hedera';
import { decodePaymentSignatureHeader, encodePaymentRequiredHeader, encodePaymentResponseHeader } from '@x402/core/http';
import { BLOCKY402_URL, HBAR_ASSET, HEDERA_NETWORK, validateRepos, createQuote, fetchRepoEvidence, type PriceBook } from '@/lib/repository-service';
import { sql } from './db';
import { appOrigin, readJson } from './http';

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
    const endpoint=path.join('/');
    const payTo=recipient();
    stage='origin';
    const publicBase=`${appOrigin()}/x402`;
    stage='database';
    if(req.method==='GET'&&endpoint==='health') {
      await prices();
      return json({ready:true,network:HEDERA_NETWORK,facilitator:BLOCKY402_URL,storage:'postgres'});
    }
    if(req.method==='GET'&&endpoint==='discovery') {
      const book=await prices();
      return json(Object.entries(book).map(([id,unitPriceAtomic])=>({id,name:id==='repo-standard'?'Repository Standard':'Repository Economy',description:'Current public GitHub repository metadata, paid per repository.',network:HEDERA_NETWORK,asset:'HBAR',unit:'repository',unitPriceAtomic,endpoint:`${publicBase}/evidence/${id}`})));
    }
    if(req.method!=='POST')return json({error:'Service endpoint not found.'},404);
    if(endpoint==='operator/prices') {
      if(!operator(req.headers.get('authorization')))return json({error:'Operator authentication required.'},401);
      const input=await readJson(req) as {providerId?:unknown;unitPriceAtomic?:unknown};
      if(!['repo-standard','repo-economy'].includes(String(input.providerId))||!Number.isSafeInteger(input.unitPriceAtomic)||Number(input.unitPriceAtomic)<1||Number(input.unitPriceAtomic)>100000000)return json({error:'Invalid price.'},400);
      await sql()`UPDATE platform_service_prices SET unit_price_atomic=${Number(input.unitPriceAtomic)} WHERE provider_id=${String(input.providerId)}`;
      return json({providerId:input.providerId,unitPriceAtomic:input.unitPriceAtomic});
    }
    if(endpoint!=='quote'&&!(path.length===2&&path[0]==='evidence'))return json({error:'Service endpoint not found.'},404);
    const input=await readJson(req) as {providerId?:unknown;repos?:unknown};
    let repos:string[],quote:ReturnType<typeof createQuote>;
    const providerId=endpoint==='quote'?String(input.providerId):path[1];
    try {repos=validateRepos(input.repos);quote=createQuote(providerId,repos,await prices(),payTo);}catch{return json({error:'Invalid provider or repository request.'},400);}
    if(endpoint==='quote')return json(quote);
    stage='facilitator';
    const service=await server();
    const requirements=(await service.buildPaymentRequirements({scheme:'exact',network:HEDERA_NETWORK,payTo,price:{asset:HBAR_ASSET,amount:String(quote.amountAtomic)},maxTimeoutSeconds:60}))[0];
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
    if(!verified.isValid)return json({error:'Payment verification failed.'},402);
    let evidence;
    try{evidence=await fetchRepoEvidence(repos,process.env.GITHUB_TOKEN);}catch{return json({error:'GitHub evidence unavailable; payment was not submitted.'},502);}
    if(typeof payload.payload.transaction!=='string')return json({error:'Missing native transaction.'},400);
    const transactionId=Transaction.fromBytes(Buffer.from(payload.payload.transaction,'base64')).transactionId?.toString();
    if(!transactionId)return json({error:'Missing native transaction ID.'},400);
    // One persistent unique native transaction identity, across instances and
    // reordered requests. Ambiguous settlement leaves a reserved intent forever.
    const claimed=await sql()`INSERT INTO platform_service_payments(transaction_id,provider_id,repos,amount_atomic)
      VALUES(${transactionId},${providerId},${JSON.stringify(repos)}::jsonb,${quote.amountAtomic}) ON CONFLICT(transaction_id) DO NOTHING RETURNING transaction_id`;
    if(!claimed[0])return json({error:'Payment already submitted; reconcile the existing transaction.'},409);
    const settlement=await service.settlePayment(payload,requirements);
    const responseHeader={'PAYMENT-RESPONSE':encodePaymentResponseHeader(settlement)};
    if(!settlement.success||!settlement.transaction||settlement.network!==HEDERA_NETWORK)return json({error:'Settlement failed or uncertain; reconcile before retrying.'},502,responseHeader);
    await sql()`UPDATE platform_service_payments SET state='settled',settlement=${JSON.stringify(settlement)}::jsonb,evidence=${JSON.stringify(evidence)}::jsonb,settled_at=now() WHERE transaction_id=${transactionId} AND state='pending'`;
    return json({evidence,quote},200,responseHeader);
  } catch {
    console.error('Public data service unavailable', {stage});
    return json({error:'Data service unavailable. Reconcile any submitted payment before retrying.'},503);
  }
}
