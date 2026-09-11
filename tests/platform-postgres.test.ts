import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { NextRequest } from 'next/server';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

// Replace only Neon's HTTPS transport with a real PostgreSQL connection. All
// production SQL, ownership checks, signatures, routes and transactions run.
const transport = vi.hoisted(() => ({query: undefined as unknown}));
vi.mock('../src/lib/platform/db', () => ({sql:()=>transport.query, databaseConfigured:()=>true}));
import { issueChallenge, redeemChallenge, requireUser, revokeSession, CHALLENGE_COOKIE, SESSION_COOKIE } from '../src/lib/platform/auth';
import { createAgent, listAgents } from '../src/lib/platform/agents';
import { issueAgentKey, listAgentKeys, revokeAgentKey, authenticateAgentKey } from '../src/lib/platform/credentials';
import { POST as runPost } from '../src/app/api/v1/agents/[id]/runs/route';
import { pairRunner, prepareMandate, approveMandate, authenticateRunner, claimJob, queueRun, revokeMandate, saveRunnerResult } from '../src/lib/platform/execution';
import { createRun } from '../src/lib/engine';
import { NeonDemoStore } from '../src/lib/platform/demo-store';

describe.skipIf(!process.env.TEST_DATABASE_URL)('PostgreSQL account isolation', () => {
  let admin: pg.Pool;
  let pool: pg.Pool;
  const schema = `obolos_test_${randomUUID().replaceAll('-','')}`;
  const input = {name:'Repository analyst', description:'Checks current activity', dataBudgetAtomic:300000, verificationBudgetAtomic:50000};
  beforeAll(async()=>{
    vi.stubEnv('APP_ORIGIN','https://obolos.app');
    admin = new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new pg.Pool({connectionString:process.env.TEST_DATABASE_URL, options:`-c search_path=${schema}`, max:10});
    for (const name of (await readdir('db/migrations')).filter(n=>n.endsWith('.sql')).sort()) await pool.query(await readFile(`db/migrations/${name}`,'utf8'));
    type Query = {text:string; values:unknown[]; then: PromiseLike<pg.QueryResultRow[]>['then']};
    function query(parts:TemplateStringsArray,...values:unknown[]):Query {
      const text = parts.reduce((s,p,i)=>s+(i?`$${i}`:'')+p,'');
      return {text, values, then(resolve,reject) {return pool.query(text,values).then(r=>r.rows).then(resolve,reject);}};
    }
    query.transaction = async (queries:Query[]) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
        const results=[];
        for (const q of queries) results.push((await client.query(q.text,q.values)).rows);
        await client.query('COMMIT');
        return results;
      } catch(error) {await client.query('ROLLBACK'); throw error;} finally {client.release();}
    };
    transport.query = query;
  });
  afterAll(async()=>{
    await pool?.end();
    if(admin){await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();}
    vi.unstubAllEnvs();
  });
  function request(name:string,token:string) {return new NextRequest('https://obolos.app/api/auth/verify',{headers:{cookie:`${name}=${token}`}});}
  async function identity() {
    const wallet = privateKeyToAccount(generatePrivateKey());
    const challenge = await issueChallenge({address:wallet.address});
    const signature = await wallet.signMessage({message:challenge.message});
    const auth = await redeemChallenge(request(CHALLENGE_COOKIE,challenge.token),{signature});
    return {...auth, wallet};
  }
  it('atomically consumes one browser-bound challenge even under concurrent replay',async()=>{
    const wallet = privateKeyToAccount(generatePrivateKey());
    const challenge = await issueChallenge({address:wallet.address});
    const signature = await wallet.signMessage({message:challenge.message});
    await expect(redeemChallenge(request(CHALLENGE_COOKIE,'0'.repeat(64)),{signature})).rejects.toMatchObject({code:'INVALID_SIGNATURE'});
    const result=await Promise.allSettled([1,2].map(()=>redeemChallenge(request(CHALLENGE_COOKIE,challenge.token),{signature})));
    expect(result.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    const sessions=await pool.query('SELECT count(*)::int AS count FROM platform_sessions s JOIN platform_users u ON u.id=s.user_id WHERE u.address=$1',[wallet.address.toLowerCase()]);
    expect(sessions.rows[0].count).toBe(1);
  });
  it('does not allocate limiter storage for invented challenge cookies',async()=>{
    const before = (await pool.query('SELECT count(*)::int AS count FROM platform_rate_limits')).rows[0].count;
    await expect(redeemChallenge(request(CHALLENGE_COOKIE,'a'.repeat(64)),{signature:`0x${'1'.repeat(130)}`})).rejects.toMatchObject({code:'INVALID_SIGNATURE'});
    const after = (await pool.query('SELECT count(*)::int AS count FROM platform_rate_limits')).rows[0].count;
    expect(after).toBe(before);
  });
  it('keeps users, agents and credentials separate and revokes sessions',async()=>{
    const a=await identity(), b=await identity();
    const agent=await createAgent(a.user.id,input);
    expect(await listAgents(b.user.id)).toEqual([]);
    await expect(issueAgentKey(b.user.id,agent.id,{name:'Stolen'})).rejects.toMatchObject({status:404});
    await expect(listAgentKeys(b.user.id,agent.id)).rejects.toMatchObject({status:404});
    const key=await issueAgentKey(a.user.id,agent.id,{name:'Application'});
    expect(JSON.stringify(await listAgentKeys(a.user.id,agent.id))).not.toContain(key.token);
    const stored=await pool.query('SELECT token_hash FROM platform_api_keys WHERE id=$1',[key.key.id]);
    expect(stored.rows[0].token_hash).not.toContain(key.token);
    await expect(authenticateAgentKey(`Bearer ${key.token}`,randomUUID())).rejects.toMatchObject({status:403});
    await expect(revokeAgentKey(b.user.id,agent.id,key.key.id)).rejects.toMatchObject({status:404});
    await revokeAgentKey(a.user.id,agent.id,key.key.id);
    await expect(authenticateAgentKey(`Bearer ${key.token}`,agent.id)).rejects.toMatchObject({status:401});
    const req=request(SESSION_COOKIE,a.token);
    expect(await requireUser(req)).toEqual(a.user);
    await revokeSession(req);
    await expect(requireUser(req)).rejects.toMatchObject({status:401});
  });
  it('enforces concurrent agent and active-key quotas with parent row locks',async()=>{
    const a=await identity();
    const agents=await Promise.allSettled(Array.from({length:27},(_,i)=>createAgent(a.user.id,{...input,name:`Agent ${i}`})));
    expect(agents.filter(r=>r.status==='fulfilled')).toHaveLength(25);
    const list=await listAgents(a.user.id);
    const keys=await Promise.allSettled(Array.from({length:12},(_,i)=>issueAgentKey(a.user.id,list[0].id,{name:`Key ${i}`})));
    expect(keys.filter(r=>r.status==='fulfilled')).toHaveLength(10);
    expect(await listAgentKeys(a.user.id,list[0].id)).toHaveLength(10);
  });
  it('rejects expired keys and a valid request cannot access the founder payment broker',async()=>{
    const a=await identity();
    const agent=await createAgent(a.user.id,input);
    const key=await issueAgentKey(a.user.id,agent.id,{name:'Worker'});
    const req=new NextRequest(`https://obolos.app/api/v1/agents/${agent.id}/runs`,{method:'POST',headers:{authorization:`Bearer ${key.token}`,'content-type':'application/json','idempotency-key':randomUUID()},body:JSON.stringify({repos:['octocat/Hello-World']})});
    const response=await runPost(req,{params:Promise.resolve({id:agent.id})});
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({code:'RUNNER_REQUIRED'});
    expect((await pool.query('SELECT count(*)::int AS count FROM platform_jobs')).rows[0].count).toBe(0);
    await pool.query("UPDATE platform_api_keys SET created_at=now()-interval '2 days',expires_at=now()-interval '1 day' WHERE id=$1",[key.key.id]);
    await expect(authenticateAgentKey(`Bearer ${key.token}`,agent.id)).rejects.toMatchObject({status:401});
  });
  it('atomically reserves mandate runs, claims once and persists immutable runner results',async()=>{
    const a=await identity();
    const agent=await createAgent(a.user.id,input);
    const prepared=await prepareMandate(a.user,agent.id,{phase:'prepare',repos:['octocat/Hello-World','vercel/next.js'],maxDataUnitPriceAtomic:150000,maxRuns:2,expiresAt:new Date(Date.now()+3600000).toISOString()});
    await approveMandate(a.user,agent.id,{phase:'approve',mandateId:prepared.mandate.id,signature:await a.wallet.signMessage({message:prepared.message})});
    const paired=await pairRunner(a.user.id,agent.id);
    const runner=await authenticateRunner(`Bearer ${paired.token}`);
    await expect(queueRun(agent.id,{repos:['octocat/Hello-World']},'before-heartbeat')).rejects.toMatchObject({code:'RUNNER_REQUIRED'});
    expect(await claimJob(runner)).toEqual({job:null});
    const queued=await Promise.allSettled([1,2,3].map(i=>queueRun(agent.id,{repos:['octocat/Hello-World']},`job-${i}`)));
    const successes=queued.filter((r):r is PromiseFulfilledResult<Awaited<ReturnType<typeof queueRun>>>=>r.status==='fulfilled');
    expect(successes).toHaveLength(2);
    const firstKey=queued.findIndex(r=>r.status==='fulfilled')+1;
    const replay=await queueRun(agent.id,{repos:['octocat/Hello-World']},`job-${firstKey}`);
    expect(replay.replayed).toBe(true);
    expect(replay.run.id).toBe(successes[0].value.run.id);
    await expect(queueRun(agent.id,{repos:['vercel/next.js']},`job-${firstKey}`)).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
    const claims=await Promise.all([claimJob(runner),claimJob(runner),claimJob(runner)]);
    const jobs=claims.flatMap(c=>c.job?[c.job]:[]);
    expect(jobs).toHaveLength(2);expect(new Set(jobs.map(j=>j.id)).size).toBe(2);
    const job=jobs[0],m=job.mandate;
    const result=createRun({mode:'live',repos:job.repos,mandate:{dataBudgetAtomic:m.dataBudgetAtomic,verificationBudgetAtomic:m.verificationBudgetAtomic,maxDataUnitPriceAtomic:m.maxDataUnitPriceAtomic,allowedProviders:m.allowedProviders,expiresAt:m.expiresAt}});
    result.id=job.id;result.status='failed';result.error='Test stopped before any capability.';
    const saved=await saveRunnerResult(runner,job.id,{result});
    expect(saved.run.status).toBe('failed');
    expect((await saveRunnerResult(runner,job.id,{result})).run.id).toBe(job.id);
    await expect(saveRunnerResult(runner,job.id,{result:{...result,error:'Different terminal result'}})).rejects.toMatchObject({code:'RESULT_CONFLICT'});
    const count=await pool.query('SELECT reserved_runs FROM platform_mandates WHERE id=$1',[m.id]);expect(count.rows[0].reserved_runs).toBe(2);
    await revokeMandate(a.user.id,agent.id);
    await expect(queueRun(agent.id,{repos:['octocat/Hello-World']},'after-revoke')).rejects.toMatchObject({code:'MANDATE_REQUIRED'});
  });
  it('keeps serverless demo ownership and preserves interrupted-operation locks',async()=>{
    const store=new NeonDemoStore();
    const run=createRun({mode:'live',repos:['octocat/Hello-World']});
    await store.insert('test-owner',run);
    await expect(store.get('another-owner',run.id)).rejects.toThrow('Run not found');
    let calls=0;
    await expect(store.mutate('test-owner',run.id,()=>{calls++;throw Error('Interrupted after dispatch');})).rejects.toThrow('Interrupted after dispatch');
    await expect(store.mutate('test-owner',run.id,r=>{calls++;return r;})).rejects.toThrow('will not be retried');
    expect(calls).toBe(1);
    expect((await store.get('test-owner',run.id)).status).toBe('failed');
  });
});
