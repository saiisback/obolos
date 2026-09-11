import {beforeEach,describe,expect,it,vi} from 'vitest';
import {keccak256,toHex,type Hex} from 'viem';

const state=vi.hoisted(()=>({query:vi.fn(),job:null as null|Record<string,unknown>,updates:0}));
vi.mock('../src/lib/platform/db',()=>({sql:()=>state.query}));
import {providerWorkAction} from '../src/lib/economy/provider-queue';
import {canonicalJsonHash,createServiceDefinition} from '../src/lib/economy/service-contract';
import {providerSchemas,providerUnits} from '../src/lib/economy/provider-work';
import deployment from '../src/lib/economy/deployment.json';
import type {ResourceCategory} from '../src/lib/economy/model';

const orderId=keccak256(toHex('failed-paid-read'));
const token='11111111-1111-4111-8111-111111111111';
function definition(category:ResourceCategory){return createServiceDefinition({chainId:5042002,settlementAddress:deployment.settlement as Hex,ledgerAddress:deployment.ledger as Hex,seller:'0xd2137e6d65165400641aff0e34781d09a0215858',endpoint:`https://obolos.app/api/economy/reference/${category}`,category,unit:providerUnits[category],quantity:'1',unitPriceAtomic:'1000',inputSchema:providerSchemas[category].input,outputSchema:providerSchemas[category].output});}
function job(category:ResourceCategory,stateValue='failed'){const service=definition(category),input=category==='data'?{repo:'saiisback/obolos'}:category==='verification'?{text:'read',sha256:'a'.repeat(64)}:category==='inference'?{prompt:'read'}:{text:'read'};const request={protocol:'obolos.service.v1',orderId,agentId:keccak256(toHex('agent')),payer:'0x1111111111111111111111111111111111111111',serviceHash:service.serviceHash,inputHash:canonicalJsonHash(input),category,unit:service.unit,quantity:'1',unitPriceAtomic:'1000',amountAtomic:'1000',settlement:{chainId:5042002,address:deployment.settlement,ledgerAddress:deployment.ledger,transactionHash:keccak256(toHex('payment'))},input};return {order_id:orderId,claim_token:token,state:stateValue,request_hash:canonicalJsonHash(request),request,definition:service,paid_at:'100',lease_started_at:'200',output:null,output_hash:null,attestation_hash:null};}

beforeEach(()=>{
 state.job=job('data');state.updates=0;state.query.mockReset().mockImplementation(async(parts:TemplateStringsArray,...values:unknown[])=>{
  const sql=parts.join('?');
  if(sql.includes('SELECT * FROM economy_provider_jobs'))return state.job&&values[0]===state.job.order_id&&values[1]===state.job.claim_token?[{...state.job}]:[];
  if(sql.includes('UPDATE economy_provider_jobs')){
   state.updates++;
   if(!state.job||!['failed','running'].includes(String(state.job.state))||state.job.output!==null||state.job.output_hash!==null||state.job.attestation_hash!==null||!['data','compute','verification'].includes(String((state.job.definition as {category:string}).category)))return [];
   state.job={...state.job,state:'running'};return [{state:'running'}];
  }
  throw Error(`Unexpected SQL: ${sql}`);
 });
});

describe('operator retry for already paid read-only provider work',()=>{
 it.each(['data','compute','verification'] as const)('reopens failed %s work with the same immutable claim and request',async category=>{
  state.job=job(category);const before=structuredClone(state.job);
  await expect(providerWorkAction({action:'retry-read',orderId,token})).resolves.toEqual({state:'running'});
  expect(state.job).toMatchObject({...before,state:'running'});
  await expect(providerWorkAction({action:'retry-read',orderId,token})).resolves.toEqual({state:'running'});
  expect(state.updates).toBe(2);
 });
 it.each(['inference','storage'] as const)('never reopens failed %s work',async category=>{
  state.job=job(category);await expect(providerWorkAction({action:'retry-read',orderId,token})).rejects.toMatchObject({code:'READ_RETRY_NOT_ALLOWED'});expect(state.updates).toBe(0);
 });
 it.each([
  ['completed',job('data','completed')],
  ['queued',job('data','queued')],
  ['stored output',{...job('data'),output:{repo:'saved'},output_hash:keccak256(toHex('saved'))}],
  ['seller attestation',{...job('data'),attestation_hash:keccak256(toHex('attested'))}],
 ] as const)('rejects %s rather than repeating work',async(_label,value)=>{
  state.job={...value};await expect(providerWorkAction({action:'retry-read',orderId,token})).rejects.toMatchObject({code:'READ_RETRY_NOT_ALLOWED'});expect(state.updates).toBe(0);
 });
});
