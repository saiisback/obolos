import {createHash} from 'node:crypto';
import {canonicalAgentData,createUaid,type HcsAnchor,type HcsSubmitKey,type HederaAgentIdentity} from './identity';
const topicPattern=/^0\.0\.[1-9]\d*$/;
const timestampPattern=/^\d{10,}\.\d{9}$/;
const txPattern=/^0\.0\.[1-9]\d*(?:@\d{10,}\.\d{1,9}|-\d{10,}-\d{1,9})(?:\?scheduled)?$/;
function scheduledId(id:string):boolean {return id.endsWith('?scheduled');}
function paymentMirrorUrl(id:string):string {return `${HCS_MIRROR_BASE}/transactions/${normalizeHcsTransactionId(id)}`+(scheduledId(id)?'?scheduled=true':'?scheduled=false');}
export const HCS_MIRROR_BASE='https://testnet.mirrornode.hedera.com/api/v1';
export function normalizeHcsTransactionId(id:string):string {if(!txPattern.test(id))throw Error('Invalid Hedera transaction identity.');return id.replace(/\?scheduled$/,'').replace('@','-').replace(/\.(\d+)$/,'-$1');}
function compact(payload:unknown):string {const encoded=JSON.stringify(payload);if(Buffer.byteLength(encoded,'utf8')>1024)throw Error('Public HCS payload exceeds one message.');return encoded;}
function assertUaid(uaid:string):void {if(typeof uaid!=='string'||uaid.length>600||!/^uaid:aid:[1-9A-HJ-NP-Za-km-z]+;uid=[^;\s]+;registry=[^;\s]+;proto=[^;\s]+;nativeId=[^;\s]+(?:;domain=[^;\s]+)?$/.test(uaid))throw Error('Invalid public agent identity.');}
export function buildProfilePayload(identity:HederaAgentIdentity):string {
 const canonical=canonicalAgentData(identity.canonical);assertUaid(identity.uaid);
 // The hash root is invariant under routing hints; all canonical inputs remain public and recomputable.
 if(identity.uaid.split(';')[0]!==createUaid(canonical).split(';')[0])throw Error('Agent UAID does not match canonical profile.');
 return compact({p:'obolos.hcs-profile',v:1,uaid:identity.uaid,canonical});
}
export interface PaymentAuditInput {uaid:string;paymentTransactionId:string;network:string;asset:string;amountAtomic:string;payer:string;payTo:string;requestId:string;evidenceDigest:string}
/** Private caller supplies already-confirmed settlement. No job input or report enters HCS. */
export function buildPaymentAuditPayload(input:PaymentAuditInput):string {
 assertUaid(input.uaid);normalizeHcsTransactionId(input.paymentTransactionId);
 if(input.network!=='hedera:2'||!(input.asset==='HBAR'||topicPattern.test(input.asset))||!/^\d{1,20}$/.test(input.amountAtomic)||BigInt(input.amountAtomic)<=0n||!topicPattern.test(input.payer)||!topicPattern.test(input.payTo)||input.payer===input.payTo||typeof input.requestId!=='string'||!input.requestId||input.requestId.length>200||!/^([a-f0-9]{64})$/.test(input.evidenceDigest))throw Error('Invalid confirmed public payment audit.');
 return compact({p:'obolos.hcs-payment',v:1,uaid:input.uaid,transactionId:input.paymentTransactionId,network:input.network,asset:input.asset,amountAtomic:input.amountAtomic,payer:input.payer,payTo:input.payTo,requestHash:createHash('sha256').update(input.requestId).digest('hex'),evidenceDigest:input.evidenceDigest});
}
export function validateMirrorTopic(value:unknown,expected:{topicId?:string;submitKey:HcsSubmitKey}):void {
 const topic=value as {topic_id?:string;deleted?:boolean;submit_key?:HcsSubmitKey};
 if(!expected.topicId||!topicPattern.test(expected.topicId)||topic?.topic_id!==expected.topicId||topic.deleted!==false||!['ED25519','ECDSA_SECP256K1'].includes(expected.submitKey.type)||!(expected.submitKey.type==='ED25519'?/^[a-f0-9]{64}$/i:/^[a-f0-9]{66}$/i).test(expected.submitKey.key)||topic.submit_key?.type!==expected.submitKey.type||topic.submit_key?.key?.toLowerCase()!==expected.submitKey.key.toLowerCase())throw Error('Mirror topic is not bound to the expected restricted submit key.');
}
export function validateMirrorTopicMessage(value:unknown,expected:{topicId:string;sequenceNumber?:string;consensusTimestamp?:string;transactionId?:string;payload:string}):{sequenceNumber:string;consensusTimestamp:string} {
 const message=value as {topic_id?:string;sequence_number?:number|string;consensus_timestamp?:string;message?:string;chunk_info?:{initial_transaction_id?:string;number?:number;total?:number;nonce?:number;scheduled?:boolean}|null};
 const sequenceNumber=String(message?.sequence_number),consensusTimestamp=message?.consensus_timestamp??'';
 if(message?.topic_id!==expected.topicId||typeof message.sequence_number==='number'&&!Number.isSafeInteger(message.sequence_number)||!topicPattern.test(expected.topicId)||!/^\d+$/.test(sequenceNumber)||BigInt(sequenceNumber)<1n||!timestampPattern.test(consensusTimestamp)||expected.sequenceNumber&&sequenceNumber!==expected.sequenceNumber||expected.consensusTimestamp&&consensusTimestamp!==expected.consensusTimestamp||typeof message.message!=='string'||message.chunk_info&&(message.chunk_info.total!==1||message.chunk_info.number!==1||message.chunk_info.scheduled===true||Boolean(message.chunk_info.nonce)||typeof message.chunk_info.initial_transaction_id!=='string'||expected.transactionId&&message.chunk_info.initial_transaction_id!==normalizeHcsTransactionId(expected.transactionId))||Buffer.from(message.message,'base64').toString('base64')!==message.message||!Buffer.from(message.message,'base64').equals(Buffer.from(expected.payload,'utf8')))throw Error('Mirror message does not prove the exact bound HCS payload.');
 return {sequenceNumber,consensusTimestamp};
}
export function validateMirrorHcsTransaction(value:unknown,expected:{topicId:string;transactionId:string;consensusTimestamp:string}):void {
 const body=value as {transactions?:{transaction_id?:string;entity_id?:string;consensus_timestamp?:string;result?:string;name?:string;scheduled?:boolean}[]};
 const id=normalizeHcsTransactionId(expected.transactionId);
 if(!body?.transactions?.some(tx=>tx.transaction_id===id&&tx.entity_id===expected.topicId&&tx.consensus_timestamp===expected.consensusTimestamp&&tx.result==='SUCCESS'&&tx.name==='CONSENSUSSUBMITMESSAGE'&&tx.scheduled!==true))throw Error('Mirror transaction does not bind the successful HCS submission.');
}
async function mirrorJson(url:string):Promise<unknown> {const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('HCS mirror proof unavailable; reconcile the same transaction.');return response.json();}
export async function verifyHcsAnchor(anchor:HcsAnchor,payload:string,submitKey:HcsSubmitKey):Promise<HcsAnchor> {
 if(scheduledId(anchor.transactionId)||anchor.network!=='hedera:2'||!topicPattern.test(anchor.topicId)||!timestampPattern.test(anchor.consensusTimestamp)||!/^\d+$/.test(anchor.sequenceNumber))throw Error('Invalid HCS anchor.');
 const expectedUrl=`${HCS_MIRROR_BASE}/topics/${anchor.topicId}/messages/${anchor.sequenceNumber}`;
 if(anchor.mirrorUrl!==expectedUrl)throw Error('Untrusted HCS proof endpoint.');
 const results=await Promise.all([mirrorJson(`${HCS_MIRROR_BASE}/topics/${anchor.topicId}`),mirrorJson(expectedUrl),mirrorJson(`${HCS_MIRROR_BASE}/transactions/${normalizeHcsTransactionId(anchor.transactionId)}`)]);
 validateMirrorTopic(results[0],{topicId:anchor.topicId,submitKey});validateMirrorTopicMessage(results[1],{...anchor,payload});validateMirrorHcsTransaction(results[2],anchor);return anchor;
}
/** Read-only recovery of a lost HCS response; never generates a replacement submission. */
export async function recoverHcsAnchor(topicId:string,transactionId:string,payload:string,submitKey:HcsSubmitKey):Promise<HcsAnchor> {
 if(!topicPattern.test(topicId))throw Error('Invalid restricted HCS topic.');
 const transactions=await mirrorJson(`${HCS_MIRROR_BASE}/transactions/${normalizeHcsTransactionId(transactionId)}`) as {transactions?:{name?:string;result?:string;entity_id?:string;consensus_timestamp?:string}[]};
 const tx=transactions.transactions?.find(tx=>tx.name==='CONSENSUSSUBMITMESSAGE'&&tx.result==='SUCCESS'&&tx.entity_id===topicId);
 if(!tx?.consensus_timestamp||!timestampPattern.test(tx.consensus_timestamp))throw Error('HCS submission remains uncertain; reconcile the same identity.');
 const message=await mirrorJson(`${HCS_MIRROR_BASE}/topics/messages/${tx.consensus_timestamp}`);
 const proven=validateMirrorTopicMessage(message,{topicId,transactionId,consensusTimestamp:tx.consensus_timestamp,payload});
 const anchor:HcsAnchor={network:'hedera:2',topicId,transactionId,...proven,mirrorUrl:`${HCS_MIRROR_BASE}/topics/${topicId}/messages/${proven.sequenceNumber}`};
 return verifyHcsAnchor(anchor,payload,submitKey);
}

