import {NextRequest} from 'next/server';
import {z} from 'zod';
import {sql} from '@/lib/platform/db';
import {requireUser,rateLimit} from '@/lib/platform/auth';
import {PlatformError,platformError,platformJson} from '@/lib/platform/http';
import {economyClient,economyDeployment,ledgerAbi} from '@/lib/economy/chain';
import {decodeEventLog,type Hex} from 'viem';
import {receiptCost,providerUsage} from '@/lib/economy/accounting-draft';
import {canonicalJsonHash} from '@/lib/economy/service-contract';
export const runtime='nodejs';
export const maxDuration=60;
export async function GET(_req:NextRequest,context:{params:Promise<{id:string}>}){try{
 const user=await requireUser(_req),id=z.string().regex(/^0x[0-9a-f]{64}$/).parse((await context.params).id),d=economyDeployment();
 if(!d)throw new PlatformError(503,'NOT_DEPLOYED','Economy is not deployed.');
 await rateLimit('cost-draft:'+user.id,20,60);
 const [order]=await sql()`SELECT order_id,transaction_hash,output_hash,output,definition FROM economy_orders WHERE order_id=${id} AND definition->>'seller'=${user.address.toLowerCase()} AND request->'settlement'->>'address'=${d.settlement} AND request->'settlement'->>'ledgerAddress'=${d.ledger}`;
 if(!order?.output_hash)throw new PlatformError(404,'SALE_NOT_FOUND','Delivered sale not found for this seller.');
 const [delivery]=await sql()`SELECT transaction_hash FROM economy_chain_events WHERE chain_id=${d.chainId} AND contract_address=${d.ledger} AND event_name='DeliveryAttested' AND payload->>'orderId'=${id} ORDER BY block_number,log_index LIMIT 1`;
 if(!delivery)throw new PlatformError(409,'INDEX_REQUIRED','Refresh economy data to index seller delivery first.');
 const client=economyClient(),[chainId,receipt,finalized]=await Promise.all([client.getChainId(),client.getTransactionReceipt({hash:delivery.transaction_hash as Hex}),client.getBlock({blockTag:'finalized'})]);
 if(chainId!==d.chainId||finalized.number===null)throw new PlatformError(503,'CHAIN_UNAVAILABLE','Finalized Arc evidence is unavailable.');
 const block=await client.getBlock({blockNumber:receipt.blockNumber});
 const matched=receipt.logs.some(log=>{try{const e=decodeEventLog({abi:ledgerAbi,data:log.data,topics:log.topics});return log.address.toLowerCase()===d.ledger&&e.eventName==='DeliveryAttested'&&e.args.orderId===id&&e.args.seller.toLowerCase()===user.address.toLowerCase()&&e.args.outputHash===order.output_hash;}catch{return false;}});
 if(!matched||receipt.blockHash!==block.hash)throw new PlatformError(422,'DELIVERY_MISMATCH','Finalized delivery differs from this output.');
 const evidence={protocol:'obolos.cost-observation.v1',chainId:d.chainId,settlement:d.settlement,ledger:d.ledger,orderId:id,transactionHash:order.transaction_hash,outputHash:order.output_hash,seller:user.address.toLowerCase(),sellerDeliveryGas:receiptCost(receipt,{seller:user.address,ledger:d.ledger,transactionHash:delivery.transaction_hash,finalizedBlock:finalized.number}),inferenceUsage:providerUsage(order.definition.category,order.output),complete:false,missing:['Producer confirmation and allocation of consumed marketplace inputs','External input invoices and currency conversion','Hosting, energy, storage and other resource allocation',...(order.definition.category==='inference'?['Inference billing evidence; retained token counts alone do not establish the billed amount']:[])]};
 return platformJson({evidence,evidenceHash:canonicalJsonHash(evidence)});
 }catch(error){return platformError(error);}}
