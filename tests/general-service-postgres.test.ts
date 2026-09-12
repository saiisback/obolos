import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import pg from 'pg';
import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest';
import {keccak256,toHex} from 'viem';
const transport=vi.hoisted(()=>({query:undefined as unknown}));
vi.mock('@/lib/platform/db',()=>({sql:()=>transport.query}));
import {saveServiceProfile,listServiceProfiles} from '@/lib/platform/service-profiles';
import {listEconomySellerEarnings} from '@/lib/platform/economy-earnings';
import {createServiceDefinition} from '@/lib/economy/service-contract';
import {economyDeployment} from '@/lib/economy/chain';
const deployment=economyDeployment()!,hash=(s:string)=>keccak256(toHex(s));
const seller={id:randomUUID(),address:'0x'+'a'.repeat(40)},other={id:randomUUID(),address:'0x'+'b'.repeat(40)};
const definition=createServiceDefinition({chainId:deployment.chainId,settlementAddress:deployment.settlement,ledgerAddress:deployment.ledger,seller:seller.address,endpoint:'https://provider.example/translation',category:'inference',unit:'inference-request',quantity:'1',unitPriceAtomic:'1000',inputSchema:{type:'object',properties:{text:{type:'string',maxLength:2000}},required:['text'],additionalProperties:false},outputSchema:{type:'object',properties:{translation:{type:'string',maxLength:4000}},required:['translation'],additionalProperties:false}});
describe.skipIf(!process.env.TEST_DATABASE_URL)('General seller profiles and finalized earnings',()=>{
 let admin:pg.Client,db:pg.Client;const schema='general_services_'+randomUUID().replaceAll('-','');
 beforeAll(async()=>{admin=new pg.Client({connectionString:process.env.TEST_DATABASE_URL});await admin.connect();await admin.query(`CREATE SCHEMA ${schema}`);db=new pg.Client({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema}`});await db.connect();for(const file of(await readdir('db/migrations')).filter(x=>x.endsWith('.sql')).sort())await db.query(await readFile('db/migrations/'+file,'utf8'));transport.query=async(parts:TemplateStringsArray,...values:unknown[])=>(await db.query(parts.reduce((s,p,i)=>s+(i?'$'+i:'')+p,''),values)).rows;await db.query('INSERT INTO platform_users(id,address) VALUES($1,$2),($3,$4)',[seller.id,seller.address,other.id,other.address]);await db.query('INSERT INTO economy_services(service_hash,user_id,definition) VALUES($1,$2,$3)',[definition.serviceHash,seller.id,definition]);},30000);
 afterAll(async()=>{await db?.end();if(admin){await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();}});
 it('allows a registered seller to describe a custom task service while preventing another owner from editing it',async()=>{
  const profile={title:'Translate my text',description:'Spanish translations of supplied text.',tags:['translation'],examples:[{text:'Hello'}]};
  await expect(saveServiceProfile(other,definition.serviceHash,profile)).rejects.toMatchObject({status:404});
  expect(await saveServiceProfile(seller,definition.serviceHash,profile)).toMatchObject(profile);
  expect(await listServiceProfiles()).toEqual([expect.objectContaining({serviceHash:definition.serviceHash,...profile})]);
  const stored=await db.query('SELECT definition FROM economy_services WHERE service_hash=$1',[definition.serviceHash]);expect(stored.rows[0].definition).toEqual(definition);
 });
 it('rejects schema-incompatible example input and preserves the prior listing',async()=>{
  await expect(saveServiceProfile(seller,definition.serviceHash,{title:'Bad',description:'Wrong sample',tags:[],examples:[{prompt:'not declared'}]})).rejects.toMatchObject({status:400});
  expect((await listServiceProfiles())[0].title).toBe('Translate my text');
 });
 it('does not label a missing index as zero earnings',async()=>{expect(await listEconomySellerEarnings(seller)).toEqual({indexedAt:null,totals:null,orders:[]});});
 it('counts exact actual seller allocations, excludes another seller, mismatched receipts and events beyond indexed height',async()=>{
  await db.query('INSERT INTO economy_index_state(settlement_address,block_number,block_hash,snapshot) VALUES($1,100,$2,$3)',[deployment.settlement,hash('block'),'{}']);
  const event=async(tx:string,name:string,contract:string,payload:unknown,index:number,block=99)=>db.query('INSERT INTO economy_chain_events(chain_id,contract_address,transaction_hash,log_index,block_number,block_hash,block_timestamp,event_name,payload) VALUES($1,$2,$3,$4,$5,$6,1000,$7,$8)',[deployment.chainId,contract,hash(tx),index,block,hash('block'+block),name,payload]);
  const add=async(id:string,address:string,block=99,splitTx=id)=>{const payload={orderId:hash(id),agentId:hash('agent'),seller:address,serviceHash:definition.serviceHash,category:2,unitHash:hash('inference-request'),quantity:'1',unitPrice:'9007199254740993',amount:'9007199254740993',inputHash:hash('input')};await event(id,'OrderPaid',deployment.ledger,payload,0,block);await event(splitTx,'OrderSettled',deployment.settlement,{orderId:hash(id),payer:other.address,amount:payload.amount,sellerAmount:'8556839292003944',reserveAmount:'270215977642229',reviewAmount:'180143985094820',rebateAmount:'0'},1,block);};
  await add('mine',seller.address);await add('other',other.address);await add('too-new',seller.address,101);await add('mismatch',seller.address,99,'different-tx');
  const result=await listEconomySellerEarnings(seller);expect(result.totals).toMatchObject({grossAtomic:'9007199254740993',sellerAtomic:'8556839292003944',orderCount:1});expect(result.orders).toHaveLength(1);expect(result.orders[0]).toMatchObject({orderId:hash('mine'),title:'Translate my text',transactionHash:hash('mine')});expect(JSON.stringify(result)).not.toContain('inputHash');
 });
});
