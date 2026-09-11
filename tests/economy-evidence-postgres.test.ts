import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import pg from 'pg';
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {privateKeyToAccount} from 'viem/accounts';
import {canonicalJson,canonicalJsonHash} from '../src/lib/economy/service-contract';
import {ingestEvidence} from '../src/lib/economy/evidence';
import {indexEconomy as indexEconomyOnce} from '../src/lib/economy/indexer';
// Isolated schemas share PostgreSQL advisory locks; retry the documented busy result.
async function indexEconomy(...args:Parameters<typeof indexEconomyOnce>){for(let i=0;i<100;i++){const result=await indexEconomyOnce(...args);if(!('busy' in result&&result.busy))return result;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('Test index lock stayed busy');}
import {readRecoveryEvidence} from '../src/lib/economy/recovery-projection';
const address=(n:string)=>`0x${n.repeat(40)}` as `0x${string}`,hash=(n:string)=>`0x${n.repeat(64)}` as `0x${string}`;
const deployment={chainId:5042002 as const,policy:address('1'),ledger:address('2'),settlement:address('3'),fromBlock:'1',controller:address('4'),approver:address('5'),reserve:address('6'),reviewPool:address('7')};
const signer=privateKeyToAccount(`0x${'12'.repeat(32)}`),trust={[signer.address.toLowerCase()]:['order','window','basket']};
const base={protocol:'obolos.evidence.v1' as const,chainId:5042002 as const,policy:deployment.policy,ledger:deployment.ledger,settlement:deployment.settlement,asset:'USDC' as const,windowStart:86400,windowEnd:172800,issuedAt:172801,signer:signer.address.toLowerCase(),sourceReference:'ipfs://test-only-attestation',sourceHash:hash('a')};
const order={...base,kind:'order' as const,orderId:hash('a'),agentId:hash('b'),payer:address('b'),seller:address('c'),inputHash:hash('c'),outputHash:hash('d'),transactionHash:hash('e'),finalOutputAtomic:'300',intermediateInputAtomic:'20',resourceCostAtomic:'110',costBreakdown:{paymentAtomic:'100',gasAtomic:'5',inferenceAtomic:'5',otherAtomic:'0',conversionReference:'test-only-conversion',allResourcesIncluded:true as const}};
async function signed(payload:unknown){return {payload,signature:await signer.signMessage({message:`Obolos economic evidence v1\n${canonicalJson(payload)}`})};}
const chain={getChainId:async()=>5042002,getBlock:async({blockNumber}:{blockNumber?:bigint})=>({number:blockNumber??10n,hash:hash('f'),timestamp:blockNumber===9n?172799n:172802n}),getLogs:async()=>[],readContract:async({functionName}:{functionName:string})=>functionName==='executorOwners'?'0x0000000000000000000000000000000000000000':functionName==='agents'?[address('b'),address('d'),true]:functionName==='categories'?[true,1000n,10000n,86400n,0n]:functionName==='reputation'?[1n,1n,1n]:functionName==='marketEnabled'?true:1n} as unknown as Parameters<typeof indexEconomy>[2];
describe.skipIf(!process.env.TEST_DATABASE_URL)('PostgreSQL signed economic evidence',()=>{
 let admin:pg.Client,db:pg.Client;const schema=`obolos_evidence_${randomUUID().replaceAll('-','')}`;
 beforeAll(async()=>{
  admin=new pg.Client({connectionString:process.env.TEST_DATABASE_URL});await admin.connect();await admin.query(`CREATE SCHEMA ${schema}`);
  db=new pg.Client({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema}`});await db.connect();
  for(const name of(await readdir('db/migrations')).filter(name=>name.endsWith('.sql')).sort())await db.query(await readFile(`db/migrations/${name}`,'utf8'));
  await db.query('INSERT INTO economy_index_state(settlement_address,block_number,block_hash,snapshot) VALUES($1,10,$2,$3)',[deployment.settlement,hash('f'),JSON.stringify({})]);
  const events=[
   ['AgentRegistered',deployment.policy,{agentId:order.agentId,owner:order.payer,executor:address('d')},80000,1],
   ['ServiceRegistered',deployment.settlement,{serviceHash:hash('1'),seller:order.seller,category:'1',unitHash:hash('2'),quantity:'1',unitPrice:'100',endpointHash:hash('3')},80000,1],
   ['OrderPaid',deployment.ledger,{orderId:order.orderId,agentId:order.agentId,seller:order.seller,inputHash:order.inputHash,amount:'100',category:'1',quantity:'1',serviceHash:hash('1'),unitHash:hash('2')},90000,2],
   ['OrderSettled',deployment.settlement,{orderId:order.orderId,payer:order.payer,sellerAmount:'90'},90000,2],
   ['DeliveryAttested',deployment.ledger,{orderId:order.orderId,outputHash:order.outputHash},90001,3],
   ['BuyerAcknowledged',deployment.ledger,{orderId:order.orderId,outputHash:order.outputHash},90002,4],
  ];
  for(const [index,[event,contract,payload,timestamp,block]]of events.entries())await db.query('INSERT INTO economy_chain_events(chain_id,contract_address,transaction_hash,log_index,block_number,block_hash,block_timestamp,event_name,payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[deployment.chainId,contract,order.transactionHash,index,block,hash('f'),timestamp,event,JSON.stringify(payload)]);
 },30000);
 afterAll(async()=>{await db?.end();if(admin){await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();}});
 it('rejects cross-window output and owner/executor self-verification without inserting rows',{timeout:30000},async()=>{
  await expect(ingestEvidence(db,await signed({...order,windowStart:0,windowEnd:86400}),deployment,chain,trust,172802)).rejects.toThrow('window');
  const self={...order,signer:signer.address.toLowerCase(),payer:signer.address.toLowerCase()};await expect(ingestEvidence(db,await signed(self),deployment,chain,trust,172802)).rejects.toThrow('own valuation');
  await expect(ingestEvidence(db,await signed({...order,outputHash:hash('9')}),deployment,chain,trust,172802)).rejects.toThrow('match');
  expect((await db.query('SELECT * FROM economy_signed_evidence')).rows).toHaveLength(0);
 });
 it('rejects a trusted signer bound to the buyer directly or through an alternate registered executor',{timeout:30000},async()=>{
  for(const [first,next] of [[order.payer,null],[address('d'),order.payer]] as const){
   const linked={...chain,readContract:async(args:{functionName:string;args?:readonly string[]})=>args.functionName==='executorOwners'?(args.args?.[0]===signer.address.toLowerCase()?first:next&&args.args?.[0]===address('d')?next:'0x0000000000000000000000000000000000000000'):chain!.readContract(args as never)} as unknown as Parameters<typeof indexEconomy>[2];
   await expect(ingestEvidence(db,await signed(order),deployment,linked,trust,172802)).rejects.toMatchObject({status:403});
  }
  expect((await db.query('SELECT * FROM economy_signed_evidence')).rows).toHaveLength(0);
 });
 it('preserves exact replay, rejects conflicting attestations, and blocks evidence mutation',{timeout:30000},async()=>{
  expect(await ingestEvidence(db,await signed(order),deployment,chain,trust,172802)).toMatchObject({replayed:false});
  expect(await ingestEvidence(db,await signed(order),deployment,chain,trust,172802)).toMatchObject({replayed:true});
  await expect(ingestEvidence(db,await signed({...order,finalOutputAtomic:'999'}),deployment,chain,trust,172802)).rejects.toMatchObject({status:409});
  await expect(db.query("UPDATE economy_signed_evidence SET signer=$1",[address('9')])).rejects.toThrow('append-only');
  await expect(db.query('DELETE FROM economy_signed_evidence')).rejects.toThrow('append-only');
 });
 it('validates the historical active-agent denominator and exact block boundary',{timeout:30000},async()=>{
  const window={...base,kind:'window',capitalAtomic:'1000',activeAgentIds:[order.agentId],anchorBlock:'9',anchorBlockHash:hash('f')};
  await expect(ingestEvidence(db,await signed({...window,activeAgentIds:[]}),deployment,chain,trust,172802)).rejects.toThrow('denominator');
  await expect(ingestEvidence(db,await signed({...window,anchorBlock:'8'}),deployment,chain,trust,172802)).rejects.toThrow('boundary');
  await ingestEvidence(db,await signed(window),deployment,chain,trust,172802);
 });
 it('refreshes a stationary chain cursor with real valuations, costs and denominators',{timeout:30000},async()=>{
  await indexEconomy(db,deployment,chain);
  const snapshot=(await db.query('SELECT snapshot FROM economy_index_state')).rows[0].snapshot;
  expect(snapshot.metrics).toMatchObject({gapAtomic:'70',surplusAtomic:'-20',productivityBps:'27272',moneyVelocityBps:'700',utilizationBps:'10000',arpiBps:null});
  const components=[{id:'compute',category:'compute',unit:hash('2'),baselineAtomic:'100',weightBps:'10000',baselineServiceHash:hash('1'),quoteServiceHash:hash('1')}];
  const basket={...base,kind:'basket',basketId:canonicalJsonHash(components.map(({quoteServiceHash:_quote,...component})=>component)),components};
  await ingestEvidence(db,await signed(basket),deployment,chain,trust,172802);
  await indexEconomy(db,deployment,chain);
  const updated=(await db.query('SELECT snapshot FROM economy_index_state')).rows[0].snapshot;
  expect(updated.metrics.arpiBps).toBe('10000');expect(updated.quoteSelections[0].quoteServiceHash).toBe(hash('1'));
  expect((await db.query('SELECT * FROM economy_observations')).rows).toHaveLength(2);
  expect(await indexEconomy(db,deployment,chain)).toEqual({changed:false});
 });
 it('refreshes new reviews/disputes/refunds at the same block and isolates another deployment',{timeout:30000},async()=>{
  const userId=randomUUID(),agentId=randomUUID();
  await db.query('INSERT INTO platform_users(id,address) VALUES($1,$2)',[userId,order.payer]);
  await db.query("INSERT INTO platform_agents(id,user_id,name,data_budget_atomic,verification_budget_atomic) VALUES($1,$2,'Evidence test agent',0,1000)",[agentId,userId]);
  await db.query('INSERT INTO economy_services(service_hash,user_id,definition) VALUES($1,$2,$3)',[hash('1'),userId,JSON.stringify({seller:order.seller})]);
  const insertOrder=async(id:string,settlement:string,transaction:string)=>db.query("INSERT INTO economy_orders(order_id,user_id,platform_agent_id,service_hash,request_hash,request,definition,transaction_hash,receipt,state,output,output_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'{}','fulfilled','{}',$9)",[id,userId,agentId,hash('1'),order.inputHash,JSON.stringify({payer:order.payer,settlement:{chainId:5042002,address:settlement,ledgerAddress:deployment.ledger}}),JSON.stringify({seller:order.seller}),transaction,order.outputHash]);
  await insertOrder(order.orderId,deployment.settlement,order.transactionHash);
  await insertOrder(hash('9'),address('9'),hash('9'));
  const reviewer=address('8');vi.stubEnv('ECONOMY_REVIEW_SIGNERS',reviewer);
  await indexEconomy(db,deployment,chain);
  expect((await db.query('SELECT snapshot FROM economy_index_state')).rows[0].snapshot.reputation[0].qualityScore).toBeNull();
  const before=(await db.query('SELECT count(*)::int AS count FROM economy_observations')).rows[0].count;
  for(const id of [order.orderId,hash('9')]){
   await db.query("INSERT INTO economy_reviews(order_id,reviewer,output_hash,verdict,evidence_reference,evidence_hash) VALUES($1,$2,$3,'passed','https://example.test/actual-fixture-review',$4)",[id,reviewer,order.outputHash,hash('7')]);
   await db.query("INSERT INTO economy_disputes(order_id,user_id,reason) VALUES($1,$2,'private test-only reason')",[id,userId]);
   await db.query('INSERT INTO economy_refunds(chain_id,transaction_hash,log_index,order_id,seller,payer,amount_atomic) VALUES(5042002,$1,0,$2,$3,$4,10)',[id===order.orderId?hash('6'):hash('5'),id,order.seller,order.payer]);
  }
  const scoped=await readRecoveryEvidence(db,deployment);expect(scoped.reviews.map(r=>r.order_id)).toEqual([order.orderId]);expect(scoped.disputes.map(r=>r.order_id)).toEqual([order.orderId]);expect(scoped.refunds.map(r=>r.order_id)).toEqual([order.orderId]);
  expect(await indexEconomy(db,deployment,chain)).toMatchObject({changed:true});
  const snapshot=(await db.query('SELECT snapshot FROM economy_index_state')).rows[0].snapshot;
  expect(snapshot.reputation[0]).toMatchObject({verifiedReviews:1,reviewedOrders:1,qualityScore:'10000',disputeCount:1,refundCount:1,refundedAtomic:'10'});
  expect(snapshot.recovery.reviews).toHaveLength(1);expect(snapshot.recovery.disputes).toHaveLength(1);expect(snapshot.recovery.refunds).toHaveLength(1);
  expect(JSON.stringify(snapshot)).not.toContain('private test-only reason');
  expect((await db.query('SELECT count(*)::int AS count FROM economy_observations')).rows[0].count).toBe(before+1);
  vi.stubEnv('ECONOMY_REVIEW_SIGNERS','');
  expect(await indexEconomy(db,deployment,chain)).toMatchObject({changed:true});
  expect((await db.query('SELECT snapshot FROM economy_index_state')).rows[0].snapshot.reputation[0]).toMatchObject({qualityScore:null,verifiedReviews:0});
  vi.unstubAllEnvs();
 });
 it('excludes an otherwise trusted reviewer bound to an unregistered buyer alias',{timeout:30000},async()=>{
  const reviewer=address('8');vi.stubEnv('ECONOMY_REVIEW_SIGNERS',reviewer);
  const alternate={...chain,getBlock:async({blockNumber}:{blockNumber?:bigint})=>blockNumber===10n?{number:10n,hash:hash('f'),timestamp:172800n}:{number:blockNumber??11n,hash:hash('8'),timestamp:172801n},readContract:async(args:{functionName:string;args?:readonly string[]})=>args.functionName==='executorOwners'?(args.args?.[0]===reviewer?address('7'):args.args?.[0]===address('7')?order.payer:'0x0000000000000000000000000000000000000000'):chain!.readContract(args as never)} as unknown as Parameters<typeof indexEconomy>[2];
  await indexEconomy(db,deployment,alternate);
  const snapshot=(await db.query('SELECT snapshot FROM economy_index_state')).rows[0].snapshot;
  expect(snapshot.orders[0].sameOwner).toBe(false);
  expect(snapshot.reputation[0]).toMatchObject({qualityScore:null,verifiedReviews:0,reviewEligibleOrders:1});
  expect(snapshot.recovery.reviews[0].countsTowardReview).toBe(false);
  vi.unstubAllEnvs();
 });
 it('excludes a seller bound but not registered to the buyer controller from economic value and review scores',{timeout:30000},async()=>{
  const alternate={...chain,getBlock:async({blockNumber}:{blockNumber?:bigint})=>blockNumber===11n?{number:11n,hash:hash('8'),timestamp:172801n}:{number:blockNumber??12n,hash:hash('7'),timestamp:172802n},readContract:async(args:{functionName:string;args?:readonly string[]})=>args.functionName==='executorOwners'?(args.args?.[0]===order.seller?order.payer:'0x0000000000000000000000000000000000000000'):chain!.readContract(args as never)} as unknown as Parameters<typeof indexEconomy>[2];
  vi.stubEnv('ECONOMY_REVIEW_SIGNERS',address('8'));
  await indexEconomy(db,deployment,alternate);
  const snapshot=(await db.query('SELECT snapshot FROM economy_index_state')).rows[0].snapshot;
  expect(snapshot.orders[0].sameOwner).toBe(true);
  expect(snapshot.metrics).toMatchObject({excludedSelfPayments:1,gapAtomic:null,surplusAtomic:null,valuedSettlementCount:0});
  expect(snapshot.reputation[0]).toMatchObject({qualityScore:null,verifiedReviews:0,reviewEligibleOrders:0,disputeCount:1,refundCount:1});
  vi.unstubAllEnvs();
 });

});
