import {it,expect,vi,afterEach} from 'vitest';
import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createHash,createHmac} from 'node:crypto';
const dbState=vi.hoisted(()=>({row:undefined as Record<string,unknown>|undefined,payments:{} as Record<string,Record<string,unknown>>,delivery:undefined as Record<string,unknown>|undefined}));
vi.mock('pg',()=>({default:{Client:class{async connect(){}async end(){}async query(text:string,values:unknown[]=[]){const row=text.includes('platform_scheduled_deliveries')?dbState.delivery:dbState.row?.transaction_id===values[0]?dbState.row:dbState.payments[String(values[0])];return {rows:row?[row]:[]};}}}}));
import {canonicalAgentData,createUaid} from '../src/lib/hedera/identity';
import {buildProfilePayload} from '../src/lib/hedera/audit';
import {prepareHederaPublication} from '../scripts/hedera-publish-evidence';
const canonical=canonicalAgentData({registry:'obolos',name:'Service',version:'1.0.0',protocol:'a2a',nativeId:'hedera:testnet:0.0.123',skills:[17]});
const anchor={network:'hedera:2' as const,topicId:'0.0.456',transactionId:'0.0.123@1789190000.000000001',sequenceNumber:'1',consensusTimestamp:'1789190001.000000002',mirrorUrl:'https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.456/messages/1'};
const identity={version:1 as const,canonical,uaid:createUaid(canonical),submitKey:{type:'ED25519' as const,key:'aa'.repeat(32)},topicId:'0.0.456',profileAnchor:anchor};
const evidence=[{repo:'octocat/Hello-World',sourceUrl:'https://api.github.com/repos/octocat/Hello-World',fetchedAt:'2026-09-13T00:00:00Z',pushedAt:'2026-09-12T00:00:00Z',stars:1,forks:1,openIssues:1,description:'RAW PRIVATE REPORT',language:'TypeScript',license:'MIT'}];
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
function mirror(paymentSuccess=true){vi.stubGlobal('fetch',async(url:string)=>{
 const root='https://testnet.mirrornode.hedera.com/api/v1';let body:unknown;
 if(url===root+'/topics/0.0.456')body={topic_id:'0.0.456',deleted:false,submit_key:{_type:'ED25519',key:identity.submitKey.key}};
 else if(url===anchor.mirrorUrl)body={topic_id:'0.0.456',sequence_number:1,consensus_timestamp:anchor.consensusTimestamp,message:Buffer.from(buildProfilePayload(identity)).toString('base64'),chunk_info:null};
 else if(url===root+'/transactions/0.0.123-1789190000-000000001')body={transactions:[{transaction_id:'0.0.123-1789190000-000000001',entity_id:'0.0.456',consensus_timestamp:anchor.consensusTimestamp,name:'CONSENSUSSUBMITMESSAGE',result:'SUCCESS',scheduled:false}]};
 else if(url===root+'/transactions/0.0.123-1789190002-000000001?scheduled=false')body={transactions:[{transaction_id:'0.0.123-1789190002-000000001',name:'CRYPTOTRANSFER',result:paymentSuccess?'SUCCESS':'FAIL_INVALID',scheduled:false,charged_tx_fee:0,transfers:[{account:'0.0.123',amount:-100},{account:'0.0.789',amount:100}],token_transfers:[]}]};
 else throw Error('Unexpected or untrusted proof URL');
 return new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}});
});}
async function fixture(){const dir=await mkdtemp(path.join(tmpdir(),'hedera-publish-'));const identityServiceFile=path.join(dir,'identity.json'),a2aFile=path.join(dir,'a2a.json');
 vi.stubEnv('A2A_PUBLIC_URL','https://obolos.app/');vi.stubEnv('DATA_SERVICE_PUBLIC_URL','https://obolos.app/x402/');vi.stubEnv('HEDERA_PAY_TO','0.0.789');vi.stubEnv('A2A_OFFER_SECRET','test-private-offer-secret-0123456789');vi.stubEnv('DATABASE_URL','postgresql://test.invalid/publication-fixture');
 const payload={version:1,contextId:'offer-context',requestId:'PRIVATE_REQUEST',payer:'0.0.123',providerId:'repo-standard',repos:['octocat/Hello-World'],resourceUrl:'https://obolos.app/x402/evidence/repo-standard',unitPriceAtomic:100,amountAtomic:100,maxAmountAtomic:100,mandateExpiresAt:'2026-09-12T00:01:00.000Z',issuedAt:'2026-09-12T00:00:00.000Z',expiresAt:'2026-09-12T00:00:30.000Z',network:'hedera:testnet',asset:'0.0.0',payTo:'0.0.789'};
 const body=Buffer.from(JSON.stringify(payload)).toString('base64url'),offerId=createHash('sha256').update(JSON.stringify(payload)).digest('hex'),offer={...payload,offerId,paymentRequestId:'a2a:'+offerId,offerToken:body+'.'+createHmac('sha256',process.env.A2A_OFFER_SECRET!).update(body).digest('base64url')};
 dbState.payments={};dbState.delivery=undefined;
 const transactionId='0.0.123@1789190002.000000001';
 const receipt={requestId:offer.paymentRequestId,mode:'live',network:'hedera:testnet',asset:'HBAR',amountAtomic:100,units:1,provider:'repo-standard',status:'settled',timestamp:'2026-09-13T00:00:00Z',transactionId};
 dbState.row={transaction_id:transactionId,state:'settled',offer_id:offerId,offer_request_key:'0.0.123:PRIVATE_REQUEST',provider_id:'repo-standard',repos:payload.repos,amount_atomic:100,asset:'0.0.0',settlement:{success:true,network:'hedera:testnet',payer:'0.0.123',transaction:transactionId},evidence};
 await writeFile(identityServiceFile,JSON.stringify({...identity,privateKey:'PRIVATE KEY',signedBytes:'SIGNED BYTES'}));
 await writeFile(a2aFile,JSON.stringify({status:'completed',offer,result:{offerId,contextId:offer.contextId,resourceUrl:offer.resourceUrl,payer:'0.0.123',receipt,evidence},signedBytes:'SIGNED BYTES'}));
 return {dir,paths:{identityServiceFile,a2aFile}};}