/** Anchoring is permitted only after independently proving the exact settlement identity and amounts. */
export function validateConfirmedAuditPayment(value:unknown,input:PaymentAuditInput):void {
 buildPaymentAuditPayload(input);
 const body=value as {transactions?:{transaction_id?:string;result?:string;name?:string;scheduled?:boolean;payer_account_id?:string;charged_tx_fee?:number;transfers?:{account:string;amount:number}[];token_transfers?:{token_id:string;account:string;amount:number}[]}[]};
 const transactionId=normalizeHcsTransactionId(input.paymentTransactionId),amount=BigInt(input.amountAtomic);
 const matches=body?.transactions?.some(tx=>{
  if(tx.transaction_id!==transactionId||tx.result!=='SUCCESS'||tx.name!=='CRYPTOTRANSFER'||Boolean(tx.scheduled)!==scheduledId(input.paymentTransactionId))return false;
  const transfers=input.asset==='HBAR'?tx.transfers:tx.token_transfers?.filter(t=>t.token_id===input.asset);
  if(!transfers||transfers.some(t=>!Number.isSafeInteger(t.amount)))return false;
  if(input.asset==='HBAR'&&tx.token_transfers?.length)return false;
  if(input.asset!=='HBAR'&&(tx.token_transfers?.some(t=>t.token_id!==input.asset||![input.payer,input.payTo].includes(t.account))))return false;
  const payerDebit=transfers.filter(t=>t.account===input.payer).reduce((sum,t)=>sum+BigInt(t.amount),0n),payeeCredit=transfers.filter(t=>t.account===input.payTo).reduce((sum,t)=>sum+BigInt(t.amount),0n);
  const payerFee=input.asset==='HBAR'&&tx.payer_account_id===input.payer&&Number.isSafeInteger(tx.charged_tx_fee)&&tx.charged_tx_fee!>=0?BigInt(tx.charged_tx_fee!):0n;
  return payerDebit===-amount-payerFee&&payeeCredit===amount;
 });
 if(!matches)throw Error('Payment audit requires the exact independently confirmed transfer.');
}
export async function verifyAuditPayment(input:PaymentAuditInput):Promise<void> {
 validateConfirmedAuditPayment(await mirrorJson(paymentMirrorUrl(input.paymentTransactionId)),input);
}

export function validateMirrorTopicCreation(value:unknown,transactionId:string):string {
 const body=value as {transactions?:{transaction_id?:string;name?:string;result?:string;entity_id?:string;scheduled?:boolean}[]};
 const id=normalizeHcsTransactionId(transactionId),tx=body?.transactions?.find(tx=>tx.transaction_id===id&&tx.name==='CONSENSUSCREATETOPIC'&&tx.result==='SUCCESS'&&tx.scheduled!==true&&typeof tx.entity_id==='string'&&topicPattern.test(tx.entity_id));
 if(!tx?.entity_id)throw Error('Original topic creation remains uncertain; no replacement is permitted.');return tx.entity_id;
}
/** Mirror fallback remains usable after the network's short receipt-retention window. */
export async function recoverCreatedTopic(transactionId:string,submitKey:HcsSubmitKey):Promise<string> {
 const topicId=validateMirrorTopicCreation(await mirrorJson(`${HCS_MIRROR_BASE}/transactions/${normalizeHcsTransactionId(transactionId)}`),transactionId);
 validateMirrorTopic(await mirrorJson(`${HCS_MIRROR_BASE}/topics/${topicId}`),{topicId,submitKey});return topicId;
}
