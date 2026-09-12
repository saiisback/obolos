import {beforeEach,it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({values:{} as Record<string,unknown>,failure:false}));
vi.mock('../src/lib/platform/hedera-commerce',()=>({hederaPublicConfig:async(id:string)=>{if(state.failure)throw Error('PRIVATE DATABASE URL');return state.values[id]??null;}}));
import {GET} from '../src/app/api/hedera/evidence/route';
const anchor={network:'hedera:2',topicId:'0.0.456',transactionId:'0.0.123@1789190000.000000001',sequenceNumber:'1',consensusTimestamp:'1789190001.000000002',mirrorUrl:'https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.456/messages/1'};
beforeEach(()=>{state.values={};state.failure=false;});
it('publishes missing evidence explicitly and exposes only fixed discovery links',async()=>{
 const response=await GET();expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');
 expect(await response.json()).toMatchObject({network:'hedera:testnet',hts:null,identityService:null,identityBuyer:null,release:null,discovery:{agentCard:'/.well-known/agent-card.json',a2a:'/api/hedera/a2a'}});
});
it('removes secrets, reports, private request IDs and caller-controlled explorer links',async()=>{
 state.values.release={checkedAt:'2026-09-13T00:00:00.000Z',privateKey:'SECRET',report:'PRIVATE REPORT',a2a:{offerId:'offer-public',offerToken:'SIGNED OFFER',receipt:{mode:'live',network:'hedera:testnet',asset:'HBAR',amountAtomic:100,units:1,provider:'repo-standard',status:'settled',timestamp:'2026-09-13T00:00:00.000Z',transactionId:anchor.transactionId,requestId:'PRIVATE JOB',explorerUrl:'https://evil.example'}},audit:anchor};
 state.values.hts={asset:'0.0.789',payTo:'0.0.123',unitPriceAtomic:2,decimals:0,symbol:'TEST',network:'hedera:testnet',key:'TOKEN SECRET'};
 const response=await GET(),body=await response.text();expect(response.status).toBe(200);
 for(const privateValue of ['SECRET','PRIVATE REPORT','SIGNED OFFER','PRIVATE JOB','evil.example'])expect(body).not.toContain(privateValue);
 expect(JSON.parse(body).release.audit).toEqual(anchor);
});
it('withholds malformed proof and never fetches configured URLs',async()=>{
 const fetchSpy=vi.spyOn(globalThis,'fetch');
 try{state.values.release={checkedAt:'2026-09-13T00:00:00.000Z',audit:{...anchor,mirrorUrl:'https://evil.example/private'}};
 expect((await (await GET()).json()).release).toBeNull();expect(fetchSpy).not.toHaveBeenCalled();}finally{fetchSpy.mockRestore();}
});
it('returns a generic unavailable error without private database details',async()=>{
 state.failure=true;const response=await GET();expect(response.status).toBe(503);expect(await response.text()).not.toContain('PRIVATE DATABASE URL');
});

import {canonicalAgentData,createUaid} from '../src/lib/hedera/identity';
it('withholds identity metadata when the canonical root or anchored topic differs',async()=>{
 const canonical=canonicalAgentData({registry:'obolos',name:'Service',version:'1.0.0',protocol:'a2a',nativeId:'hedera:testnet:0.0.123',skills:[17]});
 const identity={version:1,canonical,uaid:createUaid(canonical),submitKey:{type:'ED25519',key:'aa'.repeat(32)},topicId:'0.0.456',profileAnchor:anchor};
 state.values['identity-service']={...identity,canonical:{...canonical,name:'Another identity'}};
 expect((await (await GET()).json()).identityService).toBeNull();
 state.values['identity-service']={...identity,topicId:'0.0.999'};
 expect((await (await GET()).json()).identityService).toBeNull();
});
