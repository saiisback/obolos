import { createHash, randomUUID } from 'node:crypto';
import type { AuditEvent, Mandate, Provider } from './contracts';

export function assessQuote(m: Mandate,p: Provider,units: number,spent: number) {
  const deny=(code:string,reason:string)=>({allowed:false,code,reason});
  if(!Number.isSafeInteger(units)||units<1||units>3||!Number.isSafeInteger(p.unitPriceAtomic)||p.unitPriceAtomic<=0||!Number.isSafeInteger(spent)||spent<0||!Number.isSafeInteger(p.unitPriceAtomic*units+spent)) return deny('invalid','Invalid quote units or amount.');
  if(!Number.isFinite(Date.parse(m.expiresAt))||Date.parse(m.expiresAt)<=Date.now()) return deny('expired','The spending mandate has expired.');
  if(p.network!=='hedera:testnet'||p.asset!=='HBAR') return deny('network','Only HBAR on Hedera testnet is approved.');
  if(!m.allowedProviders.includes(p.id)) return deny('provider','This provider is outside the approved mandate.');
  if(p.unitPriceAtomic>m.maxDataUnitPriceAtomic) return deny('price','The provider quote exceeds the approved price per repository.');
  if(spent+p.unitPriceAtomic*units>m.dataBudgetAtomic) return deny('budget','The purchase would exceed the remaining HBAR allowance.');
  return {allowed:true,code:'approved',reason:'Provider, unit price, expiry and total budget are within mandate.'};
}
function eventHash(event:Omit<AuditEvent,'hash'>){return createHash('sha256').update(JSON.stringify(event)).digest('hex');}
export function appendAudit(events:AuditEvent[],actor:AuditEvent['actor'],kind:AuditEvent['kind'],title:string,detail:string):AuditEvent[]{
 const entry:Omit<AuditEvent,'hash'>={id:randomUUID(),timestamp:new Date().toISOString(),actor,kind,title,detail,previousHash:events.at(-1)?.hash??'genesis'};
 return [...events,{...entry,hash:eventHash(entry)}];
}
export function verifyAudit(events:AuditEvent[]):boolean{
 let previous='genesis';
 for(const {hash,...event} of events){if(event.previousHash!==previous||eventHash(event)!==hash)return false;previous=hash;}
 return true;
}
