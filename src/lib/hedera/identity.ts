import {createHash} from 'node:crypto';

/** HCS-14 draft, retrieved 2026-09-12. Only these six public fields define the AID. */
export interface CanonicalAgentData {registry:string;name:string;version:string;protocol:string;nativeId:string;skills:number[]}
export interface HcsSubmitKey {type:'ED25519'|'ECDSA_SECP256K1';key:string}
export interface HcsAnchor {network:'hedera:2';topicId:string;transactionId:string;sequenceNumber:string;consensusTimestamp:string;mirrorUrl:string}
export interface HederaAgentIdentity {version:1;canonical:CanonicalAgentData;uaid:string;submitKey:HcsSubmitKey;topicId?:string;profileAnchor?:HcsAnchor}
export function canonicalAgentData(input:CanonicalAgentData):CanonicalAgentData {
 const strings:Record<string,string>={};
 for(const field of ['registry','name','version','protocol','nativeId'] as const){
  if(typeof input?.[field]!=='string'||!input[field].trim()||input[field].length>500)throw Error('HCS-14 identity requires bounded nonempty public strings.');
  strings[field]=input[field].trim();
 }
 if(!Array.isArray(input.skills)||input.skills.length>64||input.skills.some(n=>!Number.isSafeInteger(n)||n<0||(n>=40&&n<100)))throw Error('HCS-14 skills must be core or OASF integer IDs.');
 // Insertion order is normative alphabetical order, regardless of illustrative vector formatting.
 return {name:strings.name,nativeId:strings.nativeId,protocol:strings.protocol.toLowerCase(),registry:strings.registry.toLowerCase(),skills:[...input.skills].sort((a,b)=>a-b),version:strings.version};
}
function base58(bytes:Uint8Array):string {
 const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
 let value=BigInt('0x'+Buffer.from(bytes).toString('hex')),encoded='';
 while(value>0n){encoded=alphabet[Number(value%58n)]+encoded;value/=58n;}
 for(const byte of bytes){if(byte!==0)break;encoded='1'+encoded;}
 return encoded;
}
function parameter(value:string):string {
 if(!value||value.length>500||/[;\s?#%\u0000-\u001f]/u.test(value))throw Error('Invalid HCS-14 routing parameter.');
 return value;
}
export function createUaid(input:CanonicalAgentData,routing:{uid?:string;domain?:string}={}):string {
 const canonical=canonicalAgentData(input),hash=base58(createHash('sha384').update(JSON.stringify(canonical),'utf8').digest());
 return `uaid:aid:${hash};uid=${parameter(routing.uid??'0')};registry=${parameter(canonical.registry)};proto=${parameter(canonical.protocol)};nativeId=${parameter(canonical.nativeId)}`+(routing.domain?`;domain=${parameter(routing.domain)}`:'');
}
