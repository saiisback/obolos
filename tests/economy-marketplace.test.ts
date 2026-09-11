import {beforeEach,expect,it,vi} from 'vitest';
import {keccak256,toHex} from 'viem';
const state=vi.hoisted(()=>({query:vi.fn()}));
vi.mock('../src/lib/platform/db',()=>({sql:()=>state.query}));
vi.mock('../src/lib/economy/remote-service',()=>({requestRemoteService:vi.fn(async({request}:{request:{orderId:string;serviceHash:string;inputHash:string}})=>({protocol:'obolos.service.v1',orderId:request.orderId,serviceHash:request.serviceHash,inputHash:request.inputHash,outputHash:keccak256(toHex('{"answer":"ok"}')),output:{answer:'ok'}}))}));
import {createEconomyOrder,createEconomyService,publicEconomyOrder} from '../src/lib/economy/marketplace';
import {canonicalJsonHash,createServiceDefinition,serviceRequestSchema} from '../src/lib/economy/service-contract';

const addr=(digit:string)=>`0x${digit.repeat(40)}` as `0x${string}`, hash=(text:string)=>keccak256(toHex(text));
const user={id:'11111111-1111-4111-8111-111111111111',address:addr('a'),createdAt:new Date().toISOString()};
const definition=createServiceDefinition({chainId:5042002,settlementAddress:addr('1'),ledgerAddress:addr('2'),seller:user.address,endpoint:'https://service.obolos.app/v1/run',category:'compute',unit:'compute-unit',quantity:'2',unitPriceAtomic:'25000',inputSchema:{type:'object',properties:{job:{type:'string',maxLength:50}},required:['job'],additionalProperties:false},outputSchema:{type:'object',properties:{answer:{type:'string',maxLength:50}},required:['answer'],additionalProperties:false}});
const platformAgentId='22222222-2222-4222-8222-222222222222';
const request=serviceRequestSchema.parse({protocol:'obolos.service.v1',orderId:hash('order'),agentId:hash(platformAgentId),payer:addr('b'),serviceHash:definition.serviceHash,inputHash:canonicalJsonHash({job:'render'}),category:'compute',unit:'compute-unit',quantity:'2',unitPriceAtomic:'25000',amountAtomic:'50000',settlement:{chainId:5042002,address:definition.settlementAddress,ledgerAddress:definition.ledgerAddress,transactionHash:hash('tx')},input:{job:'render'}});
const deployment={chainId:5042002 as const,policy:addr('9'),ledger:definition.ledgerAddress,settlement:definition.settlementAddress,fromBlock:'1',controller:addr('8'),approver:addr('7'),reserve:addr('6'),reviewPool:addr('5')};
beforeEach(()=>state.query.mockReset());

it('publishes only a seller-owned definition matching finalized on-chain registration',async()=>{
 state.query.mockResolvedValueOnce([{service_hash:definition.serviceHash,user_id:user.id,definition,created_at:new Date()}]);
 const result=await createEconomyService(user,definition,{deployment,readService:async()=>({seller:user.address,category:1,unitHash:hash('compute-unit'),quantity:2n,unitPrice:25000n,endpointHash:hash(definition.endpoint)})});expect(result.serviceHash).toBe(definition.serviceHash);
 await expect(createEconomyService({...user,address:addr('f')},definition,{deployment,readService:vi.fn()})).rejects.toMatchObject({code:'SERVICE_SELLER_MISMATCH'});
});

it('persists a confirmed paid order before delivery and binds replay to the same body',async()=>{
 const row={order_id:request.orderId,user_id:user.id,service_hash:definition.serviceHash,request_hash:canonicalJsonHash(request),request,definition,transaction_hash:request.settlement.transactionHash,state:'paid',receipt:{chainId:5042002,status:'success',transactionHash:request.settlement.transactionHash,logs:[]},created_at:new Date(),updated_at:new Date(),delivery_attempts:0};
 state.query.mockImplementation(async(strings?:TemplateStringsArray)=>{const text=strings?.join('')??'';if(text.includes('FROM economy_services'))return [{definition}];if(text.includes('FROM platform_agents'))return [{id:platformAgentId}];if(text.includes('INSERT INTO economy_orders'))return [row];if(text.includes("SET state='delivering'"))return [{...row,state:'delivering',delivery_token:'lease'}];if(text.includes("SET state='fulfilled'"))return [{...row,state:'fulfilled',output:{answer:'ok'},output_hash:hash('out')}];return [];});
 const receipt={chainId:5042002,status:'success' as const,transactionHash:request.settlement.transactionHash,logs:[]};
 const chain={deployment,readAgent:async()=>({owner:user.address,executor:addr('f'),active:false}),getFinalizedReceipt:async()=>receipt,verifySettlement:()=>({chainId:5042002 as const,orderId:request.orderId,transactionHash:request.settlement.transactionHash,serviceHash:definition.serviceHash,inputHash:request.inputHash})};
 await expect(createEconomyOrder(user,{platformAgentId,request},chain)).resolves.toMatchObject({state:'fulfilled'});
 await expect(createEconomyOrder(user,{platformAgentId,request},{...chain,readAgent:async()=>({owner:addr('f'),executor:request.payer,active:true})})).rejects.toMatchObject({code:'AGENT_POLICY_MISMATCH'});
 expect(state.query.mock.calls.find(([parts])=>(parts as TemplateStringsArray).join('').includes('INSERT INTO economy_orders'))).toBeTruthy();
});

it('never exposes the private service input from an order row',()=>{expect(publicEconomyOrder({order_id:request.orderId,service_hash:definition.serviceHash,transaction_hash:request.settlement.transactionHash,state:'paid',created_at:new Date(),updated_at:new Date(),request})).not.toHaveProperty('request');});
