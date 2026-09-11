import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import pg from 'pg';
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {keccak256,toHex,encodeAbiParameters,encodeEventTopics,parseAbi,type Hex} from 'viem';
const transport=vi.hoisted(()=>({query:undefined as unknown}));
vi.mock('../src/lib/platform/db',()=>({sql:()=>transport.query}));
import {getRecovery,recoveryAction,retireService} from '../src/lib/economy/recovery';
import {getPublishedEconomyService,listEconomyServices} from '../src/lib/economy/marketplace';
import {providerWorkAction} from '../src/lib/economy/provider-queue';
import {createServiceDefinition,canonicalJsonHash} from '../src/lib/economy/service-contract';
import deployment from '../src/lib/economy/deployment.json';
const hash=(v:string)=>keccak256(toHex(v)),address=(n:string)=>`0x${n.repeat(40)}` as Hex;
describe.skipIf(!process.env.TEST_DATABASE_URL)('PostgreSQL recovery and provider lifecycle',()=>{
 let admin:pg.Client,db:pg.Client;const schema='obolos_recovery_'+randomUUID().replaceAll('-','');
 const buyer={id:randomUUID(),address:address('a'),createdAt:new Date().toISOString()},seller={id:randomUUID(),address:address('b'),createdAt:new Date().toISOString()},stranger={id:randomUUID(),address:address('c'),createdAt:new Date().toISOString()},agentId=randomUUID(),orderId=hash('recovery-order');
 const definition=createServiceDefinition({chainId:5042002,settlementAddress:deployment.settlement as Hex,ledgerAddress:deployment.ledger as Hex,seller:seller.address,endpoint:'https://provider.test/compute',category:'compute',unit:'compute-unit',quantity:'1',unitPriceAtomic:'1000',inputSchema:{type:'object',properties:{text:{type:'string',maxLength:100}},required:['text'],additionalProperties:false},outputSchema:{type:'object',properties:{text:{type:'string',maxLength:100}},required:['text'],additionalProperties:false}});
 const input={text:'hello'},request={protocol:'obolos.service.v1',orderId,agentId:hash(agentId),payer:buyer.address,serviceHash:definition.serviceHash,inputHash:canonicalJsonHash(input),category:'compute',unit:'compute-unit',quantity:'1',unitPriceAtomic:'1000',amountAtomic:'1000',settlement:{chainId:5042002,address:deployment.settlement,ledgerAddress:deployment.ledger,transactionHash:hash('paid')},input};
 beforeAll(async()=>{
  admin=new pg.Client({connectionString:process.env.TEST_DATABASE_URL});await admin.connect();await admin.query(`CREATE SCHEMA ${schema}`);db=new pg.Client({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema}`});await db.connect();
  for(const name of(await readdir('db/migrations')).filter(n=>n.endsWith('.sql')).sort())await db.query(await readFile('db/migrations/'+name,'utf8'));
  transport.query=async(parts:TemplateStringsArray,...values:unknown[])=>{const text=parts.reduce((s,p,i)=>s+(i?'$'+i:'')+p,'');return (await db.query(text,values)).rows;};
  for(const u of [buyer,seller,stranger])await db.query('INSERT INTO platform_users(id,address) VALUES($1,$2)',[u.id,u.address]);
  await db.query("INSERT INTO platform_agents(id,user_id,name,data_budget_atomic,verification_budget_atomic) VALUES($1,$2,'Recovery',0,10000)",[agentId,buyer.id]);
  await db.query('INSERT INTO economy_services(service_hash,user_id,definition) VALUES($1,$2,$3)',[definition.serviceHash,seller.id,definition]);
  await db.query("INSERT INTO economy_orders(order_id,user_id,platform_agent_id,service_hash,request_hash,request,definition,transaction_hash,receipt,state) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'{}','paid')",[orderId,buyer.id,agentId,definition.serviceHash,canonicalJsonHash(request),request,definition,hash('paid')]);
 },30000);
 afterAll(async()=>{await db?.end();if(admin){await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();}});
 it('restricts disputes and hides retired offers while retaining paid order data',{timeout:30000},async()=>{
  await expect(recoveryAction(db,stranger,orderId,{action:'dispute',reason:'unknown'})).rejects.toMatchObject({code:'ORDER_NOT_FOUND'});
  await recoveryAction(db,buyer,orderId,{action:'dispute',reason:'Delivery pending'});
  expect((await getRecovery(db,buyer,orderId)).disputes).toHaveLength(1);
  await expect(retireService(db,buyer,definition.serviceHash,{reason:'not mine'})).rejects.toMatchObject({code:'SERVICE_NOT_FOUND'});
  await retireService(db,seller,definition.serviceHash,{reason:'No new purchases'});
  expect(await listEconomyServices()).toEqual([]);
  expect(await getPublishedEconomyService(definition.serviceHash)).toEqual(definition);
  expect((await db.query('SELECT request FROM economy_orders WHERE order_id=$1',[orderId])).rows[0].request).toEqual(request);
 });
 it('attributes a real-shaped transfer once and rejects over-refunds and unauthorized attribution',{timeout:30000},async()=>{
  const tx=hash('refund'),abi=parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)']);
  const client={getChainId:async()=>5042002,getBlock:async()=>({number:20n,hash:hash('canonical')}),getTransactionReceipt:async({hash:h}:{hash:Hex})=>({status:'success',transactionHash:h,blockHash:hash('canonical'),transactionIndex:h===hash('paid')?1:2,blockNumber:10n,logs:[{address:'0x3600000000000000000000000000000000000000',logIndex:2,topics:encodeEventTopics({abi,eventName:'Transfer',args:{from:seller.address,to:buyer.address}}),data:encodeAbiParameters([{type:'uint256'}],[1000n])}]})} as unknown as Parameters<typeof recoveryAction>[4];
  const action={action:'refund',transactionHash:tx,logIndex:2,amountAtomic:'1000'};
  await expect(recoveryAction(db,buyer,orderId,action,client)).rejects.toMatchObject({code:'SELLER_REQUIRED'});
  const orphan={...client,getBlock:async()=>({number:20n,hash:hash('different-block')})} as unknown as Parameters<typeof recoveryAction>[4];
  await expect(recoveryAction(db,seller,orderId,action,orphan)).rejects.toMatchObject({code:'INVALID_REFUND'});
  await recoveryAction(db,seller,orderId,action,client);expect(await recoveryAction(db,seller,orderId,action,client)).toMatchObject({replayed:true});
  await expect(recoveryAction(db,seller,orderId,{...action,transactionHash:hash('second')},client)).rejects.toMatchObject({code:'REFUND_EXCEEDS_PAYMENT'});
  expect((await getRecovery(db,buyer,orderId)).refunds).toHaveLength(1);
 });
 it('rejects a trusted reviewer sharing the known buyer controller',async()=>{
  const original=process.env.ECONOMY_REVIEW_SIGNERS;process.env.ECONOMY_REVIEW_SIGNERS=stranger.address;
  const client={getChainId:async()=>5042002,getBlock:async()=>({number:20n}),readContract:async({args}:{args:string[]})=>args[0].toLowerCase()===stranger.address?buyer.address:'0x0000000000000000000000000000000000000000'} as unknown as Parameters<typeof recoveryAction>[4];
  try{await expect(recoveryAction(db,stranger,orderId,{action:'review',outputHash:hash('out'),verdict:'passed',evidenceReference:'https://review.example/evidence',evidenceHash:hash('evidence')},client)).rejects.toMatchObject({code:'INDEPENDENT_REVIEWER_REQUIRED'});}finally{if(original===undefined)delete process.env.ECONOMY_REVIEW_SIGNERS;else process.env.ECONOMY_REVIEW_SIGNERS=original;}
 });
 it('claims paid provider jobs once and never automatically requeues uncertain inference',{timeout:30000},async()=>{
  await db.query('INSERT INTO economy_provider_jobs(order_id,request_hash,request,definition,paid_at) VALUES($1,$2,$3,$4,100)',[orderId,canonicalJsonHash(request),request,definition]);
  const claimId=randomUUID();const first=await providerWorkAction({action:'claim',model:'gpt-5-nano',claimId});expect(first).toHaveProperty('job.order_id',orderId);
  expect(await providerWorkAction({action:'claim',model:'gpt-5-nano',claimId})).toEqual(first);
  expect(await providerWorkAction({action:'claim',model:'gpt-5-nano',claimId:randomUUID()})).toEqual({job:null});
 });
});
