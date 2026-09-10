import {expect,it} from 'vitest';
import {privateKeyToAccount} from 'viem/accounts';
import {mandateMessage,validateSignedMandate} from '../src/lib/platform/execution-contracts';
import {verificationServiceSchema} from '../src/lib/market/contracts';
const wallet=privateKeyToAccount(`0x${'17'.repeat(32)}`);
const id='11111111-1111-4111-8111-111111111111';
const fields={id,agentId:'22222222-2222-4222-8222-222222222222',owner:wallet.address,origin:'https://obolos.example',repos:['openai/codex'],allowedProviders:['repo-standard'],dataBudgetAtomic:2000000,verificationBudgetAtomic:100000,maxDataUnitPriceAtomic:150000,maxRuns:2,expiresAt:'2026-09-10T01:00:00.000Z'};
const service={id,revision:1,name:'Verifier',recipient:wallet.address,priceAtomic:1000,endpoint:`${fields.origin}/api/market/services/${id}`};
const pin={...fields,now:new Date('2026-09-10T00:00:00.000Z')};
it('keeps hosted v2 snapshot and message free of added fields',async()=>{
 const snapshot=verificationServiceSchema.parse(service);expect(snapshot).toEqual(service);
 const message=mandateMessage({...fields,verificationService:snapshot});
 expect(message).toContain('mandate v2');expect(message).toContain(`Verification service: ${JSON.stringify(service)}`);expect(message).not.toContain('providerEndpoint');
 expect(await validateSignedMandate({...fields,verificationService:snapshot,message,signature:await wallet.signMessage({message})},pin)).toBe(true);
});
it('signs all v3 external execution fields and rejects endpoint or execution downgrades',async()=>{
 const selected={...service,execution:'external-repo-verifier' as const,providerEndpoint:'https://seller.example/verify'};
 const message=mandateMessage({...fields,verificationService:selected}),signature=await wallet.signMessage({message});
 expect(message).toContain('mandate v3');expect(await validateSignedMandate({...fields,verificationService:selected,message,signature},pin)).toBe(true);
 for(const changed of [{...selected,providerEndpoint:'https://other.example/verify'},{...selected,priceAtomic:2000},{...selected,execution:'hosted-metric-verifier'},service]){
  expect(await validateSignedMandate({...fields,verificationService:changed,message,signature},pin)).toBe(false);
 }
});
it('rejects unknown contract types and endpoint credentials before signing',()=>{
 for(const changed of [{...service,execution:'arbitrary-inference',providerEndpoint:'https://seller.example'},{...service,execution:'external-repo-verifier'},{...service,execution:'external-repo-verifier',providerEndpoint:'http://seller.example'},{...service,execution:'external-repo-verifier',providerEndpoint:'https://key:secret@seller.example'}])expect(verificationServiceSchema.safeParse(changed).success).toBe(false);
});
