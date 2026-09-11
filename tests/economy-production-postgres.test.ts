import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import pg from 'pg';
import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {keccak256,toHex,type Hex} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {recordProductionAccount} from '../src/lib/economy/production-store';
import {productionAccountMessage,type ProductionAccount} from '../src/lib/economy/production-account';
import {createServiceDefinition,canonicalJsonHash} from '../src/lib/economy/service-contract';
import {economyDeployment} from '../src/lib/economy/chain';

// Entirely synthetic test fixtures, isolated PostgreSQL schema, public test EOA key.
// No blockchain or production database writes are performed by this suite.
const signer=privateKeyToAccount(`0x${'11'.repeat(32)}`),hash=(v:string)=>keccak256(toHex(v));
const deployment=economyDeployment()!;
type User={id:string;address:string};
type ChainOrder={orderId:string;transactionHash:string;outputHash:string;seller:string;delivered:boolean;buyerAcknowledged:boolean;timestamp:number;deliveredAt:number|null;acknowledgedAt:number|null;deliveryBlockNumber:string;deliveryLogIndex:number;acknowledgmentBlockNumber:string;acknowledgmentLogIndex:number};
describe.skipIf(!process.env.TEST_DATABASE_URL)('isolated PostgreSQL producer accounting',()=>{
 let admin:pg.Client,db:pg.Client,orders:ChainOrder[];
 const schema='obolos_production_'+randomUUID().replaceAll('-','');
 const producer={id:randomUUID(),address:signer.address.toLowerCase()},buyer={id:randomUUID(),address:`0x${'b'.repeat(40)}`},vendor={id:randomUUID(),address:`0x${'c'.repeat(40)}`};
 const agentIds=new Map<string,string>();
 beforeAll(async()=>{
  admin=new pg.Client({connectionString:process.env.TEST_DATABASE_URL});await admin.connect();await admin.query(`CREATE SCHEMA ${schema}`);
  db=new pg.Client({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema}`});await db.connect();
  for(const name of(await readdir('db/migrations')).filter(n=>n.endsWith('.sql')).sort())await db.query(await readFile('db/migrations/'+name,'utf8'));
  for(const user of [producer,buyer,vendor]){
   await db.query('INSERT INTO platform_users(id,address) VALUES($1,$2)',[user.id,user.address]);
   const agentId=randomUUID();agentIds.set(user.id,agentId);
   await db.query("INSERT INTO platform_agents(id,user_id,name,data_budget_atomic,verification_budget_atomic) VALUES($1,$2,'Synthetic production test',0,10000)",[agentId,user.id]);
  }
 },30000);
 afterAll(async()=>{await db?.end();if(admin){await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();}});
 beforeEach(async()=>{
  await db.query('TRUNCATE economy_production_input_allocations,economy_production_accounts,economy_orders,economy_services,economy_index_state CASCADE');orders=[];
 });
 async function order(label:string,owner:User,seller:User=producer,position=20,amount='100'){
  const orderId=hash(label),agentId=agentIds.get(owner.id)!;
  const shape={type:'object' as const,properties:{text:{type:'string' as const,maxLength:100}},required:['text'],additionalProperties:false as const};
  const definition=createServiceDefinition({chainId:5042002,settlementAddress:deployment.settlement,ledgerAddress:deployment.ledger,seller:seller.address as Hex,endpoint:'https://synthetic-provider.test/'+label,category:'compute',unit:'compute-unit',quantity:'1',unitPriceAtomic:amount,inputSchema:shape,outputSchema:shape});
  const input={text:'synthetic input'},output={text:'synthetic output'};
  const request={protocol:'obolos.service.v1',orderId,agentId:hash(agentId),payer:owner.address,serviceHash:definition.serviceHash,inputHash:canonicalJsonHash(input),category:'compute',unit:'compute-unit',quantity:'1',unitPriceAtomic:amount,amountAtomic:amount,settlement:{chainId:5042002,address:deployment.settlement,ledgerAddress:deployment.ledger,transactionHash:hash(label+'-paid')},input};
  await db.query('INSERT INTO economy_services(service_hash,user_id,definition) VALUES($1,$2,$3)',[definition.serviceHash,seller.id,definition]);
  await db.query("INSERT INTO economy_orders(order_id,user_id,platform_agent_id,service_hash,request_hash,request,definition,transaction_hash,receipt,state,output,output_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'{}','fulfilled',$9,$10)",[orderId,owner.id,agentId,definition.serviceHash,canonicalJsonHash(request),request,definition,request.settlement.transactionHash,output,canonicalJsonHash(output)]);
  const chain:ChainOrder={orderId,transactionHash:request.settlement.transactionHash,outputHash:canonicalJsonHash(output),seller:seller.address,delivered:true,buyerAcknowledged:true,timestamp:position*10-2,deliveredAt:position*10,acknowledgedAt:position*10+1,deliveryBlockNumber:String(position),deliveryLogIndex:1,acknowledgmentBlockNumber:String(position),acknowledgmentLogIndex:2};orders.push(chain);return chain;
 }
 async function snapshot(){await db.query('INSERT INTO economy_index_state(settlement_address,block_number,block_hash,snapshot) VALUES($1,100,$2,$3) ON CONFLICT(settlement_address) DO UPDATE SET snapshot=EXCLUDED.snapshot',[deployment.settlement,hash('synthetic-finalized-block'),{orders}]);}
 async function statement(output:ChainOrder,inputs:ProductionAccount['inputs']=[],patch:Partial<ProductionAccount>={}){
  const payload:ProductionAccount={protocol:'obolos.production-account.v1',chainId:5042002,settlement:deployment.settlement,ledger:deployment.ledger,orderId:output.orderId,transactionHash:output.transactionHash,outputHash:output.outputHash,seller:producer.address,issuedAt:Math.floor(Date.now()/1000),inputs,externalIntermediateAtomic:'0',gasAtomic:'0',inferenceAtomic:'0',otherResourceAtomic:'0',allIntermediateInputsIncluded:true,allResourcesIncluded:true,sourceReference:'https://synthetic-evidence.test/production.json',sourceHash:hash('synthetic-evidence'),...patch};
  return {payload,signature:await signer.signMessage({message:productionAccountMessage(payload)})};
 }
 it('records a seller-signed account without manufacturing independent verification or V',async()=>{
  const input=await order('input',producer,vendor,10),output=await order('output',buyer);await snapshot();
  const record=await statement(output,[{orderId:input.orderId,amountAtomic:'60'}]);
  expect(await recordProductionAccount(db,producer,record,deployment)).toMatchObject({replayed:false});
  expect((await db.query('SELECT payload FROM economy_production_accounts')).rows[0].payload).toEqual(record.payload);
  expect((await db.query('SELECT amount_atomic::text FROM economy_production_input_allocations')).rows).toEqual([{amount_atomic:'60'}]);
  expect((await db.query('SELECT snapshot FROM economy_index_state')).rows[0].snapshot).toEqual({orders});
  expect((await db.query('SELECT count(*)::int AS n FROM economy_signed_evidence')).rows[0].n).toBe(0);
 });
 it('rejects the wrong authenticated user even with the real producer signature',async()=>{
  const output=await order('output',buyer);await snapshot();
  await expect(recordProductionAccount(db,buyer,await statement(output),deployment)).rejects.toMatchObject({status:403});
  expect((await db.query('SELECT count(*)::int AS n FROM economy_production_accounts')).rows[0].n).toBe(0);
 });
 it.each(['missing','delivery','acknowledgment','transaction','outputHash','seller'] as const)('requires exact indexed fulfillment: %s',async(fault)=>{
  const output=await order('output',buyer),record=await statement(output);
  if(fault==='missing')orders=[];
  if(fault==='delivery')output.delivered=false;
  if(fault==='acknowledgment')output.buyerAcknowledged=false;
  if(fault==='transaction')output.transactionHash=hash('different chain transaction');
  if(fault==='outputHash')output.outputHash=hash('different chain delivery');
  if(fault==='seller')output.seller=vendor.address;
  await snapshot();await expect(recordProductionAccount(db,producer,record,deployment)).rejects.toThrow();
 });
 it('rejects another user’s purchased input',async()=>{
  const input=await order('input',buyer,vendor,10),output=await order('output',buyer);await snapshot();
  await expect(recordProductionAccount(db,producer,await statement(output,[{orderId:input.orderId,amountAtomic:'1'}]),deployment)).rejects.toThrow('owned by this producer');
 });
 it.each(['late-delivery','late-ack','same-second-later-log','same-second-equal-log'] as const)('rejects input unavailable before output: %s',async(fault)=>{
  const input=await order('input',producer,vendor,10),output=await order('output',buyer);
  if(fault==='late-delivery')input.deliveredAt=output.deliveredAt!+1;
  if(fault==='late-ack')input.acknowledgedAt=output.deliveredAt!+1;
  if(fault.startsWith('same-second')){input.deliveredAt=output.deliveredAt;input.acknowledgedAt=output.deliveredAt;input.acknowledgmentBlockNumber=output.deliveryBlockNumber;input.acknowledgmentLogIndex=output.deliveryLogIndex+(fault==='same-second-later-log'?1:0);}
  await snapshot();await expect(recordProductionAccount(db,producer,await statement(output,[{orderId:input.orderId,amountAtomic:'1'}]),deployment)).rejects.toThrow();
 });
 it('accepts earlier input acknowledgment in the same second and block',async()=>{
  const input=await order('input',producer,vendor,10),output=await order('output',buyer);
  input.deliveredAt=output.deliveredAt;input.acknowledgedAt=output.deliveredAt;input.acknowledgmentBlockNumber=output.deliveryBlockNumber;input.acknowledgmentLogIndex=0;
  await snapshot();await expect(recordProductionAccount(db,producer,await statement(output,[{orderId:input.orderId,amountAtomic:'1'}]),deployment)).resolves.toMatchObject({replayed:false});
 });
 it('enforces allocation conservation across output accounts including the exact remaining amount',async()=>{
  const input=await order('input',producer,vendor,10),a=await order('output-a',buyer),b=await order('output-b',buyer,producer,21);await snapshot();
  await recordProductionAccount(db,producer,await statement(a,[{orderId:input.orderId,amountAtomic:'60'}]),deployment);
  await expect(recordProductionAccount(db,producer,await statement(b,[{orderId:input.orderId,amountAtomic:'41'}]),deployment)).rejects.toThrow('more than its actual paid amount');
  await expect(recordProductionAccount(db,producer,await statement(b,[{orderId:input.orderId,amountAtomic:'40'}]),deployment)).resolves.toMatchObject({replayed:false});
  expect((await db.query('SELECT sum(amount_atomic)::text AS amount FROM economy_production_input_allocations')).rows[0].amount).toBe('100');
 });
 it('keeps identical replay immutable and rejects changed statements and SQL mutations',async()=>{
  const input=await order('input',producer,vendor,10),output=await order('output',buyer);await snapshot();
  const record=await statement(output,[{orderId:input.orderId,amountAtomic:'1'}]),first=await recordProductionAccount(db,producer,record,deployment);
  expect(await recordProductionAccount(db,producer,record,deployment)).toEqual({...first,replayed:true});
  await expect(recordProductionAccount(db,producer,await statement(output,record.payload.inputs,{gasAtomic:'1'}),deployment)).rejects.toMatchObject({status:409});
  await expect(db.query("UPDATE economy_production_accounts SET signature='changed'")).rejects.toThrow(/append-only/i);
  await expect(db.query('DELETE FROM economy_production_accounts')).rejects.toThrow(/append-only/i);
  await expect(db.query('UPDATE economy_production_input_allocations SET amount_atomic=2')).rejects.toThrow(/append-only/i);
 });
 it('rejects dependency cycles even when a prior persisted account predates the current index view',async()=>{
  const a=await order('cycle-a',producer,producer,10),b=await order('cycle-b',producer,producer,20);await snapshot();
  await recordProductionAccount(db,producer,await statement(b,[{orderId:a.orderId,amountAtomic:'1'}]),deployment);
  // Synthetic changed index positions isolate recursive cycle protection independently of chronology.
  a.deliveredAt=300;a.deliveryBlockNumber='30';await snapshot();
  await expect(recordProductionAccount(db,producer,await statement(a,[{orderId:b.orderId,amountAtomic:'1'}]),deployment)).rejects.toThrow('cycle');
 });
 it('requires the output acknowledgment to precede the signed statement',async()=>{
  const output=await order('output',buyer);output.acknowledgedAt=Math.floor(Date.now()/1000)+20;await snapshot();
  await expect(recordProductionAccount(db,producer,await statement(output),deployment)).rejects.toThrow('signed after output acknowledgment');
 });
});
