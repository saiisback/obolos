import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import pg from 'pg';
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {keccak256,toHex,type Hex} from 'viem';

const transport=vi.hoisted(()=>({query:undefined as unknown}));
vi.mock('../src/lib/platform/db',()=>({sql:()=>transport.query}));
import {providerWorkAction} from '../src/lib/economy/provider-queue';
import {canonicalJsonHash,createServiceDefinition} from '../src/lib/economy/service-contract';
import {providerSchemas,providerUnits} from '../src/lib/economy/provider-work';
import deployment from '../src/lib/economy/deployment.json';
import type {ResourceCategory} from '../src/lib/economy/model';

const hash=(value:string)=>keccak256(toHex(value));
function record(category:ResourceCategory,label:string){
 const definition=createServiceDefinition({chainId:5042002,settlementAddress:deployment.settlement as Hex,ledgerAddress:deployment.ledger as Hex,seller:'0xd2137e6d65165400641aff0e34781d09a0215858',endpoint:`https://obolos.app/api/economy/reference/${category}`,category,unit:providerUnits[category],quantity:'1',unitPriceAtomic:'1000',inputSchema:providerSchemas[category].input,outputSchema:providerSchemas[category].output});
 const input=category==='data'?{repo:'saiisback/obolos'}:category==='verification'?{text:'read',sha256:'a'.repeat(64)}:category==='inference'?{prompt:'read'}:{text:'read'};
 const request={protocol:'obolos.service.v1',orderId:hash(label),agentId:hash('agent'),payer:'0x1111111111111111111111111111111111111111',serviceHash:definition.serviceHash,inputHash:canonicalJsonHash(input),category,unit:definition.unit,quantity:'1',unitPriceAtomic:'1000',amountAtomic:'1000',settlement:{chainId:5042002,address:deployment.settlement,ledgerAddress:deployment.ledger,transactionHash:hash('payment-'+label)},input};
 return {orderId:request.orderId,definition,request,requestHash:canonicalJsonHash(request)};
}

describe.skipIf(!process.env.TEST_DATABASE_URL)('PostgreSQL paid read retry boundary',()=>{
 let admin:pg.Client,db:pg.Client;const schema='obolos_provider_retry_'+randomUUID().replaceAll('-','');
 beforeAll(async()=>{
  admin=new pg.Client({connectionString:process.env.TEST_DATABASE_URL});await admin.connect();await admin.query(`CREATE SCHEMA ${schema}`);
  db=new pg.Client({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema}`});await db.connect();
  for(const name of(await readdir('db/migrations')).filter(name=>name.endsWith('.sql')).sort())await db.query(await readFile('db/migrations/'+name,'utf8'));
  transport.query=async(parts:TemplateStringsArray,...values:unknown[])=>{const text=parts.reduce((result,part,index)=>result+(index?'$'+index:'')+part,'');return (await db.query(text,values)).rows;};
 },30000);
 afterAll(async()=>{await db?.end();if(admin){await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();}});
 async function insert(category:ResourceCategory,label:string,overrides:{state?:string;output?:unknown;outputHash?:string|null;attestationHash?:string|null;requestHash?:string}={}){
  const value=record(category,label),token=randomUUID();await db.query('INSERT INTO economy_provider_jobs(order_id,request_hash,request,definition,paid_at,state,claim_token,lease_started_at,output,output_hash,attestation_hash) VALUES($1,$2,$3,$4,100,$5,$6,200,$7,$8,$9)',[value.orderId,overrides.requestHash??value.requestHash,value.request,value.definition,overrides.state??'failed',token,overrides.output??null,overrides.outputHash??null,overrides.attestationHash??null]);return {...value,token};
 }
 it('reopens the same failed data claim idempotently without changing its paid request',async()=>{
  const value=await insert('data','retry-data');const before=(await db.query('SELECT request_hash,request,definition,paid_at,claim_token,lease_started_at FROM economy_provider_jobs WHERE order_id=$1',[value.orderId])).rows[0];
  await expect(providerWorkAction({action:'retry-read',orderId:value.orderId,token:value.token})).resolves.toEqual({state:'running'});
  await expect(providerWorkAction({action:'retry-read',orderId:value.orderId,token:value.token})).resolves.toEqual({state:'running'});
  const after=(await db.query('SELECT state,request_hash,request,definition,paid_at,claim_token,lease_started_at FROM economy_provider_jobs WHERE order_id=$1',[value.orderId])).rows[0];expect(after).toEqual({state:'running',...before});
 });
 it('rejects charged, leased, completed, evidenced, and request-mismatched jobs',async()=>{
  const values=[
   await insert('inference','retry-inference'),await insert('storage','retry-storage'),await insert('data','retry-completed',{state:'completed',output:{saved:true},outputHash:hash('saved')}),await insert('compute','retry-output',{output:{saved:true},outputHash:hash('output')}),await insert('verification','retry-attested',{attestationHash:hash('attested')}),await insert('data','retry-mismatch',{requestHash:hash('different-request')}),
  ];
  for(const value of values)await expect(providerWorkAction({action:'retry-read',orderId:value.orderId,token:value.token})).rejects.toMatchObject({code:'READ_RETRY_NOT_ALLOWED'});
  expect((await db.query("SELECT count(*)::int AS count FROM economy_provider_jobs WHERE state='running'")).rows[0].count).toBe(1);
 });
});
