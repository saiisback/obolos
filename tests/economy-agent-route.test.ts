import {beforeEach,describe,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
import {keccak256,toHex} from 'viem';
import {createCredential} from '../src/lib/platform/credentials';

const state=vi.hoisted(()=>({query:vi.fn(),create:vi.fn()}));
vi.mock('../src/lib/platform/db',()=>({sql:()=>state.query}));
vi.mock('../src/lib/platform/auth',()=>({rateLimit:vi.fn()}));
vi.mock('../src/lib/economy/marketplace',()=>({createEconomyOrder:state.create}));
import {GET,POST} from '../src/app/api/v1/agents/[id]/economy/orders/route';

const agentA='11111111-1111-4111-8111-111111111111',agentB='22222222-2222-4222-8222-222222222222';
const addr=(n:string)=>`0x${n.repeat(40)}`,hash=(s:string)=>keccak256(toHex(s));
let token='';
const paidRequest={protocol:'obolos.service.v1',orderId:hash('order'),agentId:hash(agentA),payer:addr('a'),serviceHash:hash('service'),inputHash:hash('{}'),category:'compute',unit:'compute-unit',quantity:'1',unitPriceAtomic:'1000',amountAtomic:'1000',settlement:{chainId:5042002,address:addr('b'),ledgerAddress:addr('c'),transactionHash:hash('tx')},input:{}};
const request=(pathAgent:string,body:unknown=paidRequest)=>new NextRequest(`https://obolos.app/api/v1/agents/${pathAgent}/economy/orders`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({request:body})});

beforeEach(()=>{token=createCredential().token;state.query.mockReset();state.create.mockReset().mockResolvedValue({orderId:paidRequest.orderId,state:'paid'});});

describe('scoped agent economy route',()=>{
 it('denies a valid key scoped to another agent, even under the same owner',async()=>{
  state.query.mockResolvedValueOnce([{agent_id:agentA,expires_at:'2099-01-01T00:00:00Z',revoked_at:null,checked_at:'2026-09-11T00:00:00Z'}]);
  const response=await POST(request(agentB),{params:Promise.resolve({id:agentB})});
  expect(response.status).toBe(403);expect(await response.json()).toMatchObject({code:'KEY_SCOPE_MISMATCH'});expect(state.create).not.toHaveBeenCalled();
 });
 it('forces the authenticated path agent and passes the immutable request unchanged',async()=>{
  state.query.mockResolvedValueOnce([{agent_id:agentA,expires_at:'2099-01-01T00:00:00Z',revoked_at:null,checked_at:'2026-09-11T00:00:00Z'}]).mockResolvedValueOnce([{id:'user-id',address:addr('d')}]);
  const response=await POST(request(agentA),{params:Promise.resolve({id:agentA})});
  expect(response.status).toBe(201);expect(state.create).toHaveBeenCalledWith({id:'user-id',address:addr('d')},{platformAgentId:agentA,request:paidRequest});
 });
});

describe('scoped economy identity preflight',()=>{
 it('returns the exact authenticated platform agent and owner',async()=>{
  state.query.mockResolvedValueOnce([{agent_id:agentA,expires_at:'2099-01-01T00:00:00Z',revoked_at:null,checked_at:'2026-09-11T00:00:00Z'}]).mockResolvedValueOnce([{id:'user-id',address:addr('d')}]);
  const response=await GET(new NextRequest(`https://obolos.app/api/v1/agents/${agentA}/economy/orders`,{headers:{authorization:`Bearer ${token}`}}),{params:Promise.resolve({id:agentA})});
  expect(response.status).toBe(200);expect(await response.json()).toEqual({platformAgentId:agentA,ownerAddress:addr('d')});expect(state.create).not.toHaveBeenCalled();
 });
 it('denies identity reads with another agent key',async()=>{
  state.query.mockResolvedValueOnce([{agent_id:agentA,expires_at:'2099-01-01T00:00:00Z',revoked_at:null,checked_at:'2026-09-11T00:00:00Z'}]);
  const response=await GET(new NextRequest(`https://obolos.app/api/v1/agents/${agentB}/economy/orders`,{headers:{authorization:`Bearer ${token}`}}),{params:Promise.resolve({id:agentB})});
  expect(response.status).toBe(403);expect(await response.json()).toMatchObject({code:'KEY_SCOPE_MISMATCH'});
 });
});
