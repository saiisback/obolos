import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {readFile,readdir} from 'node:fs/promises';
import {randomBytes,randomUUID} from 'node:crypto';
import pg from 'pg';
import {NextRequest} from 'next/server';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
const transport=vi.hoisted(()=>({query:undefined as unknown,verify:vi.fn(),deliver:vi.fn()}));
vi.mock('../src/lib/platform/db',()=>({sql:()=>transport.query,databaseConfigured:()=>true}));
vi.mock('../src/lib/market/chain',()=>({verifyMarketTransfer:transport.verify}));
vi.mock('../src/lib/market/remote-verifier',async original=>({...await original<object>(),requestRemoteVerification:transport.deliver}));
import {issueChallenge,redeemChallenge,CHALLENGE_COOKIE} from '../src/lib/platform/auth';
import {createAgent} from '../src/lib/platform/agents';
import {pairRunner,prepareMandate,approveMandate,authenticateRunner,claimJob,queueRun} from '../src/lib/platform/execution';
import {createMarketService,updateMarketService,createMarketOrder,confirmMarketOrder,marketEarnings,retryMarketDelivery,getPublicMarketReceipt,marketServiceHistory,getVerificationService} from '../src/lib/platform/marketplace';

describe.skipIf(!process.env.TEST_DATABASE_URL)('PostgreSQL external provider payment and delivery',()=>{
 let admin:pg.Pool,pool:pg.Pool;
 const schema=`obolos_external_test_${randomUUID().replaceAll('-','')}`;
 beforeAll(async()=>{
  vi.stubEnv('APP_ORIGIN','https://obolos.app');admin=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});await admin.query(`CREATE SCHEMA ${schema}`);
  pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema}`,max:10});
  for(const name of(await readdir('db/migrations')).filter(n=>n.endsWith('.sql')).sort())await pool.query(await readFile(`db/migrations/${name}`,'utf8'));
  type Query={text:string;values:unknown[];then:PromiseLike<pg.QueryResultRow[]>['then']};
  function query(parts:TemplateStringsArray,...values:unknown[]):Query{const text=parts.reduce((s,p,i)=>s+(i?`$${i}`:'')+p,'');return {text,values,then(resolve,reject){return pool.query(text,values).then(r=>r.rows).then(resolve,reject);}};}
  query.transaction=async(queries:Query[])=>{const client=await pool.connect();try{await client.query('BEGIN');const results=[];for(const q of queries)results.push((await client.query(q.text,q.values)).rows);await client.query('COMMIT');return results;}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}};
  transport.query=query;
 });
 beforeEach(()=>{
  transport.verify.mockReset().mockImplementation(async(hash:string,order:Record<string,unknown>)=>({transactionHash:hash,chainId:5042002,timestamp:String(Math.floor(Date.now()/1000)),token:'0x3600000000000000000000000000000000000000',payer:order.payer,recipient:order.recipient,amountAtomic:order.amountAtomic}));
  transport.deliver.mockReset().mockResolvedValue({checks:[{label:'Provider assertion',passed:true,detail:'External result'}]});
 });
 afterAll(async()=>{await pool?.end();if(admin){await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();}vi.unstubAllEnvs();});
 async function identity(){const wallet=privateKeyToAccount(generatePrivateKey()),challenge=await issueChallenge({address:wallet.address}),signature=await wallet.signMessage({message:challenge.message});const auth=await redeemChallenge(new NextRequest('https://obolos.app/api/auth/verify',{headers:{cookie:`${CHALLENGE_COOKIE}=${challenge.token}`}}),{signature});return {...auth,wallet};}
 async function setup(){
  const seller=await identity(),buyer=await identity(),service=await createMarketService(seller.user,{name:'Seller endpoint',description:'Repository checks',priceAtomic:1000,execution:'external-repo-verifier',providerEndpoint:'https://provider.example.com/verify'});
  const agent=await createAgent(buyer.user.id,{name:'Buyer',description:'',dataBudgetAtomic:300000,verificationBudgetAtomic:50000});
  const prepared=await prepareMandate(buyer.user,agent.id,{phase:'prepare',repos:['openai/codex'],maxDataUnitPriceAtomic:150000,maxRuns:3,expiresAt:new Date(Date.now()+3600000).toISOString(),verificationServiceId:service.id});
  await approveMandate(buyer.user,agent.id,{phase:'approve',mandateId:prepared.mandate.id,signature:await buyer.wallet.signMessage({message:prepared.message})});
  const paired=await pairRunner(buyer.user.id,agent.id),runner=await authenticateRunner(`Bearer ${paired.token}`);await claimJob(runner);
  const now=new Date().toISOString(),report={title:'Report',summary:'openai/codex | stars=123 | forks=45 | openIssues=6',recommendation:'Observe.',generatedBy:'model',createdAt:now,checks:[],verified:false,evidence:[{repo:'openai/codex',description:'',stars:123,forks:45,openIssues:6,pushedAt:now,language:'TypeScript',license:'MIT',sourceUrl:'https://api.github.com/repos/openai/codex',fetchedAt:now}]};
  async function order(){
   await queueRun(agent.id,{repos:['openai/codex']},randomUUID());const job=(await claimJob(runner)).job!;
   const tx=`0.0.123@${Date.now()}.${Math.floor(Math.random()*1000000)}`;await pool.query("INSERT INTO platform_service_payments(transaction_id,provider_id,repos,amount_atomic,state,evidence,settlement) VALUES($1,'repo-standard',$2,100000,'settled',$3,$4)",[tx,JSON.stringify(['openai/codex']),JSON.stringify(report.evidence),JSON.stringify({transaction:tx,success:true})]);
   return createMarketOrder(runner,{jobId:job.id,payer:buyer.user.address,dataTransactionId:tx,report});
  }
  return {seller,buyer,service,agent,runner,prepared,report,order};
 }
 function hash(){return `0x${randomBytes(32).toString('hex')}`;}
 it('binds a public endpoint to v3 signatures and immutable history, rejecting type reassignment',async()=>{
  const f=await setup();expect(f.prepared.message).toContain('mandate v3');expect(f.prepared.message).toContain('https://provider.example.com/verify');
  expect(await getVerificationService(f.service.id)).toMatchObject({execution:'external-repo-verifier',providerEndpoint:'https://provider.example.com/verify'});
  await updateMarketService(f.seller.user,f.service.id,{providerEndpoint:'https://new-provider.example.com/check',priceAtomic:2000});
  expect(await marketServiceHistory(f.service.id)).toMatchObject([{revision:2,providerEndpoint:'https://new-provider.example.com/check'},{revision:1,providerEndpoint:'https://provider.example.com/verify'}]);
  await expect(f.order()).rejects.toMatchObject({code:'MANDATE_REQUIRED'});
  await expect(updateMarketService(f.seller.user,f.service.id,{execution:'hosted-metric-verifier'})).rejects.toThrow();
  await expect(pool.query("UPDATE platform_market_services SET execution='hosted-metric-verifier',provider_endpoint=NULL,revision=revision+1 WHERE id=$1",[f.service.id])).rejects.toThrow('immutable');
 });
 it('persists canonical payment before delivery and exposes only minimal paid receipt metadata',async()=>{
  const f=await setup(),order=await f.order(),transactionHash=hash();
  await expect(getPublicMarketReceipt(order.id)).rejects.toMatchObject({code:'RECEIPT_NOT_FOUND'});
  transport.deliver.mockImplementationOnce(async(input)=>{
   const receipt=await getPublicMarketReceipt(order.id);
   expect(receipt).toMatchObject({status:'paid',transactionHash,reportDigest:order.reportDigest,chainConfirmed:true});
   expect(receipt).not.toHaveProperty('report');expect(receipt).not.toHaveProperty('payer');expect(receipt).not.toHaveProperty('jobId');expect(receipt.proofDigest).toHaveLength(64);
   expect(input).toMatchObject({endpoint:'https://provider.example.com/verify',idempotencyKey:`obolos-order:${order.id}`,report:f.report,order:{id:order.id,receiptUrl:`https://obolos.app/api/market/orders/${order.id}/receipt`}});
   return {checks:[{label:'Claim check',passed:false,detail:'Seller disputes this claim'}]};
  });
  const result=await confirmMarketOrder(f.runner,order.id,{transactionHash});expect(result).toMatchObject({status:'fulfilled',chainConfirmed:true,result:{checks:[{passed:false}]}});
  expect(await confirmMarketOrder(f.runner,order.id,{transactionHash})).toEqual(result);expect(transport.verify).toHaveBeenCalledTimes(1);expect(transport.deliver).toHaveBeenCalledTimes(1);
  const second=await f.order();await expect(confirmMarketOrder(f.runner,second.id,{transactionHash})).rejects.toMatchObject({code:'PAYMENT_REUSED'});expect(transport.deliver).toHaveBeenCalledTimes(1);
 });
 it('keeps failed delivery paid in earnings, recovers via owner with original endpoint, and never repays',async()=>{
  const f=await setup(),order=await f.order(),transactionHash=hash();transport.deliver.mockRejectedValueOnce(new Error('provider unavailable'));
  await expect(confirmMarketOrder(f.runner,order.id,{transactionHash})).rejects.toMatchObject({code:'DELIVERY_FAILED'});
  expect((await marketEarnings(f.seller.user.id)).orders[0]).toMatchObject({status:'paid',chainConfirmed:true,deliveryError:expect.stringContaining('do not pay again')});
  expect((await marketEarnings(f.seller.user.id)).totalAtomic).toBe('1000');
  await expect(confirmMarketOrder(f.runner,order.id,{transactionHash:hash()})).rejects.toMatchObject({code:'ORDER_CONFLICT'});
  await expect(retryMarketDelivery(f.seller.user.id,order.id)).rejects.toMatchObject({code:'ORDER_NOT_FOUND'});
  await updateMarketService(f.seller.user,f.service.id,{providerEndpoint:'https://changed.example.com/verify',active:false});
  await pool.query('UPDATE platform_runners SET revoked_at=now() WHERE id=$1',[f.runner.id]);
  expect(await retryMarketDelivery(f.buyer.user.id,order.id)).toMatchObject({status:'fulfilled'});
  expect(transport.verify).toHaveBeenCalledTimes(1);expect(transport.deliver).toHaveBeenCalledTimes(2);
  expect(transport.deliver.mock.calls.map(([request])=>[request.endpoint,request.idempotencyKey])).toEqual([[f.service.providerEndpoint,`obolos-order:${order.id}`],[f.service.providerEndpoint,`obolos-order:${order.id}`]]);
 });
 it('serializes concurrent owner and runner delivery, supports expired-lease recovery and rejects unpaid retry',async()=>{
  const f=await setup(),order=await f.order(),transactionHash=hash();
  await expect(retryMarketDelivery(f.buyer.user.id,order.id)).rejects.toMatchObject({code:'PAID_ORDER_REQUIRED'});
  let enter!:()=>void,release!:(value:{checks:{label:string;passed:boolean;detail:string}[]})=>void;
  const entered=new Promise<void>(resolve=>{enter=resolve;});
  transport.deliver.mockImplementationOnce(()=>{enter();return new Promise(resolve=>{release=resolve;});});
  const first=confirmMarketOrder(f.runner,order.id,{transactionHash});await entered;
  await expect(retryMarketDelivery(f.buyer.user.id,order.id)).rejects.toMatchObject({code:'DELIVERY_PENDING'});
  await expect(confirmMarketOrder(f.runner,order.id,{transactionHash})).rejects.toMatchObject({code:'DELIVERY_PENDING'});
  expect(transport.deliver).toHaveBeenCalledTimes(1);release({checks:[{label:'Finished',passed:true,detail:'One delivery'}]});await expect(first).resolves.toMatchObject({status:'fulfilled'});
  const second=await f.order();transport.deliver.mockRejectedValueOnce(new Error('crash'));
  await expect(confirmMarketOrder(f.runner,second.id,{transactionHash:hash()})).rejects.toMatchObject({code:'DELIVERY_FAILED'});
  await pool.query("UPDATE platform_market_orders SET delivery_token=$2,delivery_lease_until=now()-interval '1 second' WHERE id=$1",[second.id,randomUUID()]);
  await expect(retryMarketDelivery(f.buyer.user.id,second.id)).resolves.toMatchObject({status:'fulfilled'});
 });
});
