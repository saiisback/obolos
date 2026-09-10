import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {NextRequest} from 'next/server';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
const transport=vi.hoisted(()=>({query:undefined as unknown,verify:vi.fn()}));
vi.mock('../src/lib/platform/db',()=>({sql:()=>transport.query,databaseConfigured:()=>true}));
vi.mock('../src/lib/market/chain',()=>({verifyMarketTransfer:transport.verify}));
// This suite tests SQL result acceptance; independent proof validation has its own tests.
vi.mock('../src/lib/platform/settlement-proof',()=>({verifyHostedSettlement:async()=>[{network:'hedera:testnet',verified:true},{network:'arc:testnet',verified:true}]}));
import {issueChallenge,redeemChallenge,CHALLENGE_COOKIE} from '../src/lib/platform/auth';
import {createAgent} from '../src/lib/platform/agents';
import {pairRunner,prepareMandate,approveMandate,authenticateRunner,claimJob,queueRun,saveRunnerResult} from '../src/lib/platform/execution';
import {createRun} from '../src/lib/engine';
import type {Report} from '../src/lib/contracts';
import {createMarketService,updateMarketService,createMarketOrder,confirmMarketOrder,marketEarnings} from '../src/lib/platform/marketplace';

describe.skipIf(!process.env.TEST_DATABASE_URL)('PostgreSQL marketplace',()=>{
 let admin:pg.Pool,pool:pg.Pool;
 const schema=`obolos_market_test_${randomUUID().replaceAll('-','')}`;
 beforeAll(async()=>{
  vi.stubEnv('APP_ORIGIN','https://obolos.app');admin=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});await admin.query(`CREATE SCHEMA ${schema}`);
  pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema}`,max:10});
  for(const name of(await readdir('db/migrations')).filter(n=>n.endsWith('.sql')).sort())await pool.query(await readFile(`db/migrations/${name}`,'utf8'));
  type Query={text:string;values:unknown[];then:PromiseLike<pg.QueryResultRow[]>['then']};
  function query(parts:TemplateStringsArray,...values:unknown[]):Query{const text=parts.reduce((s,p,i)=>s+(i?`$${i}`:'')+p,'');return {text,values,then(resolve,reject){return pool.query(text,values).then(r=>r.rows).then(resolve,reject);}};}
  query.transaction=async(queries:Query[])=>{const client=await pool.connect();try{await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');const results=[];for(const q of queries)results.push((await client.query(q.text,q.values)).rows);await client.query('COMMIT');return results;}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}};
  transport.query=query;transport.verify.mockImplementation(async(hash:string)=>({transactionHash:hash,chainId:5042002,timestamp:String(Math.floor(Date.now()/1000))}));
 });
 afterAll(async()=>{await pool?.end();if(admin){await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();}vi.unstubAllEnvs();});
 async function identity(){const wallet=privateKeyToAccount(generatePrivateKey()),challenge=await issueChallenge({address:wallet.address}),signature=await wallet.signMessage({message:challenge.message});const auth=await redeemChallenge(new NextRequest('https://obolos.app/api/auth/verify',{headers:{cookie:`${CHALLENGE_COOKIE}=${challenge.token}`}}),{signature});return {...auth,wallet};}
 async function setup(){
  const seller=await identity(),buyer=await identity(),service=await createMarketService(seller.user,{name:'Hosted verifier',description:'Exact repo metrics',priceAtomic:1000});
  const agent=await createAgent(buyer.user.id,{name:'Buyer',description:'',dataBudgetAtomic:300000,verificationBudgetAtomic:50000});
  const prepared=await prepareMandate(buyer.user,agent.id,{phase:'prepare',repos:['openai/codex'],maxDataUnitPriceAtomic:150000,maxRuns:3,expiresAt:new Date(Date.now()+3600000).toISOString(),verificationServiceId:service.id});
  await approveMandate(buyer.user,agent.id,{phase:'approve',mandateId:prepared.mandate.id,signature:await buyer.wallet.signMessage({message:prepared.message})});
  const paired=await pairRunner(buyer.user.id,agent.id),runner=await authenticateRunner(`Bearer ${paired.token}`);await claimJob(runner);
  async function job(){await queueRun(agent.id,{repos:['openai/codex']},randomUUID());return (await claimJob(runner)).job!;}
  const now=new Date().toISOString(),report={title:'Report',summary:'openai/codex | stars=123 | forks=45 | openIssues=6',recommendation:'Observe.',generatedBy:'model',createdAt:now,checks:[],verified:false,evidence:[{repo:'openai/codex',description:'',stars:123,forks:45,openIssues:6,pushedAt:now,language:'TypeScript',license:'MIT',sourceUrl:'https://api.github.com/repos/openai/codex',fetchedAt:now}]};
  async function purchase(){const tx=`0.0.123@${Date.now()}.${Math.floor(Math.random()*1000000)}`;await pool.query("INSERT INTO platform_service_payments(transaction_id,provider_id,repos,amount_atomic,state,evidence,settlement) VALUES($1,'repo-standard',$2,100000,'settled',$3,$4)",[tx,JSON.stringify(['openai/codex']),JSON.stringify(report.evidence),JSON.stringify({transaction:tx,success:true})]);return tx;}
  return {seller,buyer,service,runner,job,report,purchase};
 }
 it('enforces seller ownership and blocks repriced signed selections',async()=>{const f=await setup();await expect(updateMarketService(f.buyer.user,f.service.id,{priceAtomic:2000})).rejects.toMatchObject({status:404});await expect(createMarketService(f.seller.user,{name:'Bad',description:'',priceAtomic:1000,recipient:f.buyer.user.address})).rejects.toThrow();await updateMarketService(f.seller.user,f.service.id,{priceAtomic:2000});await expect(createMarketOrder(f.runner,{jobId:(await f.job()).id,payer:f.buyer.user.address,dataTransactionId:await f.purchase(),report:f.report})).rejects.toMatchObject({code:'SERVICE_CHANGED'});});
 it('rejects fabricated evidence and paused listings before issuing an order',async()=>{const f=await setup(),job=await f.job(),dataTransactionId=await f.purchase(),input={jobId:job.id,payer:f.buyer.user.address,dataTransactionId,report:f.report};await expect(createMarketOrder(f.runner,{...input,report:{...f.report,evidence:[{...f.report.evidence[0],stars:999}]}})).rejects.toMatchObject({code:'PAID_EVIDENCE_REQUIRED'});await updateMarketService(f.seller.user,f.service.id,{active:false});await expect(createMarketOrder(f.runner,input)).rejects.toMatchObject({code:'SERVICE_NOT_FOUND'});});
 it('round-trips signed JSONB, reserves one immutable order, enforces global payment uniqueness and isolates earnings',async()=>{
  const f=await setup(),job=await f.job(),input={jobId:job.id,payer:f.buyer.user.address,dataTransactionId:await f.purchase(),report:f.report};
  const concurrent=await Promise.all([createMarketOrder(f.runner,input),createMarketOrder(f.runner,input)]);expect(concurrent[0].id).toBe(concurrent[1].id);const order=concurrent[0];
  await expect(createMarketOrder(f.runner,{...input,payer:f.seller.user.address})).rejects.toMatchObject({code:'ORDER_CONFLICT'});
  await expect(createMarketOrder(f.runner,{...input,report:{...f.report,summary:'Changed'}})).rejects.toMatchObject({code:'ORDER_CONFLICT'});
  const hash=`0x${'a'.repeat(64)}`,confirmed=await confirmMarketOrder(f.runner,order.id,{transactionHash:hash});expect(confirmed.status).toBe('fulfilled');expect(confirmed.result?.checks.every(c=>c.passed)).toBe(true);
  const before=transport.verify.mock.calls.length;expect(await confirmMarketOrder(f.runner,order.id,{transactionHash:hash})).toEqual(confirmed);expect(transport.verify.mock.calls.length).toBe(before);
  const secondJob=await f.job();await expect(createMarketOrder(f.runner,{...input,jobId:secondJob.id})).rejects.toMatchObject({code:'EVIDENCE_REUSED'});const second=await createMarketOrder(f.runner,{...input,jobId:secondJob.id,dataTransactionId:await f.purchase()});await expect(confirmMarketOrder(f.runner,second.id,{transactionHash:hash})).rejects.toMatchObject({code:'PAYMENT_REUSED'});
  expect((await marketEarnings(f.seller.user.id)).totalAtomic).toBe('1000');expect(await marketEarnings(f.buyer.user.id)).toEqual({orders:[],totalAtomic:'0'});
  expect((await pool.query('SELECT status FROM platform_market_orders WHERE id=$1',[second.id])).rows[0].status).toBe('quoted');
 });
 function uploadResult(job:NonNullable<Awaited<ReturnType<typeof claimJob>>['job']>,report:Report,dataTx:string,arcTx:string){
  const run=createRun({mode:'live',repos:job.repos,mandate:job.mandate});run.id=job.id;run.status='failed';run.stage='report';run.error='Test stopped after payment';run.selectedProvider='repo-standard';run.evidence=report.evidence;run.report=report;run.dataSpentAtomic=100000;run.verificationSpentAtomic=job.mandate.verificationService!.priceAtomic;
  const common={mode:'live' as const,status:'settled' as const,units:1,timestamp:new Date().toISOString()};
  run.receipts=[{...common,id:randomUUID(),requestId:`${job.id}:data`,network:'hedera:testnet',asset:'HBAR',amountAtomic:100000,provider:'repo-standard',transactionId:dataTx},{...common,id:randomUUID(),requestId:`${job.id}:verify`,network:'arc:testnet',asset:'USDC',amountAtomic:run.verificationSpentAtomic,provider:'arc-verifier',transactionId:arcTx,orderId:randomUUID(),recipient:job.mandate.verificationService!.recipient}];return run;
 }
 async function claimCount(){return (await pool.query('SELECT count(*)::int AS count FROM platform_chain_receipts')).rows[0].count;}
 it('serializes exact upload replay and never claims new receipts for a terminal result conflict',async()=>{
  const f=await setup(),job=await f.job(),run=uploadResult(job,f.report as Report,'0.0.123@1999999999.1',`0x${'b'.repeat(64)}`),before=await claimCount();
  const repeated=await Promise.all([saveRunnerResult(f.runner,job.id,{result:run}),saveRunnerResult(f.runner,job.id,{result:run})]);expect(repeated[0]).toEqual(repeated[1]);expect(await claimCount()).toBe(before+2);
  const changed=structuredClone(run);changed.receipts[0].transactionId='0.0.123@1999999999.2';changed.receipts[1].transactionId=`0x${'c'.repeat(64)}`;
  await expect(saveRunnerResult(f.runner,job.id,{result:changed})).rejects.toMatchObject({code:'RESULT_CONFLICT'});expect(await claimCount()).toBe(before+2);
  expect((await pool.query('SELECT count(*)::int AS count FROM platform_chain_receipts WHERE transaction_id=ANY($1::text[])',[changed.receipts.map(r=>r.transactionId)])).rows[0].count).toBe(0);
  const rejected=await f.job(),rejectedRun=uploadResult(rejected,f.report as Report,'0.0.123@1999999999.3',`0x${'d'.repeat(64)}`);await pool.query("UPDATE platform_jobs SET status='failed' WHERE id=$1",[rejected.id]);await expect(saveRunnerResult(f.runner,rejected.id,{result:rejectedRun})).rejects.toMatchObject({code:'RESULT_CONFLICT'});expect(await claimCount()).toBe(before+2);
 });
 it('rolls back the first receipt claim when the second is already owned by another job',async()=>{
  const f=await setup(),owner=await f.job(),candidate=await f.job(),arcTx=`0x${'e'.repeat(64)}`,dataTx='0.0.123@1999999999.4';
  await pool.query("INSERT INTO platform_chain_receipts(network,transaction_id,job_id) VALUES('arc:testnet',$1,$2)",[arcTx,owner.id]);const before=await claimCount();
  await expect(saveRunnerResult(f.runner,candidate.id,{result:uploadResult(candidate,f.report as Report,dataTx,arcTx)})).rejects.toMatchObject({code:'PAYMENT_REUSED'});expect(await claimCount()).toBe(before);
  expect((await pool.query('SELECT count(*)::int AS count FROM platform_chain_receipts WHERE transaction_id=$1',[dataTx])).rows[0].count).toBe(0);
  expect((await pool.query('SELECT status,result FROM platform_jobs WHERE id=$1',[candidate.id])).rows[0]).toMatchObject({status:'running',result:null});
 });

 it('persists a proven paid negative verification as failed rather than uncertain',async()=>{
  const f=await setup(),job=await f.job(),run=uploadResult(job,f.report as Report,'0.0.123@1999999999.5',`0x${'f'.repeat(64)}`);run.stage='verification';run.error='The paid verification found invalid evidence. Review the recorded receipt and failed checks.';run.report!.checks=[{label:'Claim scope',passed:false,detail:'Duplicate quantitative claims'}];
  const saved=await saveRunnerResult(f.runner,job.id,{result:run});expect(saved.run.status).toBe('failed');expect(saved.run.receiptVerification).toBe('chain-confirmed');expect((await pool.query('SELECT count(*)::int AS count FROM platform_chain_receipts WHERE job_id=$1',[job.id])).rows[0].count).toBe(2);
 });

});
