import {describe,it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {buildPaymentAuditPayload,buildProfilePayload,validateMirrorTopic,validateMirrorTopicMessage,validateMirrorHcsTransaction} from '../src/lib/hedera/audit';
import {canonicalAgentData,createUaid} from '../src/lib/hedera/identity';
const canonical=canonicalAgentData({registry:'obolos',name:'Buyer',version:'1.0.0',protocol:'rest',nativeId:'hedera:testnet:0.0.123',skills:[17,33]});
const identity={version:1 as const,canonical,uaid:createUaid(canonical),topicId:'0.0.456',submitKey:{type:'ED25519' as const,key:'aa'.repeat(32)}};
const payment={uaid:identity.uaid,paymentTransactionId:'0.0.123@1789190000.000000001',network:'hedera:2',asset:'HBAR',amountAtomic:'100',payer:'0.0.123',payTo:'0.0.789',requestId:'private-job-input',evidenceDigest:'ab'.repeat(32)};
describe('public HCS audit proof',()=>{
 it('publishes allowlisted hashes and transfer references only',()=>{
  const payload=buildPaymentAuditPayload({...payment,report:'PRIVATE REPORT',privateKey:'SECRET'} as typeof payment);
  expect(payload).not.toContain('private-job-input');expect(payload).not.toContain('PRIVATE REPORT');expect(payload).not.toContain('SECRET');
  expect(JSON.parse(payload).requestHash).toBe(createHash('sha256').update(payment.requestId).digest('hex'));
  expect(Buffer.byteLength(payload)).toBeLessThanOrEqual(1024);
  expect(JSON.parse(buildProfilePayload(identity)).uaid).toBe(identity.uaid);
 });
 it('rejects wrong network, invalid digest and unbounded payloads',()=>{
  expect(()=>buildPaymentAuditPayload({...payment,network:'hedera:mainnet'})).toThrow();
  expect(()=>buildPaymentAuditPayload({...payment,evidenceDigest:'report'})).toThrow();
  expect(()=>buildProfilePayload({...identity,canonical:{...canonical,name:'x'.repeat(2000)}})).toThrow();
 });
 it('requires the bound restricted submit key',()=>{
  const topic={topic_id:'0.0.456',deleted:false,submit_key:identity.submitKey};
  expect(()=>validateMirrorTopic(topic,identity)).not.toThrow();
  expect(()=>validateMirrorTopic({...topic,submit_key:null},identity)).toThrow();
  expect(()=>validateMirrorTopic({...topic,topic_id:'0.0.999'},identity)).toThrow();
  expect(()=>validateMirrorTopic({...topic,submit_key:{...identity.submitKey,key:'bb'.repeat(32)}},identity)).toThrow();
 });
 it('binds exact bytes, topic, sequence and consensus timestamp',()=>{
  const payload=buildPaymentAuditPayload(payment);const expected={topicId:'0.0.456',sequenceNumber:'2',consensusTimestamp:'1789190001.000000002',payload};
  const message={topic_id:expected.topicId,sequence_number:2,consensus_timestamp:expected.consensusTimestamp,message:Buffer.from(payload).toString('base64')};
  expect(validateMirrorTopicMessage(message,expected)).toEqual({sequenceNumber:'2',consensusTimestamp:expected.consensusTimestamp});
  for(const change of [{topic_id:'0.0.999'},{sequence_number:3},{consensus_timestamp:'1789190002.000000002'},{message:Buffer.from('{}').toString('base64')}])expect(()=>validateMirrorTopicMessage({...message,...change},expected)).toThrow();
 });
 it('requires the exact successful submission transaction bound to the same topic timestamp',()=>{
  const expected={topicId:'0.0.456',transactionId:'0.0.123@1789190000.000000001',consensusTimestamp:'1789190001.000000002'};
  const tx={transaction_id:'0.0.123-1789190000-000000001',entity_id:expected.topicId,consensus_timestamp:expected.consensusTimestamp,result:'SUCCESS',name:'CONSENSUSSUBMITMESSAGE'};
  expect(()=>validateMirrorHcsTransaction({transactions:[tx]},expected)).not.toThrow();
  for(const change of [{transaction_id:'0.0.123-1789180000-000000001'},{entity_id:'0.0.999'},{result:'FAIL_INVALID'},{name:'CRYPTOTRANSFER'},{consensus_timestamp:'1789190002.000000002'}])expect(()=>validateMirrorHcsTransaction({transactions:[{...tx,...change}]},expected)).toThrow();
 });
});

import {validateConfirmedAuditPayment} from '../src/lib/hedera/audit';
it('requires exact native or token payment proof before public anchoring',()=>{
 const native={transaction_id:'0.0.123-1789190000-000000001',result:'SUCCESS',name:'CRYPTOTRANSFER',transfers:[{account:'0.0.123',amount:-100},{account:'0.0.789',amount:100}],token_transfers:[]};
 expect(()=>validateConfirmedAuditPayment({transactions:[native]},payment)).not.toThrow();
 expect(()=>validateConfirmedAuditPayment({transactions:[{...native,transaction_id:'0.0.123-1789180000-000000001'}]},payment)).toThrow();
 expect(()=>validateConfirmedAuditPayment({transactions:[{...native,transfers:[{account:'0.0.123',amount:-101},{account:'0.0.789',amount:100}]}]},payment)).toThrow();
 const token={...payment,asset:'0.0.456'};
 const tx={...native,transfers:[],token_transfers:[{token_id:token.asset,account:token.payer,amount:-100},{token_id:token.asset,account:token.payTo,amount:100}]};
 expect(()=>validateConfirmedAuditPayment({transactions:[tx]},token)).not.toThrow();
 expect(()=>validateConfirmedAuditPayment({transactions:[{...tx,token_transfers:tx.token_transfers.map(t=>({...t,token_id:'0.0.999'}))}]},token)).toThrow();
});

it('rejects unsafe numeric sequence values and keys with the wrong key-type length',()=>{
 expect(()=>validateMirrorTopic({topic_id:'0.0.456',deleted:false,submit_key:{type:'ED25519',key:'aa'.repeat(33)}},{topicId:'0.0.456',submitKey:{type:'ED25519',key:'aa'.repeat(33)}})).toThrow();
 const payload='{}';
 expect(()=>validateMirrorTopicMessage({topic_id:'0.0.456',sequence_number:Number.MAX_SAFE_INTEGER+1,consensus_timestamp:'1789190001.000000002',message:Buffer.from(payload).toString('base64')},{topicId:'0.0.456',payload})).toThrow();
});

import {validateMirrorTopicCreation} from '../src/lib/hedera/audit';
it('recovers a topic only from the original successful creation transaction',()=>{
 const transactionId='0.0.123@1789190000.000000001';
 const tx={transaction_id:'0.0.123-1789190000-000000001',result:'SUCCESS',name:'CONSENSUSCREATETOPIC',entity_id:'0.0.456'};
 expect(validateMirrorTopicCreation({transactions:[tx]},transactionId)).toBe('0.0.456');
 for(const change of [{name:'CONSENSUSSUBMITMESSAGE'},{transaction_id:'0.0.123-1789180000-000000001'},{result:'FAIL_INVALID'},{entity_id:null}])expect(()=>validateMirrorTopicCreation({transactions:[{...tx,...change}]},transactionId)).toThrow();
});

it('accepts SDK single-chunk metadata while rejecting multipart or unrelated chunk identity',()=>{
 const payload='{}',transactionId='0.0.123@1789190000.000000001';
 const expected={topicId:'0.0.456',transactionId,payload};
 const message={topic_id:expected.topicId,sequence_number:1,consensus_timestamp:'1789190001.000000002',message:Buffer.from(payload).toString('base64'),chunk_info:{initial_transaction_id:'0.0.123-1789190000-000000001',number:1,total:1,scheduled:false,nonce:0}};
 expect(()=>validateMirrorTopicMessage(message,expected)).not.toThrow();
 for(const change of [{total:2},{number:2},{initial_transaction_id:'0.0.123-1789180000-000000001'},{scheduled:true}])expect(()=>validateMirrorTopicMessage({...message,chunk_info:{...message.chunk_info,...change}},expected)).toThrow();
});

it('allows only independently identified native payer fees and scheduled identity',()=>{
 const tx={transaction_id:'0.0.123-1789190000-000000001',result:'SUCCESS',name:'CRYPTOTRANSFER',payer_account_id:'0.0.123',charged_tx_fee:20,transfers:[{account:payment.payer,amount:-120},{account:payment.payTo,amount:100},{account:'0.0.98',amount:20}],token_transfers:[]};
 expect(()=>validateConfirmedAuditPayment({transactions:[tx]},payment)).not.toThrow();
 expect(()=>validateConfirmedAuditPayment({transactions:[{...tx,charged_tx_fee:19}]},payment)).toThrow();
 expect(()=>validateConfirmedAuditPayment({transactions:[{...tx,payer_account_id:'0.0.999'}]},payment)).toThrow();
 const scheduled={...payment,paymentTransactionId:payment.paymentTransactionId+'?scheduled'};
 expect(()=>validateConfirmedAuditPayment({transactions:[{...tx,scheduled:true}]},scheduled)).not.toThrow();
 expect(()=>validateConfirmedAuditPayment({transactions:[tx]},scheduled)).toThrow();
 expect(()=>validateConfirmedAuditPayment({transactions:[{...tx,scheduled:true}]},payment)).toThrow();
});

it('verifies current live mirror key and single-chunk transaction object schemas',()=>{
 const submitKey={type:'ECDSA_SECP256K1' as const,key:'02482fd151ea15e70f787272c9bbd101d677f772c9c6e232e166179b55e51de950'};
 const topicId='0.0.10507462',transactionId='0.0.10413599@1789238201.419043115',payload='{"public":"profile"}';
 expect(()=>validateMirrorTopic({topic_id:topicId,deleted:false,submit_key:{_type:submitKey.type,key:submitKey.key}},{topicId,submitKey})).not.toThrow();
 const message={topic_id:topicId,sequence_number:1,consensus_timestamp:'1789238208.945806750',message:Buffer.from(payload).toString('base64'),chunk_info:{initial_transaction_id:{account_id:'0.0.10413599',transaction_valid_start:'1789238201.419043115',nonce:0,scheduled:false},number:1,total:1}};
 expect(()=>validateMirrorTopicMessage(message,{topicId,transactionId,payload})).not.toThrow();
 for(const change of [{account_id:'0.0.999'},{transaction_valid_start:'1789238200.419043115'},{nonce:1},{scheduled:true}])expect(()=>validateMirrorTopicMessage({...message,chunk_info:{...message.chunk_info,initial_transaction_id:{...message.chunk_info.initial_transaction_id,...change}}},{topicId,transactionId,payload})).toThrow();
 expect(()=>validateMirrorTopic({topic_id:topicId,deleted:false,submit_key:{_type:'ED25519',type:submitKey.type,key:submitKey.key}},{topicId,submitKey})).toThrow();
});
