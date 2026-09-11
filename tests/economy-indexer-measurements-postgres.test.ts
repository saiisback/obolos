import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import pg from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {privateKeyToAccount} from 'viem/accounts';
import {indexEconomy as indexEconomyOnce} from '../src/lib/economy/indexer';
// Isolated schemas share PostgreSQL advisory locks; retry the documented busy result.
async function indexEconomy(...args:Parameters<typeof indexEconomyOnce>){for(let i=0;i<100;i++){const result=await indexEconomyOnce(...args);if(!('busy' in result&&result.busy))return result;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('Test index lock stayed busy');}
import {ingestEvidence,evidenceMessage,type EvidencePayload} from '../src/lib/economy/evidence';
import {canonicalJsonHash} from '../src/lib/economy/service-contract';
import {productionAccountMessage,type ProductionAccount} from '../src/lib/economy/production-account';
const addr=(n:string)=>`0x${n.repeat(40)}` as `0x${string}`,hash=(n:string)=>`0x${n.repeat(64)}` as `0x${string}`;
const seller=privateKeyToAccount(`0x${'21'.repeat(32)}`),attestor=privateKeyToAccount(`0x${'22'.repeat(32)}`),sellerAddress=seller.address.toLowerCase();
const deployment={chainId:5042002 as const,policy:addr('1'),ledger:addr('2'),settlement:addr('3'),fromBlock:'10',controller:addr('4'),approver:addr('5'),reserve:addr('6'),reviewPool:addr('7')};
const agentHash=hash('a'),serviceHash=hash('b'),outputHash=hash('c'),inputHash=hash('d');
describe.skipIf(!process.env.TEST_DATABASE_URL)('PostgreSQL measured index and producer cost sources',()=>{
 let admin:pg.Client,db:pg.Client;let finalized=11n,logIndex=0;const schema=`obolos_measured_${randomUUID().replaceAll('-','')}`,userId=randomUUID(),platformAgentId=randomUUID();
 const timestamp=(block:bigint)=>block===10n?172790:block===11n?172802:block===12n?172804:block===13n?172806:block===14n?259201:block===15n?259202:432001;
 const chain={getChainId:async()=>5042002,getBlock:async({blockNumber}:{blockNumber?:bigint})=>({number:blockNumber??finalized,hash:hash('f'),timestamp:BigInt(timestamp(blockNumber??finalized))}),getLogs:async()=>[],readContract:async({functionName}:{functionName:string})=>functionName==='agents'?[addr('8'),addr('9'),true]:functionName==='executorOwners'?'0x0000000000000000000000000000000000000000':functionName==='balanceOf'?500n:functionName==='categories'?[true,1000n,10000n,86400n,0n]:functionName==='marketEnabled'?true:1n} as unknown as Parameters<typeof indexEconomy>[2];
 const event=async(name:string,contract:string,orderId:string,block:number,time:number,payload:Record<string,string>)=>db.query('INSERT INTO economy_chain_events(chain_id,contract_address,transaction_hash,log_index,block_number,block_hash,block_timestamp,event_name,payload) VALUES(5042002,$1,$2,$3,$4,$5,$6,$7,$8)',[contract,orderId,logIndex++,block,hash('f'),time,name,JSON.stringify(payload)]);
 const makeOrder=async(id:string,block:number,time:number,settlement=deployment.settlement)=>{
  await db.query("INSERT INTO economy_orders(order_id,user_id,platform_agent_id,service_hash,request_hash,request,definition,transaction_hash,receipt,state,output,output_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$1,'{}','fulfilled','{}',$8)",[id,userId,platformAgentId,serviceHash,inputHash,JSON.stringify({payer:addr('9'),settlement:{chainId:5042002,address:settlement,ledgerAddress:deployment.ledger}}),JSON.stringify({seller:sellerAddress}),outputHash]);
  if(settlement!==deployment.settlement)return;
  await event('OrderPaid',deployment.ledger,id,block,time,{orderId:id,agentId:agentHash,seller:sellerAddress,inputHash,serviceHash,amount:'100',category:'1',unitHash:hash('e'),quantity:'1'});
  await event('OrderSettled',deployment.settlement,id,block,time,{orderId:id,payer:addr('9'),sellerAmount:'90',reserveAmount:'6',reviewAmount:'4',rebateAmount:'0'});
  await event('DeliveryAttested',deployment.ledger,id,block,time,{orderId:id,outputHash});
  await event('BuyerAcknowledged',deployment.ledger,id,block,time,{orderId:id,outputHash});
 };
 const account=async(id:string,issuedAt:number,complete=true,settlement=deployment.settlement)=>{
  const payload:ProductionAccount={protocol:'obolos.production-account.v1',chainId:5042002,settlement,ledger:deployment.ledger,orderId:id,transactionHash:id,outputHash,seller:sellerAddress,issuedAt,inputs:[],externalIntermediateAtomic:'20',gasAtomic:'2',inferenceAtomic:'3',otherResourceAtomic:'0',allIntermediateInputsIncluded:complete,allResourcesIncluded:complete,sourceReference:'https://example.test/producer-account',sourceHash:hash('e')};
  const signature=await seller.signMessage({message:productionAccountMessage(payload)});
  await db.query('INSERT INTO economy_production_accounts(order_id,evidence_hash,seller,payload,signature) VALUES($1,$2,$3,$4,$5)',[id,canonicalJsonHash(payload),sellerAddress,JSON.stringify(payload),signature]);
 };
 const snapshot=async()=>(await db.query('SELECT snapshot FROM economy_index_state WHERE settlement_address=$1',[deployment.settlement])).rows[0].snapshot;
 beforeAll(async()=>{
  admin=new pg.Client({connectionString:process.env.TEST_DATABASE_URL});await admin.connect();await admin.query(`CREATE SCHEMA ${schema}`);db=new pg.Client({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema}`});await db.connect();for(const name of(await readdir('db/migrations')).filter(n=>n.endsWith('.sql')).sort())await db.query(await readFile(`db/migrations/${name}`,'utf8'));
  await db.query('INSERT INTO platform_users(id,address) VALUES($1,$2)',[userId,addr('8')]);
  await db.query("INSERT INTO platform_agents(id,user_id,name,data_budget_atomic,verification_budget_atomic) VALUES($1,$2,'Measured test',0,1000)",[platformAgentId,userId]);
  await db.query('INSERT INTO economy_services(service_hash,user_id,definition) VALUES($1,$2,$3)',[serviceHash,userId,JSON.stringify({seller:sellerAddress})]);
  await event('AgentRegistered',deployment.policy,hash('a'),10,172790,{agentId:agentHash,owner:addr('8'),executor:addr('9')});
  await makeOrder(hash('1'),11,172801);
 },30000);
 afterAll(async()=>{await db?.end();if(admin){await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();}});
 it('refreshes source records at the same block but waits for their real issuance time',async()=>{
  await indexEconomy(db,deployment,chain);expect((await snapshot()).currentAccounting.gapAtomic).toBeNull();
  await account(hash('1'),172803);expect(await indexEconomy(db,deployment,chain)).toMatchObject({changed:true});
  const pending=await snapshot();expect(pending.productionAccounts).toHaveLength(0);expect(pending.currentAccounting.gapAtomic).toBeNull();
  finalized=12n;await indexEconomy(db,deployment,chain);const ready=await snapshot();
  expect(ready.currentAccounting).toMatchObject({gapAtomic:'70',surplusAtomic:'65',productivityBps:null,moneyVelocityBps:null});
  expect(ready.currentAccountingCoverage).toMatchObject({eligibleOrderCount:1,currentRevenueOrderCount:1,currentInputAccountCount:1,currentCostAccountCount:1,currentValuedOutputCount:0,productionAccountsCount:1});
  expect(ready.orders[0]).toMatchObject({costEvidenceSource:'producer-reported',verifiedIntermediateInputAtomic:'20',verifiedResourceCostAtomic:'25',verifiedFinalOutputAtomic:null,valuationReference:null,deliveryBlockNumber:'11',acknowledgmentBlockNumber:'11'});
  expect(ready.measurements.capital).toMatchObject({complete:true,totalAtomic:'500',executorCount:1});
  expect(ready.measurements.today).toMatchObject({grossPaymentsAtomic:'100',sellerRevenueAtomic:'90',deliveredCount:1,acknowledgedCount:1});
 });
 it('keeps incomplete costs unavailable and isolates foreign-deployment statements',async()=>{
  await makeOrder(hash('2'),13,172805);await account(hash('2'),172805,false);
  await makeOrder(hash('9'),13,172805,addr('f'));await account(hash('9'),172805,true,addr('f'));
  finalized=13n;await indexEconomy(db,deployment,chain);const value=await snapshot();
  expect(value.productionAccounts.map((a:{orderId:string})=>a.orderId)).toEqual([hash('1'),hash('2')]);
  expect(value.orders.find((o:{orderId:string})=>o.orderId===hash('2'))).toMatchObject({verifiedIntermediateInputAtomic:null,verifiedResourceCostAtomic:null,verifiedFinalOutputAtomic:null,costEvidenceSource:'producer-reported'});
  expect(value.currentAccounting).toMatchObject({gapAtomic:null,surplusAtomic:null,productivityBps:null});
  expect(value.currentAccountingCoverage).toMatchObject({eligibleOrderCount:2,currentInputAccountCount:1,currentCostAccountCount:1,currentValuedOutputCount:0});
 });
 it('prefers an independent order attestation as a whole cost source without erasing producer provenance',async()=>{
  finalized=14n;await indexEconomy(db,deployment,chain);
  const payload:EvidencePayload={protocol:'obolos.evidence.v1',chainId:5042002,policy:deployment.policy,ledger:deployment.ledger,settlement:deployment.settlement,asset:'USDC',windowStart:172800,windowEnd:259200,issuedAt:259201,signer:attestor.address.toLowerCase(),sourceReference:'https://example.test/independent',sourceHash:hash('7'),kind:'order',orderId:hash('1'),agentId:agentHash,payer:addr('9'),seller:sellerAddress,inputHash,outputHash,transactionHash:hash('1'),finalOutputAtomic:'400',intermediateInputAtomic:'7',resourceCostAtomic:'106',costBreakdown:{paymentAtomic:'100',gasAtomic:'1',inferenceAtomic:'2',otherAtomic:'3',conversionReference:'https://example.test/conversion',allResourcesIncluded:true}};
  await ingestEvidence(db,{payload,signature:await attestor.signMessage({message:evidenceMessage(payload)})},deployment,chain,{[attestor.address.toLowerCase()]:['order']},259202);
  await indexEconomy(db,deployment,chain);const value=await snapshot();
  expect(value.orders[0]).toMatchObject({costEvidenceSource:'independent-attestor',verifiedIntermediateInputAtomic:'7',verifiedResourceCostAtomic:'106',verifiedFinalOutputAtomic:'400',costEvidenceReference:canonicalJsonHash(payload),valuationReference:canonicalJsonHash(payload)});
  expect(value.productionAccounts).toHaveLength(2);
 });
 it('appends a producer-only historical day when its late statement arrives two days later',async()=>{
  await makeOrder(hash('4'),15,259202);finalized=16n;await indexEconomy(db,deployment,chain);
  expect((await db.query('SELECT * FROM economy_observations WHERE window_start=259200 AND window_end=345600')).rows).toHaveLength(0);
  const previousHashes=(await db.query('SELECT observation_hash FROM economy_observations')).rows.map(r=>r.observation_hash);
  await account(hash('4'),432001);expect(await indexEconomy(db,deployment,chain)).toMatchObject({changed:true});
  const historical=(await db.query('SELECT metrics FROM economy_observations WHERE window_start=259200 AND window_end=345600 ORDER BY created_at DESC LIMIT 1')).rows[0].metrics;
  expect(historical).toMatchObject({gapAtomic:'70',surplusAtomic:'65',productivityBps:null});
  const retained=(await db.query('SELECT observation_hash FROM economy_observations')).rows.map(r=>r.observation_hash);expect(retained).toEqual(expect.arrayContaining(previousHashes));
 });

});
