import {createHash} from 'node:crypto';
import {NextRequest} from 'next/server';
import {z} from 'zod';
import {economyClient,economyDeployment} from '@/lib/economy/chain';
import {canonicalJsonHash,serviceRequestSchema,validateServiceDefinition,validateServiceRequest,validateSchemaValue,verifyServiceSettlement} from '@/lib/economy/service-contract';
import {sql} from '@/lib/platform/db';
import {rateLimit} from '@/lib/platform/auth';
import {appOrigin,PlatformError,platformError,platformJson,readJson} from '@/lib/platform/http';

/** Reference compute provider: performs actual deterministic text analysis after payment.
 * Its deterministic response makes order retries safe without rerunning a payment. */
export async function POST(req:NextRequest){try{
 await rateLimit('economy-reference-compute',120,60);
 const request=serviceRequestSchema.parse(await readJson(req,96*1024));
 const deployment=economyDeployment();if(!deployment)throw new PlatformError(503,'ECONOMY_UNAVAILABLE','The economy contracts are not configured.');
 const rows=await sql()`SELECT definition FROM economy_services WHERE service_hash=${request.serviceHash}`;
 if(!rows[0])throw new PlatformError(404,'SERVICE_NOT_FOUND','Publish the registered service definition first.');
 const service=validateServiceDefinition(rows[0].definition);
 if(service.seller!=='0xd2137e6d65165400641aff0e34781d09a0215858'||service.category!=='compute'||service.quantity!=='1'||service.endpoint!==`${appOrigin()}/api/economy/reference-compute`||service.settlementAddress!==deployment.settlement.toLowerCase()||service.ledgerAddress!==deployment.ledger.toLowerCase())throw new PlatformError(400,'WRONG_SERVICE','This endpoint serves the registered text-analysis compute contract.');
 validateServiceRequest(service,request);
 const input=z.object({text:z.string().max(32768)}).strict().parse(request.input);
 const client=economyClient();
 const [chainId,receipt,finalized]=await Promise.all([client.getChainId(),client.getTransactionReceipt({hash:request.settlement.transactionHash}),client.getBlock({blockTag:'finalized'})]);
 if(finalized.number===null||receipt.blockNumber>finalized.number)throw new PlatformError(409,'PAYMENT_PENDING','Wait for settlement finality, then retry this order.');
 verifyServiceSettlement(service,request,{chainId,status:receipt.status,transactionHash:receipt.transactionHash,logs:receipt.logs});
 const output={characters:[...input.text].length,words:input.text.trim()?input.text.trim().split(/\s+/u).length:0,bytes:Buffer.byteLength(input.text),sha256:createHash('sha256').update(input.text).digest('hex')};
 validateSchemaValue(output,service.outputSchema);
 return platformJson({protocol:'obolos.service.v1',orderId:request.orderId,serviceHash:request.serviceHash,inputHash:request.inputHash,outputHash:canonicalJsonHash(output),output});
 }catch(error){return platformError(error);}}
