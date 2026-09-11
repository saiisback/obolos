/** Bounded live release: preserves original identities, order inputs and signed transaction bytes. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createWalletClient,defineChain,encodeFunctionData,decodeEventLog,parseAbi,http,keccak256,toHex,type Abi,type Hex,type Address} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {economyClient,economyDeployment} from '../src/lib/economy/chain';
import {resourceCategories} from '../src/lib/economy/model';
import {createServiceDefinition} from '../src/lib/economy/service-contract';
import {providerSchemas,providerUnits} from '../src/lib/economy/provider-work';
import {durableSignedTransaction,loadPrivateJson,savePrivateJson} from './economy-eoa';
import {configuration} from './economy-circle';
import {executorInputSchema,runEconomyExecutor} from '../src/lib/economy/executor';
import {liveExecutorDependencies} from '../src/lib/economy/executor-live';
const directory=resolve('data/economy-live-release'),origin='https://obolos.app';
async function main(){
 const [mode,categoryArg]=process.argv.slice(2);assert(['prepare','execute','verify','refund-compute'].includes(mode),'Use prepare, execute <category>, or verify');
 const identities=JSON.parse(await readFile('data/market-release-v2/state.json','utf8')),existing=JSON.parse(await readFile('data/economy-release/state.json','utf8'));
 const buyer=privateKeyToAccount(identities.buyerKey),seller=privateKeyToAccount(identities.sellerKey),config=configuration(),client=economyClient(),d=economyDeployment()!;
 assert.equal(buyer.address.toLowerCase(),'0x1f21897512e5ad2d9aa087a0c8e818a3e2dd22fd');assert.equal(seller.address.toLowerCase(),'0xd2137e6d65165400641aff0e34781d09a0215858');assert.equal(await client.getChainId(),5042002);
 const chain=defineChain({id:5042002,name:'Arc testnet',nativeCurrency:{name:'USDC',symbol:'USDC',decimals:18},rpcUrls:{default:{http:[config.rpc]}}});
 const artifact=async(name:string)=>(JSON.parse(await readFile(`contracts/artifacts/${name}.json`,'utf8')) as {abi:Abi}).abi;
 async function transact(name:string,account:typeof buyer,to:Address,data:Hex){const wallet=createWalletClient({account,chain,transport:http(config.rpc)});return durableSignedTransaction(join(directory,'transactions'),name,{from:account.address,to,data},{sign:async()=>wallet.signTransaction(await wallet.prepareTransactionRequest({account,to,data})),receipt:hash=>client.waitForTransactionReceipt({hash,timeout:5000}).catch(()=>null),broadcast:raw=>client.sendRawTransaction({serializedTransaction:raw})});}
 function api(account:typeof buyer){const cookies=new Map<string,string>();return {async request(path:string,body?:unknown){const r=await fetch(origin+path,{method:body?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',Cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; ')},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(60000)});for(const value of r.headers.getSetCookie()){const [pair]=value.split(';'),i=pair.indexOf('=');cookies.set(pair.slice(0,i),pair.slice(i+1));}const value=await r.json();if(!r.ok)throw Error(`API ${path}: ${r.status} ${value.code??''}`);return value;},async login(){const c=await this.request('/api/auth/challenge',{address:account.address});await this.request('/api/auth/verify',{signature:await account.signMessage({message:c.message})});}};}
 const text='Obolos real provider release: preserve the original paid order.';
 const inputs={data:{repo:'saiisback/obolos'},compute:{text},inference:{prompt:'In one sentence, explain why a paid API response is different from independent evidence of its economic value.'},verification:{text,sha256:createHash('sha256').update(text).digest('hex')},storage:{text}};
 if(mode==='prepare'){
  const health=await fetch(origin+'/api/economy/provider/status').then(r=>r.json());assert.equal(health.status,'online','Start the real provider before publishing');const session=api(seller);await session.login();
  for(const category of resourceCategories){const definition=createServiceDefinition({chainId:5042002,settlementAddress:d.settlement,ledgerAddress:d.ledger,seller:seller.address,endpoint:origin+'/api/economy/reference/'+category,category,unit:providerUnits[category],quantity:'1',unitPriceAtomic:'1000',inputSchema:providerSchemas[category].input,outputSchema:providerSchemas[category].output});
   const registered=await transact('register-'+category,seller,d.settlement,encodeFunctionData({abi:await artifact('ObolosMarketSettlement'),functionName:'registerService',args:[resourceCategories.indexOf(category),keccak256(toHex(definition.unit)),1n,1000n,keccak256(toHex(definition.endpoint))]}));
   await session.request('/api/economy/services',definition);
   const permission=await transact('counterparty-'+category,buyer,d.policy,encodeFunctionData({abi:await artifact('ObolosPolicyEnvelope'),functionName:'setCounterparty',args:[existing.agentId,resourceCategories.indexOf(category),seller.address,true]}));
   const filename=join(directory,category+'.json');if(!await loadPrivateJson(filename))await savePrivateJson(filename,{version:1,origin,platformAgentId:existing.platformAgentId,orderId:keccak256(toHex('obolos-live-provider-2026-09-11-'+category+'-1')),owner:buyer.address.toLowerCase(),payer:config.wallet.toLowerCase(),definition,serviceHash:definition.serviceHash,input:inputs[category],maxAmountAtomic:'1000',expiry:String(Math.floor(Date.now()/1000)+86400)});
   const actionFile=join(directory,'policy-'+category+'.json');if(!await loadPrivateJson(actionFile))await savePrivateJson(actionFile,{name:'live-provider-category-'+category+'-20260911',observation:keccak256(toHex('obolos-live-provider-readiness-2026-09-11')),action:{kind:'category',category:resourceCategories.indexOf(category),enabled:true,perOrderCap:'2000',windowCap:'100000',windowSeconds:'86400',delaySeconds:'0'}});
   console.log(JSON.stringify({category,serviceHash:definition.serviceHash,registrationHash:registered.transactionHash,permissionHash:permission.transactionHash}));
  }
 }else if(mode==='execute'){
  assert(resourceCategories.includes(categoryArg as typeof resourceCategories[number]),'Choose a defined category');const input=executorInputSchema.parse(await loadPrivateJson(join(directory,categoryArg+'.json')));
  const result=await runEconomyExecutor(input,join(config.journal,'executor'),liveExecutorDependencies(config,input,existing.agentKey,{deliveryAttempts:12,pollMs:10000}));
  console.log(JSON.stringify({category:categoryArg,orderId:input.orderId,phase:result.phase,paymentHash:result.paymentHash,outputHash:result.outputHash,acknowledgmentHash:result.acknowledgmentHash}));
 }else if(mode==='refund-compute'){
  const input=executorInputSchema.parse(await loadPrivateJson(join(directory,'compute.json'))),buyerSession=api(buyer),sellerSession=api(seller);await buyerSession.login();await sellerSession.login();const order=(await buyerSession.request('/api/economy/orders/'+input.orderId)).order;assert.equal(order.state,'fulfilled','Verify actual delivery before release refund');
  const token='0x3600000000000000000000000000000000000000',abi=parseAbi(['function transfer(address,uint256) returns(bool)','event Transfer(address indexed from,address indexed to,uint256 value)']);const receipt=await transact('refund-compute',seller,token,encodeFunctionData({abi,functionName:'transfer',args:[input.payer,1000n]}));
  const log=receipt.logs.find(log=>{try{const event=decodeEventLog({abi,data:log.data,topics:log.topics});return log.address.toLowerCase()===token&&event.eventName==='Transfer'&&event.args.from.toLowerCase()===seller.address.toLowerCase()&&event.args.to.toLowerCase()===input.payer&&event.args.value===1000n;}catch{return false;}});assert(log&&log.logIndex!==null,'Exact refund transfer required');
  await sellerSession.request('/api/economy/orders/'+input.orderId+'/recovery',{action:'refund',transactionHash:receipt.transactionHash,logIndex:log.logIndex,amountAtomic:'1000'});const recovery=await buyerSession.request('/api/economy/orders/'+input.orderId+'/recovery');await savePrivateJson(join(directory,'refund-verified.json'),recovery);console.log(JSON.stringify({orderId:input.orderId,refundHash:receipt.transactionHash,amountAtomic:'1000',recorded:true}));
 }else{
  const session=api(buyer);await session.login();const results=[];
  for(const category of resourceCategories){const input=executorInputSchema.parse(await loadPrivateJson(join(directory,category+'.json')));const order=(await session.request('/api/economy/orders/'+input.orderId)).order;assert.equal(order.state,'fulfilled');if(category==='storage'){const stored=await session.request('/api/economy/storage/'+input.orderId);assert.equal(stored.text,text);}
   results.push({category,orderId:input.orderId,transactionHash:order.transactionHash,outputHash:order.outputHash,output:order.output});}
  await savePrivateJson(join(directory,'verified.json'),results);console.log(JSON.stringify(results));
 }
}
main().catch(error=>{console.error(error instanceof Error?error.message.split('\n')[0]:'Live release stopped. Preserve every journal and retry the original action.');process.exitCode=1;});
