/** Operator-only testnet provisioning and finite native schedules. No keys enter the app. */
import {execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,open,readFile,rename} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {AccountCreateTransaction,AccountBalanceQuery,AccountId,Client,Hbar,PrivateKey,ScheduleCreateTransaction,ScheduleInfoQuery,TokenCreateTransaction,TokenSupplyType,TokenType,Transaction,TransactionId,TransactionReceiptQuery,TransferTransaction,Timestamp} from '@hiero-ledger/sdk';
import {decryptBrokerSecrets} from '../src/lib/integrations/ledger';
import type {HederaCredentials} from '../src/lib/integrations/hedera';
import {sql} from '../src/lib/platform/db';
import {validateSchedulePlan,scheduleMemo,type SchedulePlan} from '../src/lib/hedera/commerce';
import {executeDurableHcsOperation} from './hedera-register';
const mirror='https://testnet.mirrornode.hedera.com/api/v1';
function keyFor(c:HederaCredentials){return c.keyType==='ecdsa'?PrivateKey.fromStringECDSA(c.privateKey):c.keyType==='ed25519'?PrivateKey.fromStringED25519(c.privateKey):PrivateKey.fromString(c.privateKey);}
export async function privateWrite(file:string,value:unknown,exclusive=false){
 await mkdir(path.dirname(file),{recursive:true,mode:0o700});const tmp=exclusive?file:file+'.tmp',handle=await open(tmp,exclusive?'wx':'w',0o600);
 try{await handle.writeFile(JSON.stringify(value,null,2));await handle.sync();}finally{await handle.close();}
 if(!exclusive)await rename(tmp,file);const dir=await open(path.dirname(file),'r');try{await dir.sync();}finally{await dir.close();}
}
type EntityProof={transactionId:string;entityId:string;scheduledTransactionId?:string};
function normalize(id:string){return id.replace('@','-').replace(/\.(\d+)$/,'-$1');}
async function createEntity(label:string,transaction:Transaction,client:Client,key:PrivateKey,directory:string,fee=1):Promise<EntityProof>{
 const file=path.join(directory,label+'.json');
 return executeDurableHcsOperation(file,createHash('sha256').update(label+':'+client.operatorAccountId).digest('hex'),async()=>{
  transaction.setTransactionId(TransactionId.generate(client.operatorAccountId!)).setMaxTransactionFee(new Hbar(fee)).setTransactionValidDuration(120).freezeWith(client);await transaction.sign(key);
  return {transactionId:transaction.transactionId!.toString(),signedBytes:Buffer.from(transaction.toBytes()).toString('base64')};
 },async intent=>{
  const result=await Transaction.fromBytes(Buffer.from(intent.signedBytes,'base64')).execute(client),receipt=await result.getReceipt(client),id=receipt.accountId??receipt.tokenId??receipt.scheduleId;
  if(!id)throw Error('Entity creation remains uncertain.');
  return {transactionId:intent.transactionId,entityId:id.toString(),...(receipt.scheduledTransactionId?{scheduledTransactionId:receipt.scheduledTransactionId.toString()}:{})};
 },async intent=>{
  try{const receipt=await new TransactionReceiptQuery().setTransactionId(TransactionId.fromString(intent.transactionId)).execute(client),id=receipt.accountId??receipt.tokenId??receipt.scheduleId;
   if(id)return {transactionId:intent.transactionId,entityId:id.toString(),...(receipt.scheduledTransactionId?{scheduledTransactionId:receipt.scheduledTransactionId.toString()}:{})};
  }catch{/* Read the same consensus identity only. */}
  const response=await fetch(`${mirror}/transactions/${normalize(intent.transactionId)}`,{signal:AbortSignal.timeout(15000),redirect:'error'});
  const body=await response.json() as {transactions?:{transaction_id:string;result:string;entity_id:string}[]};
  const tx=body.transactions?.find(t=>t.transaction_id===normalize(intent.transactionId)&&t.result==='SUCCESS'&&/^0\.0\.[1-9]\d*$/.test(t.entity_id));
  if(!tx)throw Error('Existing transaction is not confirmed; do not create another.');
  if(label.startsWith('schedule-')){
   const info=await new ScheduleInfoQuery().setScheduleId(tx.entity_id).execute(client);
   if(!info.scheduledTransactionId)throw Error('Scheduled transaction identity is not confirmed.');
   return {transactionId:intent.transactionId,entityId:tx.entity_id,scheduledTransactionId:info.scheduledTransactionId.toString()};
  }
  return {transactionId:intent.transactionId,entityId:tx.entity_id};
 });
}
export async function provisionTestCredits(credentials:HederaCredentials,directory:string,retryTokenFee=false){
 const key=keyFor(credentials),client=Client.forTestnet().setOperator(credentials.accountId,key).setMaxAttempts(1);
 try{
  const balance=await new AccountBalanceQuery().setAccountId(credentials.accountId).execute(client);
  let tokenLabel='token',tokenFee=10;
  if(retryTokenFee){
   const original=JSON.parse(await readFile(path.join(directory,'token.json'),'utf8')) as {transactionId:string};
   const response=await fetch(`${mirror}/transactions/${normalize(original.transactionId)}`,{signal:AbortSignal.timeout(15000),redirect:'error'});
   if(!response.ok)throw Error('Original token failure must be proven before changing the fee cap.');
   const body=await response.json() as {transactions?:{transaction_id:string;result:string;entity_id:string|null}[]};
   if(!body.transactions?.some(t=>t.transaction_id===normalize(original.transactionId)&&t.result==='INSUFFICIENT_TX_FEE'&&t.entity_id===null))throw Error('Only a definitive no-token insufficient-fee failure permits this retry.');
   tokenLabel='token-fee-retry';tokenFee=50;
  }
  const knownRecipient=await readFile(path.join(directory,'recipient.json'),'utf8').then(()=>true,()=>false);
  const knownToken=await readFile(path.join(directory,tokenLabel+'.json'),'utf8').then(()=>true,()=>false);
  const required=(knownRecipient?0:2)+(knownToken?0:tokenFee);
  if(balance.hbars.toTinybars().toNumber()<required*100000000)throw Error('Insufficient test HBAR for remaining capped provisioning operations.');
  const keyFile=path.join(directory,'service-recipient-private.json');let secret:{privateKey:string};
  try{secret=JSON.parse(await readFile(keyFile,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;secret={privateKey:PrivateKey.generateED25519().toStringDer()};await privateWrite(keyFile,secret,true);}
  const recipientKey=PrivateKey.fromString(secret.privateKey);
  const recipient=await createEntity('recipient',new AccountCreateTransaction().setKeyWithoutAlias(recipientKey.publicKey).setInitialBalance(new Hbar(1)).setMaxAutomaticTokenAssociations(2).setAccountMemo('Obolos testnet service recipient'),client,key,directory);
  const token=await createEntity(tokenLabel,new TokenCreateTransaction().setTokenName('Obolos Test Service Credits').setTokenSymbol('OTEST').setDecimals(0).setInitialSupply(1000).setMaxSupply(1000).setSupplyType(TokenSupplyType.Finite).setTokenType(TokenType.FungibleCommon).setTreasuryAccountId(credentials.accountId).setTokenMemo('Testnet service credits only; no monetary value'),client,key,directory,tokenFee);
  const config={asset:token.entityId,payTo:recipient.entityId,unitPriceAtomic:1,decimals:0,symbol:'OTEST',network:'hedera:testnet'};
  await privateWrite(path.join(directory,'token-public.json'),{...config,tokenCreation:token,recipientCreation:recipient});
  await sql()`INSERT INTO platform_hedera_config(id,value) VALUES('hts',${JSON.stringify(config)}::jsonb) ON CONFLICT(id) DO UPDATE SET value=excluded.value,updated_at=now()`;
  return {config,tokenCreation:token,recipientCreation:recipient};
 }finally{client.close();}
}
export async function createPaymentSchedules(input:SchedulePlan,credentials:HederaCredentials,directory:string){
 const file=path.join(directory,'schedule-plan.json');
 let existing:SchedulePlan|undefined;try{existing=JSON.parse(await readFile(file,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 const plan=validateSchedulePlan(input,Date.now(),Boolean(existing));
 if(plan.payer!==credentials.accountId||plan.payTo!==process.env.HEDERA_PAY_TO)throw Error('Schedule differs from configured payer/service.');
 if(existing&&JSON.stringify(existing)!==JSON.stringify(plan))throw Error('Schedule identity already has different terms.');
 if(!existing)await privateWrite(file,plan,true);
 const key=keyFor(credentials),client=Client.forTestnet().setOperator(credentials.accountId,key).setMaxAttempts(1),results:EntityProof[]=[];
 try{for(let round=0;round<plan.count;round++){
  const label=`schedule-${round}`,due=Date.parse(plan.firstExecutionAt)+round*plan.intervalSeconds*1000;
  const known=await readFile(path.join(directory,label+'.json'),'utf8').then(()=>true,()=>false);
  if(!known&&due<Date.now()+10000)throw Error('Schedule deadline passed before creation; stop without backdating payment.');
  const amount=plan.unitPriceAtomic*plan.repos.length,memo=scheduleMemo(plan,round);
  const transfer=new TransferTransaction().addHbarTransfer(plan.payer,Hbar.fromTinybars(-amount)).addHbarTransfer(plan.payTo,Hbar.fromTinybars(amount)).setTransactionMemo(memo).setMaxTransactionFee(new Hbar(1));
  const tx=new ScheduleCreateTransaction().setScheduledTransaction(transfer).setScheduleMemo(memo).setPayerAccountId(AccountId.fromString(plan.payer)).setAdminKey(key.publicKey).setExpirationTime(Timestamp.fromDate(new Date(due))).setWaitForExpiry(true);
  results.push(await createEntity(label,tx,client,key,directory));
  await privateWrite(path.join(directory,'schedules-public.json'),{plan,schedules:results.map((r,i)=>({round:i,scheduleId:r.entityId,transactionId:r.transactionId,scheduledTransactionId:r.scheduledTransactionId}))});
 }return {plan,schedules:results};}finally{client.close();}
}
async function main(){
 const mode=process.argv[2],directory=path.resolve(process.env.BROKER_DATA_DIR??'data/broker','hedera-bonus');
 if(mode==='deliver'){
  const saved=JSON.parse(await readFile(path.join(directory,'schedules-public.json'),'utf8')) as {plan:SchedulePlan;schedules:{round:number;scheduleId:string;transactionId:string;scheduledTransactionId?:string}[]};
  const base=new URL(process.env.DATA_SERVICE_URL??'');if(base.protocol!=='https:'||base.hostname!=='obolos.app')throw Error('Pin public Obolos service.');
  const results=[];for(const schedule of saved.schedules){const response=await fetch(new URL('/x402/scheduled/evidence',base),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({plan:saved.plan,round:schedule.round,scheduleId:schedule.scheduleId}),signal:AbortSignal.timeout(60000),redirect:'error'});const body=await response.json();if(!response.ok)throw Error('Scheduled delivery awaits confirmed proof or source recovery.');results.push({...schedule,...body});await privateWrite(path.join(directory,'scheduled-results.json'),results);}
  console.log(JSON.stringify({delivered:results.length,scheduleIds:saved.schedules.map(s=>s.scheduleId)}));return;
 }
 const pass=process.env.WALLET_PASS||execFileSync('security',['find-generic-password','-s','obolos-speculos-ring-password','-w'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 const {hedera}=await decryptBrokerSecrets({...process.env,WALLET_PASS:pass});
 if(mode==='provision'){console.log(JSON.stringify(await provisionTestCredits(hedera,directory,process.argv.includes('--retry-token-fee'))));return;}
 if(mode==='schedule'){
  let plan:SchedulePlan;try{plan=JSON.parse(await readFile(path.join(directory,'schedule-plan.json'),'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;const quote=await fetch(new URL('/x402/quote',process.env.DATA_SERVICE_URL),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({providerId:'repo-standard',repos:['octocat/Hello-World']}),redirect:'error',signal:AbortSignal.timeout(15000)});if(!quote.ok)throw Error('Live quote required.');const q=await quote.json();plan={id:randomUUID(),payer:hedera.accountId,payTo:q.payTo,repos:['octocat/Hello-World'],unitPriceAtomic:q.unitPriceAtomic,count:2,intervalSeconds:30,firstExecutionAt:new Date(Math.ceil((Date.now()+180000)/1000)*1000).toISOString(),maxTotalAtomic:1000000};}
  console.log(JSON.stringify(await createPaymentSchedules(plan,hedera,directory)));return;
 }
 throw Error('Use provision, schedule or deliver.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(()=>{console.error('Hedera commerce operation not confirmed. Preserve private journals and reconcile the original identity.');process.exitCode=1;});
