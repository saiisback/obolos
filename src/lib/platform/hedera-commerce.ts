import {createHash} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {sql} from './db';
import {readJson} from './http';
import {fetchRepoEvidence} from '../repository-service';
import {validateSchedulePlan,validateScheduledProof} from '../hedera/commerce';

const htsSchema=z.object({asset:z.string().regex(/^0\.0\.[1-9]\d*$/),payTo:z.string().regex(/^0\.0\.[1-9]\d*$/),unitPriceAtomic:z.number().int().positive().max(100000000),decimals:z.number().int().min(0).max(8),symbol:z.string().min(1).max(12),network:z.literal('hedera:testnet')}).strict();
export async function hederaPublicConfig(id:'hts'|'identity-service'|'identity-buyer'|'release'):Promise<unknown|null>{
 const rows=await sql()`SELECT value FROM platform_hedera_config WHERE id=${id}`;
 return rows[0]?.value??null;
}
export async function hederaTokenConfig(){const value=await hederaPublicConfig('hts');return value?htsSchema.parse(value):null;}
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});

/** The public service verifies a native scheduled transfer. It never signs or schedules funds. */
export async function scheduledRepositoryRequest(req:NextRequest){
 try{
  const input=z.object({plan:z.unknown(),round:z.number().int().nonnegative(),scheduleId:z.string().regex(/^0\.0\.[1-9]\d*$/)}).strict().parse(await readJson(req));
  const plan=validateSchedulePlan(input.plan,0,true);
  if(plan.payTo!==process.env.HEDERA_PAY_TO)return json({error:'Schedule recipient is not this service.'},400);
  if(input.round>=plan.count)return json({error:'Invalid schedule round.'},400);
  const fingerprint=createHash('sha256').update(JSON.stringify([plan,input.round])).digest('hex');
  const existing=await sql()`SELECT fingerprint,state,evidence,proof FROM platform_scheduled_deliveries WHERE schedule_id=${input.scheduleId}`;
  if(existing[0]){
   if(existing[0].fingerprint!==fingerprint)return json({error:'Schedule already belongs to a different resource request.'},409);
   return existing[0].state==='delivered'?json({evidence:existing[0].evidence,proof:existing[0].proof,replayed:true}):json({error:'Delivery is pending; reconcile the original request.'},409);
  }
  const prices=await sql()`SELECT unit_price_atomic FROM platform_service_prices WHERE provider_id='repo-standard'`;
  if(prices[0]?.unit_price_atomic!==plan.unitPriceAtomic)return json({error:'Resource price changed. No payment is initiated by this endpoint.'},409);
  const base='https://testnet.mirrornode.hedera.com/api/v1';
  const sr=await fetch(`${base}/schedules/${input.scheduleId}`,{redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!sr.ok)return json({error:'Schedule is not indexed yet.'},409);
  const schedule=await sr.json() as {executed_timestamp?:string};
  if(!schedule.executed_timestamp||!/^\d+\.\d+$/.test(schedule.executed_timestamp))return json({error:'Scheduled payment has not executed yet.'},402);
  const tr=await fetch(`${base}/transactions?timestamp=${encodeURIComponent(schedule.executed_timestamp)}`,{redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!tr.ok)return json({error:'Scheduled transfer proof is not indexed yet.'},409);
  const transfer=await tr.json();validateScheduledProof(schedule,transfer,plan,input.round,input.scheduleId);
  // Resolve source before reserving delivery, so a source outage remains retryable with the same paid proof.
  const evidence=await fetchRepoEvidence(plan.repos,process.env.GITHUB_TOKEN);
  const proof={scheduleId:input.scheduleId,consensusTimestamp:schedule.executed_timestamp,payer:plan.payer,payTo:plan.payTo,amountAtomic:plan.unitPriceAtomic*plan.repos.length,network:'hedera:testnet',asset:'HBAR',round:input.round};
  const inserted=await sql()`INSERT INTO platform_scheduled_deliveries(schedule_id,fingerprint,state,evidence,proof) VALUES(${input.scheduleId},${fingerprint},'delivered',${JSON.stringify(evidence)}::jsonb,${JSON.stringify(proof)}::jsonb) ON CONFLICT(schedule_id) DO NOTHING RETURNING schedule_id`;
  if(!inserted[0])return json({error:'Concurrent delivery recorded. Retrieve the same request again.'},409);
  return json({evidence,proof});
 }catch(error){return json({error:error instanceof z.ZodError?'Invalid scheduled resource request.':'Scheduled proof or resource unavailable. No payment was initiated.'},error instanceof z.ZodError?400:503);}
}
