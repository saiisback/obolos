import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
const query=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/platform/db',()=>({sql:()=>query}));
import {createMarketService,getVerificationService,updateMarketService} from '@/lib/platform/marketplace';
import {GET} from '@/app/api/market/services/[id]/history/route';
const id='11111111-1111-4111-8111-111111111111',agentId='22222222-2222-4222-8222-222222222222';
const user={id,address:'0x1111111111111111111111111111111111111111'};
const row={id,user_id:id,name:'Verifier',description:'Metrics',recipient:user.address,price_atomic:1000,revision:1,active:true,created_at:'2026-09-10T10:00:00Z',agent_id:agentId,agent_name:'Seller agent'};
beforeEach(()=>{vi.stubEnv('APP_ORIGIN','https://market.example');query.mockReset();});
afterEach(()=>vi.unstubAllEnvs());
it('keeps public attribution out of the signed service snapshot',async()=>{
 query.mockResolvedValue([row]);
 expect(await getVerificationService(id)).toEqual({id,revision:1,name:'Verifier',recipient:user.address,priceAtomic:1000,endpoint:`https://market.example/api/market/services/${id}`});
});
it('accepts owned agent attribution while refusing an absent or foreign agent',async()=>{
 query.mockResolvedValueOnce([row]).mockResolvedValueOnce([]);
 expect(await createMarketService(user,{name:'Verifier',description:'Metrics',priceAtomic:1000,agentId})).toMatchObject({agentId,agentName:'Seller agent'});
 await expect(createMarketService(user,{name:'Verifier',description:'Metrics',priceAtomic:1000,agentId})).rejects.toMatchObject({status:404,code:'AGENT_NOT_FOUND'});
});
it('rejects attempts to change the publishing agent after creation',async()=>{
 await expect(updateMarketService(user,id,{agentId})).rejects.toThrow();
 expect(query).not.toHaveBeenCalled();
});
it('returns a public history without owner, agent or secret columns',async()=>{
 query.mockResolvedValue([{...row,recorded_at:'2026-09-10T11:00:00Z',source:'backfill',secret:'must not leak'}]);
 const response=await GET(new NextRequest(`https://market.example/api/market/services/${id}/history`),{params:Promise.resolve({id})});
 expect(response.status).toBe(200);
 expect(await response.json()).toEqual({revisions:[{revision:1,name:'Verifier',priceAtomic:1000,active:true,recordedAt:'2026-09-10T11:00:00.000Z',source:'backfill'}]});
});
it('returns 404 for nonexistent listings and rejects malformed IDs before DB access',async()=>{
 query.mockResolvedValue([]);
 expect((await GET(new NextRequest('https://market.example'),{params:Promise.resolve({id})})).status).toBe(404);
 query.mockClear();
 expect((await GET(new NextRequest('https://market.example'),{params:Promise.resolve({id:'invalid'})})).status).toBe(400);
 expect(query).not.toHaveBeenCalled();
});
