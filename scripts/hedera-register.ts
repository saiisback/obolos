/** Private testnet operator. Ring plaintext and signed transaction bytes never leave private state. */
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,open,readFile,rename} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {Client,Hbar,PrivateKey,TopicCreateTransaction,TopicMessageSubmitTransaction,Transaction,TransactionId,TransactionReceiptQuery,type TransactionReceipt} from '@hiero-ledger/sdk';
import {decryptBrokerSecrets} from '../src/lib/integrations/ledger';
import type {HederaCredentials} from '../src/lib/integrations/hedera';
import {canonicalAgentData,createUaid,type HcsAnchor,type HederaAgentIdentity} from '../src/lib/hedera/identity';
import {buildPaymentAuditPayload,buildProfilePayload,recoverHcsAnchor,recoverCreatedTopic,verifyHcsAnchor,verifyAuditPayment,type PaymentAuditInput} from '../src/lib/hedera/audit';
import {acquireProcessLock} from './process-lock';
interface SignedIntent {transactionId:string;signedBytes:string}
interface Journal<T> extends SignedIntent {version:1;fingerprint:string;createdAt:string;result?:T}
async function durableWrite(filename:string,value:unknown,exclusive=false):Promise<void> {
 await mkdir(path.dirname(filename),{recursive:true,mode:0o700});
 const temporary=exclusive?filename:`${filename}.${process.pid}.tmp`,file=await open(temporary,exclusive?'wx':'w',0o600);
 try{await file.writeFile(JSON.stringify(value));await file.sync();}finally{await file.close();}
 if(!exclusive)await rename(temporary,filename);
 const directory=await open(path.dirname(filename),'r');try{await directory.sync();}finally{await directory.close();}
}
/** Existing intent always goes through read-only recovery, even if its earlier response was lost. */
export async function executeDurableHcsOperation<T>(filename:string,fingerprint:string,prepare:()=>Promise<SignedIntent>,dispatch:(intent:SignedIntent)=>Promise<T>,recover:(intent:SignedIntent)=>Promise<T>):Promise<T> {
 const unlock=await acquireProcessLock(filename+'.lock');
 try{
  let existing:Journal<T>|undefined;
  try{existing=JSON.parse(await readFile(filename,'utf8'));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  if(existing){
   if(existing.fingerprint!==fingerprint)throw Error('HCS operation identity was reused with different terms.');
   const result=await recover(existing);await durableWrite(filename,{...existing,result});return result;
  }
  const signed=await prepare(),intent:Journal<T>={version:1,fingerprint,createdAt:new Date().toISOString(),...signed};
  await durableWrite(filename,intent,true);
  const result=await dispatch(intent);await durableWrite(filename,{...intent,result});return result;
 }finally{await unlock();}
}
function keyFor(credentials:HederaCredentials):PrivateKey {
 return credentials.keyType==='ecdsa'?PrivateKey.fromStringECDSA(credentials.privateKey):credentials.keyType==='ed25519'?PrivateKey.fromStringED25519(credentials.privateKey):PrivateKey.fromString(credentials.privateKey);
}
function privateClient(credentials:HederaCredentials):{client:Client;key:PrivateKey} {
 if(process.env.HEDERA_NETWORK&&process.env.HEDERA_NETWORK!=='hedera:2')throw Error('HCS operator is testnet only.');
 const key=keyFor(credentials),client=Client.forTestnet().setOperator(credentials.accountId,key).setDefaultMaxTransactionFee(new Hbar(1)).setMaxAttempts(1);
 return {client,key};
}
function fingerprint(value:unknown):string {return createHash('sha256').update(JSON.stringify(value)).digest('hex');}
async function prepareTransaction(transaction:Transaction,client:Client,key:PrivateKey):Promise<SignedIntent> {
 transaction.setTransactionId(TransactionId.generate(client.operatorAccountId!)).setMaxTransactionFee(new Hbar(1)).setTransactionValidDuration(120).freezeWith(client);
 await transaction.sign(key);
 return {transactionId:transaction.transactionId!.toString(),signedBytes:Buffer.from(transaction.toBytes()).toString('base64')};
}
async function receiptFor(intent:SignedIntent,client:Client):Promise<TransactionReceipt> {
 return new TransactionReceiptQuery().setTransactionId(TransactionId.fromString(intent.transactionId)).execute(client);
}
export async function registerAgentProfile(role:'service'|'buyer',credentials:HederaCredentials,directory=path.resolve(process.env.BROKER_DATA_DIR??'data/broker','hedera')):Promise<HederaAgentIdentity> {
 const {client,key}=privateClient(credentials),identityFile=path.join(directory,`identity-${role}.json`),unlock=await acquireProcessLock(identityFile+'.lock');
 try{
  const canonical=canonicalAgentData({registry:'obolos',name:role==='service'?'Obolos Repository Service':'Obolos Repository Buyer',version:'1.0.0',protocol:'a2a',nativeId:`hedera:testnet:${credentials.accountId}`,skills:role==='service'?[7,17,20,33]:[10,16,17,33]});
  const submitKey={type:key.publicKey.type==='ED25519'?'ED25519' as const:'ECDSA_SECP256K1' as const,key:key.publicKey.toStringRaw()};
  let identity:HederaAgentIdentity;
  try{identity=JSON.parse(await readFile(identityFile,'utf8'));if(identity.uaid!==createUaid(canonical,{uid:role})||JSON.stringify(identity.submitKey)!==JSON.stringify(submitKey))throw Error('Persisted agent identity differs from this operator.');}
  catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;identity={version:1,canonical,uaid:createUaid(canonical,{uid:role}),submitKey};await durableWrite(identityFile,identity,true);}
  if(!identity.topicId){
   const topicId=await executeDurableHcsOperation(path.join(directory,`topic-${role}.json`),fingerprint({uaid:identity.uaid,submitKey}),()=>prepareTransaction(new TopicCreateTransaction().setSubmitKey(key.publicKey).setAdminKey(key.publicKey).setTopicMemo(`obolos:${role}:hcs14:v1`),client,key),async intent=>{
    const response=await Transaction.fromBytes(Buffer.from(intent.signedBytes,'base64')).execute(client),receipt=await response.getReceipt(client);
    if(!receipt.topicId)throw Error('Topic creation response remains uncertain.');return receipt.topicId.toString();
   },async intent=>{try{const receipt=await receiptFor(intent,client);if(receipt.topicId)return receipt.topicId.toString();}catch{/* Expired or delayed receipts use the same mirror transaction identity. */}return recoverCreatedTopic(intent.transactionId,submitKey);});
   identity={...identity,topicId};await durableWrite(identityFile,identity);
  }
  const payload=buildProfilePayload(identity);
  const profileAnchor=await submitPayload(identity,payload,path.join(directory,`profile-${role}.json`),client,key);
  identity={...identity,profileAnchor};await durableWrite(identityFile,identity);return identity;
 }finally{await unlock();client.close();}
}
async function submitPayload(identity:HederaAgentIdentity,payload:string,journal:string,client:Client,key:PrivateKey):Promise<HcsAnchor> {
 if(!identity.topicId)throw Error('Agent has no registered restricted topic.');
 const topicId=identity.topicId;
 return executeDurableHcsOperation(journal,fingerprint({topicId,submitKey:identity.submitKey,payload}),()=>prepareTransaction(new TopicMessageSubmitTransaction().setTopicId(topicId).setMessage(payload),client,key),async intent=>{
  const response=await Transaction.fromBytes(Buffer.from(intent.signedBytes,'base64')).execute(client);
  await response.getReceipt(client);
  // Mirror indexing may lag. Retain the intent if unavailable; the next run only verifies it.
  return recoverHcsAnchor(topicId,intent.transactionId,payload,identity.submitKey);
 },intent=>recoverHcsAnchor(topicId,intent.transactionId,payload,identity.submitKey));
}
/** Invoke after the existing private buyer has obtained real evidence and settlement. */
export async function anchorPaymentAudit(identity:HederaAgentIdentity,payment:PaymentAuditInput,credentials:HederaCredentials,directory=path.resolve(process.env.BROKER_DATA_DIR??'data/broker','hedera')):Promise<HcsAnchor> {
 if(identity.uaid!==payment.uaid||!identity.profileAnchor)throw Error('Payment audit must use a chain-anchored agent identity.');
 await verifyHcsAnchor(identity.profileAnchor,buildProfilePayload(identity),identity.submitKey);
 await verifyAuditPayment(payment);
 const {client,key}=privateClient(credentials);
 try{
  if(key.publicKey.toStringRaw().toLowerCase()!==identity.submitKey.key.toLowerCase())throw Error('Operator cannot submit to this identity topic.');
  return await submitPayload(identity,buildPaymentAuditPayload(payment),path.join(directory,'payment-'+fingerprint({transactionId:payment.paymentTransactionId,uaid:payment.uaid})+'.json'),client,key);
 }finally{client.close();}
}
async function main():Promise<void> {
 const [mode,roleArg,...args]=process.argv.slice(2),role=roleArg??'service';
 if(role!=='service'&&role!=='buyer')throw Error('Expected service or buyer identity.');
 const directory=path.resolve(process.env.BROKER_DATA_DIR??'data/broker','hedera');
 if(mode==='verify'){
  const identity=JSON.parse(await readFile(path.join(directory,`identity-${role}.json`),'utf8')) as HederaAgentIdentity;
  if(!identity.profileAnchor)throw Error('Agent profile is not yet confirmed.');
  await verifyHcsAnchor(identity.profileAnchor,buildProfilePayload(identity),identity.submitKey);
  console.log(JSON.stringify({uaid:identity.uaid,topicId:identity.topicId,profileAnchor:identity.profileAnchor}));return;
 }
 if(mode!=='register'&&mode!=='anchor-payment')throw Error('Expected register, verify or anchor-payment.');
 const pass=process.env.WALLET_PASS||execFileSync('security',['find-generic-password','-s','obolos-speculos-ring-password','-w'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 const secrets=await decryptBrokerSecrets({...process.env,WALLET_PASS:pass});
 if(mode==='register'){
  const identity=await registerAgentProfile(role,secrets.hedera,directory);
  console.log(JSON.stringify({uaid:identity.uaid,topicId:identity.topicId,submitKey:identity.submitKey,profileAnchor:identity.profileAnchor}));return;
 }
 const index=args.indexOf('--payment-file');if(index<0||!args[index+1])throw Error('Private confirmed payment file required.');
 const identity=JSON.parse(await readFile(path.join(directory,`identity-${role}.json`),'utf8')) as HederaAgentIdentity;
 const payment=JSON.parse(await readFile(path.resolve(args[index+1]),'utf8')) as PaymentAuditInput;
 const anchor=await anchorPaymentAudit(identity,payment,secrets.hedera,directory);
 console.log(JSON.stringify({uaid:identity.uaid,paymentTransactionId:payment.paymentTransactionId,auditAnchor:anchor}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(()=>{console.error('HCS operator could not confirm the operation; reconcile the persisted transaction before retrying.');process.exitCode=1;});
