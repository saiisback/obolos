import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
const query=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/platform/db',()=>({sql:()=>query}));
import {POST as publish,GET as browse} from '@/app/api/market/services/route';
import {PATCH} from '@/app/api/market/services/[id]/route';
import {POST as order} from '@/app/api/market/orders/route';
import {createMarketOrder} from '@/lib/platform/marketplace';
const id='11111111-1111-4111-8111-111111111111',wallet='0x1111111111111111111111111111111111111111';
const row={id,user_id:id,name:'Verifier',description:'Metrics',recipient:wallet,price_atomic:1000,revision:1,active:true,created_at:'2026-09-10T10:00:00Z'};
function request(method:string,body:unknown,headers:Record<string,string>={}){return new NextRequest('https://market.example/api/market/services',{method,headers:{'content-type':'application/json',origin:'https://market.example',cookie:`obolos_session=${'a'.repeat(64)}`,...headers},...(method==='GET'?{}:{body:JSON.stringify(body)})});}
beforeEach(()=>{vi.stubEnv('APP_ORIGIN','https://market.example');query.mockReset();query.mockImplementation(async(parts:TemplateStringsArray,...values:unknown[])=>{const q=parts.join('?');if(q.includes('platform_sessions'))return [{id,address:wallet}];if(q.includes('platform_rate_limits'))return [{hits:1}];if(q.includes('INSERT INTO platform_market_services'))return [{...row,recipient:values[4]}];if(q.includes('UPDATE platform_market_services'))return [];if(q.includes('platform_market_services'))return [row];throw Error('Unexpected DB operation');});});
afterEach(()=>vi.unstubAllEnvs());
it('publishes only to the authenticated wallet',async()=>{const response=await publish(request('POST',{name:'Verifier',description:'Metrics',priceAtomic:1000}));expect(response.status).toBe(201);expect((await response.json()).service).toMatchObject({recipient:wallet,execution:'hosted-metric-verifier'});});
it('rejects request-supplied payout destinations',async()=>{const response=await publish(request('POST',{name:'Verifier',description:'Metrics',priceAtomic:1000,recipient:wallet}));expect(response.status).toBe(400);});
it('rejects cross-site seller mutations',async()=>{const response=await publish(request('POST',{}, {origin:'https://attacker.example'}));expect(response.status).toBe(403);expect(query).not.toHaveBeenCalled();});
it('hides another seller listing on update',async()=>{const response=await PATCH(request('PATCH',{priceAtomic:2000}),{params:Promise.resolve({id})});expect(response.status).toBe(404);});
it('lists public services without authentication',async()=>{const response=await browse(request('GET',null,{cookie:''}));expect(response.status).toBe(200);expect((await response.json()).services[0].endpoint).toBe(`https://market.example/api/market/services/${id}`);});
it('refuses cookie-only order creation',async()=>{const response=await order(request('POST',{}));expect(response.status).toBe(401);expect(query).not.toHaveBeenCalled();});
it('rejects order changes before any new order or payment',async()=>{
 query.mockResolvedValueOnce([{...row,id,runner_id:id,job_id:id,report_digest:'old',payer:wallet}]).mockResolvedValueOnce([{id}]);
 const report={title:'Report',summary:'a/b | stars=1 | forks=2 | openIssues=3',recommendation:'Observe.',generatedBy:'model',createdAt:'2026-09-10T10:00:00Z',checks:[],verified:false,evidence:[{repo:'a/b',description:'',stars:1,forks:2,openIssues:3,pushedAt:'',language:'',license:'',sourceUrl:'https://api.github.com/repos/a/b',fetchedAt:'2026-09-10T10:00:00Z'}]};
 await expect(createMarketOrder({id,agentId:id},{jobId:id,payer:wallet,dataTransactionId:'0.0.123@1.1',report})).rejects.toMatchObject({code:'ORDER_CONFLICT'});
});
