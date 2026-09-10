import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
const boundary=vi.hoisted(()=>({query:vi.fn(),retry:vi.fn(),user:vi.fn(),limit:vi.fn()}));
vi.mock('@/lib/platform/db',()=>({sql:()=>boundary.query}));
vi.mock('@/lib/platform/auth',()=>({requireUser:boundary.user,rateLimit:boundary.limit}));
vi.mock('@/lib/platform/marketplace',async original=>({...await original<object>(),retryMarketDelivery:boundary.retry}));
import {GET} from '@/app/api/market/orders/[id]/receipt/route';
import {POST} from '@/app/api/market/orders/[id]/delivery/route';
import {publicMarketOrder} from '@/lib/platform/marketplace';
const id='11111111-1111-4111-8111-111111111111',transactionHash=`0x${'1'.repeat(64)}`,wallet=`0x${'2'.repeat(40)}`;
const row={id,service_id:id,job_id:id,revision:2,status:'paid',recipient:wallet,payer:wallet,amount_atomic:1000,transaction_hash:transactionHash,proof:{transactionHash,chainId:5042002,token:'0x3600000000000000000000000000000000000000',timestamp:'123456789'},report_digest:'a'.repeat(64),report:{private:'report content'},service_snapshot:{private:'request scope'},created_at:'2026-09-10T10:00:00Z',expires_at:'2026-09-10T10:15:00Z'};
beforeEach(()=>{vi.stubEnv('APP_ORIGIN','https://obolos.app');boundary.query.mockReset();boundary.retry.mockReset();boundary.user.mockReset().mockResolvedValue({id,address:wallet});boundary.limit.mockReset();});
afterEach(()=>vi.unstubAllEnvs());
it('publishes only settled receipt metadata without reports or internal scope',async()=>{
 boundary.query.mockResolvedValue([row]);
 const response=await GET(new NextRequest(`https://obolos.app/api/market/orders/${id}/receipt`),{params:Promise.resolve({id})});
 expect(response.status).toBe(200);const {receipt}=await response.json();
 expect(receipt).toMatchObject({id,status:'paid',transactionHash,reportDigest:'a'.repeat(64),chainConfirmed:true});
 expect(Object.keys(receipt).sort()).toEqual(['amountAtomic','chainConfirmed','chainId','id','proofDigest','protocol','recipient','reportDigest','revision','serviceId','status','timestamp','token','transactionHash'].sort());
 expect(boundary.user).not.toHaveBeenCalled();
});
it('does not turn a transaction hash without a matching persisted proof into confirmation',async()=>{
 for(const proof of [null,{transactionHash:`0x${'3'.repeat(64)}`,chainId:5042002},{transactionHash,chainId:1}]){
  boundary.query.mockResolvedValue([{...row,proof}]);
  const response=await GET(new NextRequest('https://obolos.app'),{params:Promise.resolve({id})});
  expect(response.status).toBe(404);expect(publicMarketOrder({...row,proof}).chainConfirmed).toBe(false);
 }
});
it('rejects cross-site delivery requests before authentication or delivery',async()=>{
 const response=await POST(new NextRequest('https://obolos.app',{method:'POST',headers:{origin:'https://evil.example'}}),{params:Promise.resolve({id})});
 expect(response.status).toBe(403);expect(boundary.user).not.toHaveBeenCalled();expect(boundary.retry).not.toHaveBeenCalled();
});
it('uses only authenticated ownership to retry already paid delivery and rate limits requests',async()=>{
 boundary.retry.mockResolvedValue({id,status:'fulfilled'});
 const response=await POST(new NextRequest('https://obolos.app',{method:'POST',headers:{origin:'https://obolos.app'}}),{params:Promise.resolve({id})});
 expect(response.status).toBe(200);expect(boundary.retry).toHaveBeenCalledWith(id,id);expect(boundary.limit).toHaveBeenCalledWith(`market-delivery:${id}`,30,3600);
});
