import {randomUUID} from 'node:crypto';
import {acquireProcessLock} from '../scripts/process-lock';
import {mkdir,readdir,unlink} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {createWalletClient,defineChain,encodeFunctionData,http,parseAbi,type Address,type Hex} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {z} from 'zod';
import {decryptBrokerSecrets} from '../src/lib/integrations/ledger';
import {economyClient,economyDeployment} from '../src/lib/economy/chain';
import {fetchRepoEvidence} from '../src/lib/repository-service';
import {executeProviderWork,inferWithProvider} from '../src/lib/economy/provider-work';
import {referenceSeller,validateProviderBinding} from '../src/lib/economy/provider-queue';
import {canonicalJsonHash,serviceRequestSchema,validateServiceDefinition,validateServiceRequest,verifyServiceSettlement,type ServiceRequest,type ServiceDefinition} from '../src/lib/economy/service-contract';
import {durableSignedTransaction,loadPrivateJson,savePrivateJson} from '../scripts/economy-eoa';

type Work={order_id:string;claim_token:string;paid_at:string;lease_started_at:string;request:ServiceRequest;definition:ServiceDefinition};
type Record={job:Work;stage:'claimed'|'executing'|'output'|'completed'|'failed';output?:{[key:string]:unknown};attestationHash?:Hex;readRetries?:{requestedAt:string}[]};
export async function main(){
 const origin=new URL(process.env.ECONOMY_PLATFORM_URL||'https://obolos.app');
 if(origin.origin!==origin.href.replace(/\/$/,'')||origin.protocol!=='https:')throw Error('Pin the HTTPS platform origin');
 const token=process.env.ECONOMY_PROVIDER_TOKEN;if(!token||token.length<32)throw Error('Configure the provider queue credential');
 const model=process.env.INFERENCE_MODEL||'',baseUrl=process.env.INFERENCE_BASE_URL||'';
 if(!/^gpt-5-nano(?:-[\d-]+)?$/.test(model)||baseUrl.replace(/\/$/,'')!=='https://api.openai.com/v1')throw Error('Configure pinned real inference');
 const identities=await loadPrivateJson<{sellerKey:Hex}>(resolve(process.env.ECONOMY_SELLER_KEY_FILE||'data/market-release-v2/state.json'));if(!identities)throw Error('Provision seller identity');
 const account=privateKeyToAccount(z.string().regex(/^0x[\da-fA-F]{64}$/).parse(identities.sellerKey) as Hex);if(account.address.toLowerCase()!==referenceSeller)throw Error('Seller address mismatch');
 const secrets=await decryptBrokerSecrets(process.env),d=economyDeployment()!,client=economyClient();if(await client.getChainId()!==d.chainId)throw Error('Wrong chain');
 const rpc='https://rpc.testnet.arc.network',chain=defineChain({id:d.chainId,name:'Arc testnet',nativeCurrency:{name:'USDC',symbol:'USDC',decimals:18},rpcUrls:{default:{http:[rpc]}}}),wallet=createWalletClient({account,chain,transport:http(rpc)});
 const directory=resolve(process.env.ECONOMY_PROVIDER_DIR||'data/economy-provider');await mkdir(directory,{recursive:true,mode:0o700});const release=await acquireProcessLock(join(directory,'worker.lock'));
 const controller=new AbortController(),stop=()=>controller.abort();process.once('SIGTERM',stop);process.once('SIGINT',stop);
 async function api(body:unknown){const response=await fetch(origin.origin+'/api/economy/provider/jobs',{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});if(!response.ok){const body=await response.json().catch(()=>({}));throw Object.assign(Error('Provider queue unavailable'),{code:body.code});}return response.json();}
 async function processRecord(record:Record,filename:string){
  const {job}=record,service=validateServiceDefinition(job.definition),request=serviceRequestSchema.parse(job.request);validateProviderBinding(service,service.category,origin.origin);validateServiceRequest(service,request);
  if(job.order_id!==request.orderId)throw Error('Queue order mismatch');
  const receipt=await client.getTransactionReceipt({hash:request.settlement.transactionHash}),finalized=await client.getBlock({blockTag:'finalized'});if(receipt.blockNumber>finalized.number)throw Error('Payment not finalized');
  verifyServiceSettlement(service,request,{chainId:d.chainId,status:receipt.status,transactionHash:receipt.transactionHash,logs:receipt.logs});
  const paidBlock=await client.getBlock({blockNumber:receipt.blockNumber});if(paidBlock.hash!==receipt.blockHash||paidBlock.timestamp!==BigInt(job.paid_at))throw Error('Payment timestamp mismatch');
  if(record.stage==='executing'){
   // A model call may have been charged before a crash. Do not repeat it.
   await api({action:'failed',orderId:job.order_id,token:job.claim_token});record.stage='failed';await savePrivateJson(filename,record);return;
  }
  if(record.stage==='claimed'){
   record.stage='executing';await savePrivateJson(filename,record);
   try{record.output=await executeProviderWork(service.category,request.input,{orderId:request.orderId,paidAt:Number(job.paid_at),leaseStartedAt:Number(job.lease_started_at),fetchEvidence:repos=>fetchRepoEvidence(repos,process.env.GITHUB_TOKEN),infer:prompt=>inferWithProvider(prompt,{apiKey:secrets.inferenceApiKey,model,baseUrl})});}
   catch{await api({action:'failed',orderId:job.order_id,token:job.claim_token});record.stage='failed';await savePrivateJson(filename,record);return;}
   record.stage='output';await savePrivateJson(filename,record);
  }
  if(record.stage==='output'){
   if(service.category==='storage'&&!record.attestationHash&&Date.parse(String(record.output?.expiresAt))<=Date.now()){await api({action:'failed',orderId:job.order_id,token:job.claim_token});record.stage='failed';await savePrivateJson(filename,record);return;}
   const outputHash=canonicalJsonHash(record.output),data=encodeFunctionData({abi:parseAbi(['function attestDelivery(bytes32,bytes32)']),functionName:'attestDelivery',args:[request.orderId,outputHash]});
   const attestation=await durableSignedTransaction(join(directory,'transactions'),`delivery-${request.orderId.slice(2)}`,{from:account.address,to:d.ledger,data},{sign:async()=>wallet.signTransaction(await wallet.prepareTransactionRequest({account,to:d.ledger as Address,data})),receipt:async hash=>client.waitForTransactionReceipt({hash,timeout:5000}).catch(()=>null),broadcast:raw=>client.sendRawTransaction({serializedTransaction:raw})});
   record.attestationHash=attestation.transactionHash;await savePrivateJson(filename,record);
   try{await api({action:'complete',orderId:job.order_id,token:job.claim_token,output:record.output,attestationHash:record.attestationHash});record.stage='completed';}
   catch(error){if((error as {code?:string}).code!=='STORAGE_EXPIRED')throw error;await api({action:'failed',orderId:job.order_id,token:job.claim_token});record.stage='failed';}
   await savePrivateJson(filename,record);
  }
 }
 let lastIndexAttempt=0;
 async function refreshIndex(){if(!process.env.CRON_SECRET||Date.now()-lastIndexAttempt<60000)return;lastIndexAttempt=Date.now();try{const response=await fetch(origin.origin+'/api/cron/economy-index',{headers:{Authorization:`Bearer ${process.env.CRON_SECRET}`},signal:AbortSignal.timeout(30000),redirect:'error'});if(!response.ok)console.error('Economy index refresh pending.');}catch{console.error('Economy index refresh pending.');}}
 try{
  const retryIndex=process.argv.indexOf('--retry-read');
  if(retryIndex>=0){const id=z.string().regex(/^0x[\da-f]{64}$/).parse(process.argv[retryIndex+1]);const filename=join(directory,id+'.json'),record=await loadPrivateJson<Record>(filename);if(!record||record.stage!=='failed'||!['data','compute','verification'].includes(record.job.definition.category)||record.output||record.attestationHash)throw Error('Read-only retry requires a failed immutable job without output or attestation');await api({action:'retry-read',orderId:id,token:record.job.claim_token});record.readRetries=[...(record.readRetries??[]),{requestedAt:new Date().toISOString()}];record.stage='claimed';await savePrivateJson(filename,record);}
  console.info('Private economy provider started. Real work and seller delivery signatures enabled.');
  while(!controller.signal.aborted){
   await refreshIndex();
   try{
    for(const name of (await readdir(directory)).filter(n=>/^0x[\da-f]{64}\.json$/.test(n))){const filename=join(directory,name),record=await loadPrivateJson<Record>(filename);if(record&& !['completed','failed'].includes(record.stage))await processRecord(record,filename);}
    const claimFile=join(directory,'claim.json');let claim=await loadPrivateJson<{claimId:string}>(claimFile);if(!claim){claim={claimId:randomUUID()};await savePrivateJson(claimFile,claim);}
    const result=await api({action:'claim',model,claimId:claim.claimId});if(result.job){const job=result.job as Work;z.string().regex(/^0x[\da-f]{64}$/).parse(job.order_id);const filename=join(directory,job.order_id+'.json');let record=await loadPrivateJson<Record>(filename);if(!record){record={job,stage:'claimed'};await savePrivateJson(filename,record);}await unlink(claimFile);if(!['completed','failed'].includes(record.stage))await processRecord(record,filename);}else await unlink(claimFile);
   }catch{console.error('Provider work pending; private journals preserved. No replacement payment or model call was issued.');}
   if(process.argv.includes('--once'))break;await delay(3000,undefined,{signal:controller.signal}).catch(()=>{});
  }
 }finally{process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);await release();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(()=>{console.error('Private provider startup failed. Check local credentials, journal lock and configuration.');process.exitCode=1;});