it('reverifies profiles and settlements and publishes only public schema fields',async()=>{const {dir,paths}=await fixture();mirror();try{
 const result=await prepareHederaPublication(paths),encoded=JSON.stringify(result);
 expect(result.release.a2a?.receipt.transactionId).toBe('0.0.123@1789190002.000000001');expect(result.identityService.uaid).toBe(identity.uaid);
 for(const secret of ['PRIVATE KEY','SIGNED BYTES','PRIVATE OFFER','PRIVATE REQUEST','PRIVATE_REQUEST','RAW PRIVATE REPORT','octocat/Hello-World'])expect(encoded).not.toContain(secret);
 }finally{await rm(dir,{recursive:true,force:true});}});
it('refuses a locally completed payment whose exact mirror transfer is unsuccessful',async()=>{const {dir,paths}=await fixture();mirror(false);try{await expect(prepareHederaPublication(paths)).rejects.toThrow();}finally{await rm(dir,{recursive:true,force:true});}});
it('requires paired schedule and audit artifacts before attempting verification',async()=>{await expect(prepareHederaPublication({identityServiceFile:'none',schedulesFile:'schedule'})).rejects.toThrow('paired');});

import {scheduleMemo} from '../src/lib/hedera/commerce';
import {buildPaymentAuditPayload} from '../src/lib/hedera/audit';
it('verifies finite scheduled deliveries and excludes their private plan and reports',async()=>{
 const {dir,paths}=await fixture();mirror();const baseFetch=globalThis.fetch;
 const plan={id:'11111111-1111-4111-8111-111111111111',payer:'0.0.123',payTo:'0.0.789',repos:['octocat/Hello-World'],unitPriceAtomic:100,count:1,intervalSeconds:30,firstExecutionAt:new Date(1789190010*1000).toISOString(),maxTotalAtomic:100};
 const scheduledTransactionId='0.0.123@1789190003.000000001?scheduled',proof={scheduleId:'0.0.777',consensusTimestamp:'1789190010.000000001',payer:plan.payer,payTo:plan.payTo,amountAtomic:100,network:'hedera:testnet',asset:'HBAR',round:0};
 dbState.delivery={schedule_id:proof.scheduleId,fingerprint:createHash('sha256').update(JSON.stringify([plan,0])).digest('hex'),state:'delivered',evidence,proof};
 const schedulesFile=path.join(dir,'schedules.json'),scheduledResultsFile=path.join(dir,'results.json');
 await writeFile(schedulesFile,JSON.stringify({plan,schedules:[{round:0,scheduleId:'0.0.777',transactionId:'0.0.123@1789190004.000000001',scheduledTransactionId}]}));
 await writeFile(scheduledResultsFile,JSON.stringify([{round:0,scheduleId:'0.0.777',scheduledTransactionId,evidence,proof}]));
 vi.stubGlobal('fetch',async(url:string)=>{
  const root='https://testnet.mirrornode.hedera.com/api/v1';
  if(url===root+'/schedules/0.0.777')return Response.json({schedule_id:'0.0.777',payer_account_id:plan.payer,wait_for_expiry:true,executed_timestamp:proof.consensusTimestamp,expiration_time:'1789190010.000000000',memo:scheduleMemo(plan,0),deleted:false});
  if(url===root+'/transactions/0.0.123-1789190003-000000001?scheduled=true')return Response.json({transactions:[{transaction_id:'0.0.123-1789190003-000000001',scheduled:true,name:'CRYPTOTRANSFER',result:'SUCCESS',charged_tx_fee:20,consensus_timestamp:proof.consensusTimestamp,memo_base64:Buffer.from(scheduleMemo(plan,0)).toString('base64'),transfers:[{account:plan.payer,amount:-120},{account:plan.payTo,amount:100}],token_transfers:[]}]});
  return baseFetch(url);
 });
 try{const prepared=await prepareHederaPublication({...paths,schedulesFile,scheduledResultsFile});expect(prepared.release.schedules).toEqual([{scheduleId:'0.0.777',transactionId:scheduledTransactionId,proof}]);expect(JSON.stringify(prepared)).not.toContain(plan.id);expect(JSON.stringify(prepared)).not.toContain('RAW PRIVATE REPORT');
  const delivered=dbState.delivery!;for(const change of [{state:'pending'},{fingerprint:'ab'.repeat(32)},{evidence:[{...evidence[0],description:'different resource'}]},{proof:{...proof,amountAtomic:101}}]){dbState.delivery={...delivered,...change};await expect(prepareHederaPublication({...paths,schedulesFile,scheduledResultsFile})).rejects.toThrow();}dbState.delivery=delivered;
  await writeFile(scheduledResultsFile,'[]');await expect(prepareHederaPublication({...paths,schedulesFile,scheduledResultsFile})).rejects.toThrow();
 }finally{await rm(dir,{recursive:true,force:true});}
});
it('verifies token settlement and exact public audit payload while stripping operator journals',async()=>{
 const {dir,paths}=await fixture();mirror();const baseFetch=globalThis.fetch;
 const buyerCanonical=canonicalAgentData({...canonical,name:'Buyer'}),buyerAnchor={...anchor,topicId:'0.0.457',transactionId:'0.0.123@1789190008.000000001',consensusTimestamp:'1789190009.000000001',mirrorUrl:'https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.457/messages/1'},buyerIdentity={...identity,canonical:buyerCanonical,uaid:createUaid(buyerCanonical),topicId:'0.0.457',profileAnchor:buyerAnchor},identityBuyerFile=path.join(dir,'buyer.json');
 await writeFile(identityBuyerFile,JSON.stringify(buyerIdentity));
 const transactionId='0.0.123@1789190005.000000001',terms={asset:'0.0.888',payer:'0.0.123',payTo:'0.0.789',amountAtomic:1};
 const htsFile=path.join(dir,'hts.json'),auditFile=path.join(dir,'audit.json'),auditPaymentFile=path.join(dir,'audit-payment.json');
 await writeFile(htsFile,JSON.stringify({status:'settled',transactionId,input:{requestId:'PRIVATE HTS REQUEST',providerId:'repo-standard',unitPriceAtomic:1,repos:['octocat/Hello-World'],terms},result:{status:'settled',requestId:'PRIVATE HTS REQUEST',transactionId,network:'hedera:testnet',...terms,units:1,evidence},signedBytes:'PRIVATE SIGNED AUTH'}));
 dbState.payments[transactionId]={transaction_id:transactionId,state:'settled',provider_id:'repo-standard',repos:['octocat/Hello-World'],amount_atomic:1,asset:terms.asset,settlement:{success:true,network:'hedera:testnet',payer:terms.payer,transaction:transactionId},evidence};
 const auditPayment={uaid:identity.uaid,paymentTransactionId:transactionId,network:'hedera:2',asset:terms.asset,amountAtomic:'1',payer:terms.payer,payTo:terms.payTo,requestId:'PRIVATE HTS REQUEST',evidenceDigest:createHash('sha256').update(JSON.stringify(evidence)).digest('hex')};
 const auditAnchor={...anchor,transactionId:'0.0.123@1789190006.000000001',sequenceNumber:'2',consensusTimestamp:'1789190007.000000001',mirrorUrl:'https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.456/messages/2'};
 await writeFile(auditFile,JSON.stringify({result:auditAnchor,signedBytes:'PRIVATE SIGNED AUTH'}));await writeFile(auditPaymentFile,JSON.stringify({...auditPayment,privateKey:'PRIVATE RING KEY'}));
 vi.stubGlobal('fetch',async(url:string)=>{
  const root='https://testnet.mirrornode.hedera.com/api/v1';
  if(url===root+'/topics/0.0.457')return Response.json({topic_id:'0.0.457',deleted:false,submit_key:{_type:'ED25519',key:identity.submitKey.key}});
  if(url===buyerAnchor.mirrorUrl)return Response.json({topic_id:'0.0.457',sequence_number:1,consensus_timestamp:buyerAnchor.consensusTimestamp,message:Buffer.from(buildProfilePayload(buyerIdentity)).toString('base64'),chunk_info:null});
  if(url===root+'/transactions/0.0.123-1789190008-000000001')return Response.json({transactions:[{transaction_id:'0.0.123-1789190008-000000001',name:'CONSENSUSSUBMITMESSAGE',result:'SUCCESS',scheduled:false,entity_id:'0.0.457',consensus_timestamp:buyerAnchor.consensusTimestamp}]});
  if(url===root+'/transactions/0.0.123-1789190005-000000001?scheduled=false')return Response.json({transactions:[{transaction_id:'0.0.123-1789190005-000000001',name:'CRYPTOTRANSFER',result:'SUCCESS',scheduled:false,transfers:[],token_transfers:[{token_id:terms.asset,account:terms.payer,amount:-1},{token_id:terms.asset,account:terms.payTo,amount:1}]}]});
  if(url===auditAnchor.mirrorUrl)return Response.json({topic_id:'0.0.456',sequence_number:2,consensus_timestamp:auditAnchor.consensusTimestamp,message:Buffer.from(buildPaymentAuditPayload(auditPayment)).toString('base64'),chunk_info:null});
  if(url===root+'/transactions/0.0.123-1789190006-000000001')return Response.json({transactions:[{transaction_id:'0.0.123-1789190006-000000001',name:'CONSENSUSSUBMITMESSAGE',result:'SUCCESS',scheduled:false,entity_id:'0.0.456',consensus_timestamp:auditAnchor.consensusTimestamp}]});
  return baseFetch(url);
 });
 try{const prepared=await prepareHederaPublication({...paths,identityBuyerFile,htsFile,auditFile,auditPaymentFile});expect(prepared.release.hts).toEqual({transactionId,...terms});expect(prepared.release.audit).toEqual(auditAnchor);
  for(const change of [{requestId:'unrelated-request'},{evidenceDigest:'ab'.repeat(32)},{amountAtomic:'2'},{asset:'0.0.999'}]){await writeFile(auditPaymentFile,JSON.stringify({...auditPayment,...change}));await expect(prepareHederaPublication({...paths,identityBuyerFile,htsFile,auditFile,auditPaymentFile})).rejects.toThrow('supplied verified purchase');}
  const settled=dbState.payments[transactionId];for(const change of [{state:'pending'},{asset:'0.0.999'},{amount_atomic:2},{provider_id:'repo-economy'},{evidence:[{...evidence[0],description:'different token delivery'}]}]){dbState.payments[transactionId]={...settled,...change};await expect(prepareHederaPublication({...paths,identityBuyerFile,htsFile})).rejects.toThrow();}dbState.payments[transactionId]=settled;
  for(const secret of ['PRIVATE HTS REQUEST','PRIVATE SIGNED AUTH','PRIVATE RING KEY','RAW PRIVATE REPORT'])expect(JSON.stringify(prepared)).not.toContain(secret);
 }finally{await rm(dir,{recursive:true,force:true});}
});

