import {randomUUID} from 'node:crypto';
import {keccak256,toHex,type Address,type Hex} from 'viem';
import {z} from 'zod';
import type {User} from '../platform/auth';
import {sql} from '../platform/db';
import {PlatformError} from '../platform/http';
import {validateRemoteVerifierUrl} from '../market/remote-verifier';
import {economyClient,economyDeployment,marketAbi,policyAbi,serializable,type EconomyDeployment} from './chain';
import {requestRemoteService} from './remote-service';
import {canonicalJsonHash,serviceDefinitionSchema,serviceRequestSchema,validateServiceDefinition,validateServiceRequest,verifyServiceSettlement,type ServiceDefinition,type ServiceReceipt,type ServiceRequest} from './service-contract';

type Row=Record<string,unknown>;
type OnchainService={seller:string;category:number;unitHash:Hex;quantity:bigint;unitPrice:bigint;endpointHash:Hex};
type OnchainAgent={owner:string;executor:string;active:boolean};
type Dependencies={deployment:EconomyDeployment|null;readService:(hash:Hex)=>Promise<OnchainService>;readAgent:(id:Hex)=>Promise<OnchainAgent>;getFinalizedReceipt:(hash:Hex)=>Promise<ServiceReceipt>;verifySettlement:typeof verifyServiceSettlement};
const client=economyClient();
const defaults:Dependencies={deployment:economyDeployment(),async readService(hash){const result=await client.readContract({address:economyDeployment()!.settlement,abi:marketAbi,functionName:'services',args:[hash],blockTag:'finalized'});return {seller:result[0],category:result[1],unitHash:result[2],quantity:result[3],unitPrice:result[4],endpointHash:result[5]};},async readAgent(id){const result=await client.readContract({address:economyDeployment()!.policy,abi:policyAbi,functionName:'agents',args:[id],blockTag:'finalized'});return {owner:result[0],executor:result[1],active:result[2]};},async getFinalizedReceipt(hash){if(await client.getChainId()!==5042002)throw Error('Wrong chain');const [receipt,finalized]=await Promise.all([client.getTransactionReceipt({hash}),client.getBlock({blockTag:'finalized'})]);if(receipt.blockNumber>finalized.number)throw Error('Transaction is not finalized');return {chainId:5042002,status:receipt.status,transactionHash:receipt.transactionHash,logs:receipt.logs.map(log=>({address:log.address,data:log.data,topics:log.topics}))};},verifySettlement:verifyServiceSettlement};
const deps=(overrides?:Partial<Dependencies>):Dependencies=>({...defaults,...overrides});
const fail=(status:number,code:string,message:string)=>new PlatformError(status,code,message);
const same=(a:unknown,b:unknown)=>canonicalJsonHash(a)===canonicalJsonHash(b);

export function publicEconomyService(row:Row):ServiceDefinition{return serviceDefinitionSchema.parse(row.definition);}
export function publicEconomyOrder(row:Row){return {orderId:String(row.order_id),serviceHash:String(row.service_hash),transactionHash:String(row.transaction_hash),state:String(row.state),deliveryAttempts:Number(row.delivery_attempts??0),createdAt:new Date(String(row.created_at)).toISOString(),updatedAt:new Date(String(row.updated_at)).toISOString(),...(row.output?{output:row.output,outputHash:String(row.output_hash)}:{}),...(row.delivery_error?{deliveryError:String(row.delivery_error)}:{})};}
export async function listEconomyServices(){const rows=await sql()`SELECT s.definition FROM economy_services s WHERE NOT EXISTS(SELECT 1 FROM economy_service_retirements r WHERE r.service_hash=s.service_hash) ORDER BY s.created_at DESC LIMIT 100`;return rows.map(publicEconomyService);}

export async function getPublishedEconomyService(serviceHash:string){const id=z.string().regex(/^0x[0-9a-fA-F]{64}$/).parse(serviceHash).toLowerCase();const rows=await sql()`SELECT definition FROM economy_services WHERE service_hash=${id}`;if(!rows[0])throw fail(404,'SERVICE_NOT_FOUND','Published service not found.');return publicEconomyService(rows[0]);}

