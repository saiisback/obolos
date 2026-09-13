import {z} from 'zod';
import {canonicalJsonHash} from '@/lib/economy/service-contract';
import {NextRequest} from 'next/server';
import {sql} from '@/lib/platform/db';
import {requireUser} from '@/lib/platform/auth';
import {platformError,platformJson} from '@/lib/platform/http';
import {economyDeployment} from '@/lib/economy/chain';
import {evidenceTrust} from '@/lib/economy/evidence';
import {productionAccountTotals,type ProductionAccount} from '@/lib/economy/production-account';
export const runtime='nodejs';
export async function GET(req:NextRequest){try{
 const user=await requireUser(req),d=economyDeployment(),signer=user.address.toLowerCase(),trusted=evidenceTrust()[signer]?.includes('order')??false;
 if(!trusted||!d)return platformJson({trusted:false,signer,candidates:[],message:'An independent evaluator must be explicitly authorized for order valuations. No reviewer is created automatically.'});
 const cursor=z.string().regex(/^0x[0-9a-f]{64}$/).optional().parse(req.nextUrl.searchParams.get('cursor')??undefined)??'';
 const rows=await sql()`SELECT o.order_id,o.output,o.definition,o.request,a.evidence_hash,a.payload FROM economy_production_accounts a JOIN economy_orders o ON o.order_id=a.order_id LEFT JOIN economy_signed_evidence v ON v.kind='order' AND v.scope=o.order_id AND v.settlement_address=${d.settlement} WHERE o.request->'settlement'->>'address'=${d.settlement} AND o.request->'settlement'->>'ledgerAddress'=${d.ledger} AND v.evidence_hash IS NULL AND a.payload->>'allResourcesIncluded'='true' AND a.order_id>${cursor} ORDER BY a.order_id LIMIT 25`;
 const [state]=await sql()`SELECT snapshot FROM economy_index_state WHERE settlement_address=${d.settlement}`;
 const now=Math.floor(Date.now()/1000);
 const candidates=rows.flatMap(row=>{
  const p=row.payload as ProductionAccount,t=productionAccountTotals(p),o=state?.snapshot?.orders?.find((o:{orderId:string})=>o.orderId===row.order_id);
  if(t.intermediateAtomic===null||t.resourceCostAtomic===null||t.resourceCostAtomic<=0n||!o?.delivered||!o.buyerAcknowledged||o.outputHash!==p.outputHash||o.transactionHash!==p.transactionHash||canonicalJsonHash(row.output)!==p.outputHash||[o.seller,o.payer,o.owner].some(a=>a?.toLowerCase()===signer))return [];
  const start=Math.floor(o.timestamp/86400)*86400,end=start+86400;if(end>now||o.deliveredAt>=end||o.acknowledgedAt>=end)return [];
  return [{orderId:row.order_id,category:row.definition.category,output:row.output,productionAccount:p,productionAccountHash:row.evidence_hash,template:{protocol:'obolos.evidence.v1',chainId:5042002,policy:d.policy,ledger:d.ledger,settlement:d.settlement,asset:'USDC',windowStart:start,windowEnd:end,issuedAt:now,signer,kind:'order',orderId:o.orderId,agentId:o.agentId,payer:o.payer.toLowerCase(),seller:o.seller.toLowerCase(),inputHash:o.inputHash,outputHash:o.outputHash,transactionHash:o.transactionHash,productionAccountHash:row.evidence_hash,intermediateInputAtomic:t.intermediateAtomic.toString(),resourceCostAtomic:t.resourceCostAtomic.toString(),costBreakdown:{paymentAtomic:t.intermediateAtomic.toString(),gasAtomic:p.gasAtomic,inferenceAtomic:p.inferenceAtomic,otherAtomic:p.otherResourceAtomic,conversionReference:p.sourceReference,allResourcesIncluded:true}}}];
 });
 return platformJson({trusted,signer,candidates,nextCursor:rows.length===25?rows.at(-1)!.order_id:null});
 }catch(error){return platformError(error);}}