it('rejects unauthenticated, altered or arbitrarily labeled offers even with a real payment',async()=>{
 const {dir,paths}=await fixture();mirror();try{
  const original=JSON.parse(await readFile(paths.a2aFile,'utf8'));
  for(const change of [{offerToken:'bogus.invalid'},{offerId:'arbitrary-public-offer'},{paymentRequestId:'arbitrary-payment-key'},{maxAmountAtomic:999},{contextId:'other-context'},{resourceUrl:'https://evil.example/resource'}]){
   await writeFile(paths.a2aFile,JSON.stringify({...original,offer:{...original.offer,...change}}));await expect(prepareHederaPublication(paths)).rejects.toThrow();
  }
  for(const change of [{contextId:'other-context'},{resourceUrl:'https://evil.example/resource'}]){await writeFile(paths.a2aFile,JSON.stringify({...original,result:{...original.result,...change}}));await expect(prepareHederaPublication(paths)).rejects.toThrow();}
 }finally{await rm(dir,{recursive:true,force:true});}
});
it('rejects settlement rows that do not bind the authenticated offer and actual delivery',async()=>{
 const {dir,paths}=await fixture();mirror();const original=dbState.row!;try{
  for(const change of [{offer_id:'unrelated-offer'},{offer_request_key:'unrelated-request'},{state:'pending'},{asset:'0.0.999'},{repos:['another/repo']},{evidence:[{...evidence[0],description:'different delivery'}]},{settlement:{success:true,network:'hedera:testnet',payer:'0.0.123',transaction:'0.0.123@1789190008.000000001'}}]){
   dbState.row={...original,...change};await expect(prepareHederaPublication(paths)).rejects.toThrow();
  }
  dbState.row=undefined;await expect(prepareHederaPublication(paths)).rejects.toThrow();
 }finally{await rm(dir,{recursive:true,force:true});}
});
it('compares stored JSONB delivery content independent of object key order',async()=>{
 const {dir,paths}=await fixture();mirror();try{
  dbState.row={...dbState.row!,evidence:evidence.map(entry=>Object.fromEntries(Object.entries(entry).reverse()))};
  await expect(prepareHederaPublication(paths)).resolves.toMatchObject({identityService:{uaid:identity.uaid}});
 }finally{await rm(dir,{recursive:true,force:true});}
});