export async function createEconomyService(user:User,value:unknown,overrides?:Partial<Dependencies>){
 const d=deps(overrides),deployment=d.deployment;if(!deployment)throw fail(503,'ECONOMY_NOT_DEPLOYED','The Arc economy contracts are not deployed.');
 const definition=validateServiceDefinition(value);validateRemoteVerifierUrl(definition.endpoint);
 if(definition.seller!==user.address.toLowerCase())throw fail(403,'SERVICE_SELLER_MISMATCH','The authenticated wallet must be the registered seller.');
 if(definition.chainId!==deployment.chainId||definition.settlementAddress!==deployment.settlement||definition.ledgerAddress!==deployment.ledger)throw fail(409,'DEPLOYMENT_MISMATCH','Service definition does not match the active Arc deployment.');
 const registered=await d.readService(definition.serviceHash);
 if(registered.seller.toLowerCase()!==definition.seller||registered.category!==['data','compute','inference','verification','storage'].indexOf(definition.category)||registered.unitHash.toLowerCase()!==keccak256(toHex(definition.unit))||registered.quantity!==BigInt(definition.quantity)||registered.unitPrice!==BigInt(definition.unitPriceAtomic)||registered.endpointHash.toLowerCase()!==keccak256(toHex(definition.endpoint)))throw fail(409,'SERVICE_NOT_REGISTERED','Finalized on-chain service terms do not match this definition.');
 const db=sql();const inserted=await db`INSERT INTO economy_services(service_hash,user_id,definition) VALUES(${definition.serviceHash},${user.id},${JSON.stringify(definition)}::jsonb) ON CONFLICT(service_hash) DO NOTHING RETURNING *`;
 if(inserted[0])return publicEconomyService(inserted[0]);const existing=await db`SELECT * FROM economy_services WHERE service_hash=${definition.serviceHash}`;
 if(!existing[0]||String(existing[0].user_id)!==user.id||!same(existing[0].definition,definition))throw fail(409,'SERVICE_IMMUTABLE','This service hash is already published with different metadata or schemas.');return publicEconomyService(existing[0]);
}

const createOrderInput=z.object({platformAgentId:z.uuid(),request:serviceRequestSchema}).strict();
export async function createEconomyOrder(user:User,value:unknown,overrides?:Partial<Dependencies>){
 const d=deps(overrides),deployment=d.deployment;if(!deployment)throw fail(503,'ECONOMY_NOT_DEPLOYED','The Arc economy contracts are not deployed.');
 const input=createOrderInput.parse(value),db=sql(),services=await db`SELECT * FROM economy_services WHERE service_hash=${input.request.serviceHash}`;
 if(!services[0])throw fail(404,'SERVICE_NOT_FOUND','Service not found.');const definition=validateServiceDefinition(services[0].definition),request=validateServiceRequest(definition,input.request);
 if(definition.chainId!==deployment.chainId||definition.settlementAddress!==deployment.settlement||definition.ledgerAddress!==deployment.ledger)throw fail(409,'DEPLOYMENT_MISMATCH','Service definition does not match the active Arc deployment.');
 if(keccak256(toHex(input.platformAgentId))!==request.agentId)throw fail(403,'AGENT_ID_MISMATCH','The platform agent does not match the on-chain agent ID.');
 const agents=await db`SELECT id FROM platform_agents WHERE id=${input.platformAgentId} AND user_id=${user.id}`;if(!agents[0])throw fail(404,'AGENT_NOT_FOUND','Agent not found.');
 const agent=await d.readAgent(request.agentId);if(agent.owner.toLowerCase()!==user.address.toLowerCase())throw fail(403,'AGENT_POLICY_MISMATCH','The authenticated owner does not match the on-chain agent owner.');
 let receipt:ServiceReceipt;try{receipt=await d.getFinalizedReceipt(request.settlement.transactionHash);d.verifySettlement(definition,request,receipt);}catch{throw fail(409,'PAYMENT_NOT_FINALIZED','A matching finalized Arc settlement is required.');}
 const requestHash=canonicalJsonHash(request);let row:Row;
 try{const inserted=await db`INSERT INTO economy_orders(order_id,user_id,platform_agent_id,service_hash,request_hash,request,definition,transaction_hash,receipt,state) VALUES(${request.orderId},${user.id},${input.platformAgentId},${definition.serviceHash},${requestHash},${JSON.stringify(request)}::jsonb,${JSON.stringify(definition)}::jsonb,${request.settlement.transactionHash},${JSON.stringify(serializable(receipt))}::jsonb,'paid') ON CONFLICT(order_id) DO NOTHING RETURNING *`;row=inserted[0];}catch(error){if((error as {code?:string}).code==='23505')throw fail(409,'PAYMENT_REUSED','This transaction already belongs to another order.');throw error;}
 if(!row){const existing=await db`SELECT * FROM economy_orders WHERE order_id=${request.orderId} AND user_id=${user.id}`;row=existing[0];if(!row||row.request_hash!==requestHash||row.transaction_hash!==request.settlement.transactionHash)throw fail(409,'ORDER_CONFLICT','This order ID is already bound to a different immutable request.');}
 if(row.state==='fulfilled')return publicEconomyOrder(row);return deliverEconomyOrder(user.id,row);
}

