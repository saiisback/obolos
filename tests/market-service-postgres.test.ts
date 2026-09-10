import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
const transport=vi.hoisted(()=>({query:undefined as unknown}));
vi.mock('../src/lib/platform/db',()=>({sql:()=>transport.query}));
import {createMarketService,updateMarketService,marketServiceHistory,getVerificationService} from '../src/lib/platform/marketplace';

describe.skipIf(!process.env.TEST_DATABASE_URL)('PostgreSQL listing revision integrity',()=>{
 let admin:pg.Pool,pool:pg.Pool;
 const schema=`obolos_service_test_${randomUUID().replaceAll('-','')}`;
 const owner={id:randomUUID(),address:`0x${'1'.repeat(40)}`},other={id:randomUUID(),address:`0x${'2'.repeat(40)}`},agentId=randomUUID(),legacyId=randomUUID();
 beforeAll(async()=>{
  vi.stubEnv('APP_ORIGIN','https://obolos.app');
  admin=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});await admin.query(`CREATE SCHEMA ${schema}`);
  pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema}`,max:10});
  const migrations=(await readdir('db/migrations')).filter(n=>n.endsWith('.sql')).sort();
  for(const name of migrations.filter(n=>n<'008'))await pool.query(await readFile(`db/migrations/${name}`,'utf8'));
  await pool.query('INSERT INTO platform_users(id,address) VALUES($1,$2),($3,$4)',[owner.id,owner.address,other.id,other.address]);
  await pool.query("INSERT INTO platform_agents(id,user_id,name,data_budget_atomic,verification_budget_atomic) VALUES($1,$2,'Seller agent',0,0)",[agentId,owner.id]);
  await pool.query("INSERT INTO platform_market_services(id,user_id,name,description,recipient,price_atomic,revision) VALUES($1,$2,'Legacy','Original',$3,50000,4)",[legacyId,owner.id,owner.address]);
  for(const name of migrations.filter(n=>n>='008'))await pool.query(await readFile(`db/migrations/${name}`,'utf8'));
  transport.query=(parts:TemplateStringsArray,...values:unknown[])=>pool.query(parts.reduce((s,p,i)=>s+(i?`$${i}`:'')+p,''),values).then(r=>r.rows);
 });
 afterAll(async()=>{await pool?.end();if(admin){await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();}vi.unstubAllEnvs();});
 it('backfills only the known legacy revision without fabricating older history',async()=>{
  const rows=await marketServiceHistory(legacyId);
  expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({revision:4,source:'backfill',priceAtomic:50000});
  expect(await getVerificationService(legacyId)).toMatchObject({id:legacyId,revision:4});
 });
 it('enforces owner attribution and cannot reassign a published service',async()=>{
  await expect(createMarketService(other,{name:'Forged',description:'',priceAtomic:1000,agentId})).rejects.toMatchObject({status:404});
  const listing=await createMarketService(owner,{name:'Verifier',description:'',priceAtomic:1000,agentId});
  expect(listing).toMatchObject({agentId,agentName:'Seller agent'});
  await expect(pool.query('UPDATE platform_market_services SET agent_id=NULL,agent_name=NULL,revision=revision+1 WHERE id=$1',[listing.id])).rejects.toThrow('immutable');
  expect(await marketServiceHistory(listing.id)).toHaveLength(1);
 });
 it('serializes simultaneous price edits and records each accepted revision atomically',async()=>{
  const listing=await createMarketService(owner,{name:'Concurrent',description:'',priceAtomic:1000});
  const updated=await Promise.all([updateMarketService(owner,listing.id,{priceAtomic:2000}),updateMarketService(owner,listing.id,{priceAtomic:3000})]);
  expect(updated.map(s=>s.revision).sort()).toEqual([2,3]);
  const history=await marketServiceHistory(listing.id);
  expect(history.map(s=>s.revision)).toEqual([3,2,1]);
  for(const s of updated)expect(history.find(r=>r.revision===s.revision)?.priceAtomic).toBe(s.priceAtomic);
  await expect(pool.query('UPDATE platform_market_service_revisions SET price_atomic=9999 WHERE service_id=$1',[listing.id])).rejects.toThrow('append-only');
  await expect(pool.query('DELETE FROM platform_market_service_revisions WHERE service_id=$1',[listing.id])).rejects.toThrow('append-only');
  await expect(pool.query('UPDATE platform_market_services SET price_atomic=9999 WHERE id=$1',[listing.id])).rejects.toThrow('advance');
  expect(await marketServiceHistory(listing.id)).toEqual(history);
  expect((await getVerificationService(listing.id)).priceAtomic).toBe(history[0].priceAtomic);
 });
});