export async function getEconomyOrder(userId:string,orderId:string){const id=z.string().regex(/^0x[0-9a-fA-F]{64}$/).parse(orderId).toLowerCase(),rows=await sql()`SELECT * FROM economy_orders WHERE order_id=${id} AND user_id=${userId}`;if(!rows[0])throw fail(404,'ORDER_NOT_FOUND','Order not found.');return publicEconomyOrder(rows[0]);}
export async function retryEconomyDelivery(userId:string,orderId:string){const rows=await sql()`SELECT * FROM economy_orders WHERE order_id=${orderId.toLowerCase()} AND user_id=${userId}`;if(!rows[0])throw fail(404,'ORDER_NOT_FOUND','Order not found.');if(rows[0].state==='fulfilled')return publicEconomyOrder(rows[0]);if(!['paid','delivering'].includes(String(rows[0].state)))throw fail(409,'DELIVERY_PENDING','Delivery is already in progress.');return deliverEconomyOrder(userId,rows[0]);}
async function deliverEconomyOrder(userId:string,row:Row){
 const db=sql(),orderId=String(row.order_id),token=randomUUID();const claimed=await db`UPDATE economy_orders SET state='delivering',delivery_token=${token},delivery_lease_until=now()+interval '90 seconds',delivery_attempts=delivery_attempts+1,delivery_error=NULL,updated_at=now() WHERE order_id=${orderId} AND user_id=${userId} AND (state='paid' OR (state='delivering' AND delivery_lease_until<now())) RETURNING *`;
 if(!claimed[0])throw fail(409,'DELIVERY_PENDING','Payment is preserved and delivery is already in progress. Do not pay again.');row=claimed[0];
 try{const result=await requestRemoteService({service:validateServiceDefinition(row.definition),request:serviceRequestSchema.parse(row.request),receipt:row.receipt as ServiceReceipt});const completed=await db`UPDATE economy_orders SET state='fulfilled',output=${JSON.stringify(result.output)}::jsonb,output_hash=${result.outputHash},delivery_token=NULL,delivery_lease_until=NULL,updated_at=now() WHERE order_id=${orderId} AND user_id=${userId} AND state='delivering' AND delivery_token=${token} RETURNING *`;if(completed[0])return publicEconomyOrder(completed[0]);}
 catch{const message='Payment is finalized, but provider delivery did not complete. Retry this order; do not pay again.';await db`UPDATE economy_orders SET state='paid',delivery_error=${message},delivery_token=NULL,delivery_lease_until=NULL,updated_at=now() WHERE order_id=${orderId} AND user_id=${userId} AND delivery_token=${token}`;throw fail(502,'DELIVERY_FAILED',message);}
 throw fail(409,'DELIVERY_PENDING','Payment is preserved and another delivery attempt owns this order.');
}
