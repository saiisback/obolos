/** One bounded paid release exercise. Never generates a replacement order or transaction. */
import assert from 'node:assert/strict';
import {mkdir,open,readFile,rename} from 'node:fs/promises';
import {resolve} from 'node:path';
import {BaseError,ContractFunctionRevertedError,createWalletClient,defineChain,encodeFunctionData,http,keccak256,parseAbi,toHex,type Abi,type Address,type Hex} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {economyClient,economyDeployment,serializable} from '../src/lib/economy/chain';
import {canonicalJsonHash,createServiceDefinition,verifyServiceSettlement,type ServiceRequest} from '../src/lib/economy/service-contract';
import {approveCircleUsdc,configuration,executeCircle,settleCircleOrder,type Operation,type SettlementOrder} from './economy-circle';
const directory=resolve('data/economy-release'),origin='https://obolos.app';
async function save(name:string,value:unknown){await mkdir(directory,{recursive:true,mode:0o700});const path=resolve(directory,name),temp=path+'.tmp';const file=await open(temp,'w',0o600);try{await file.writeFile(JSON.stringify(serializable(value),null,2));await file.sync();}finally{await file.close();}await rename(temp,path);const folder=await open(directory,'r');try{await folder.sync();}finally{await folder.close();}}
async function load(name:string){try{return JSON.parse(await readFile(resolve(directory,name),'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e;}}
async function main(){
 const mode=process.argv[2];assert(['prepare','purchase','acknowledge','price-shock'].includes(mode),'Use prepare, purchase, acknowledge, or price-shock');
 const fixture=JSON.parse(await readFile(resolve(process.env.ECONOMY_TEST_IDENTITIES||'data/market-release-v2/state.json'),'utf8'));
 const buyer=privateKeyToAccount(fixture.buyerKey),seller=privateKeyToAccount(fixture.sellerKey);
 assert.equal(buyer.address.toLowerCase(),'0x1f21897512e5ad2d9aa087a0c8e818a3e2dd22fd');assert.equal(seller.address.toLowerCase(),'0xd2137e6d65165400641aff0e34781d09a0215858');
 const deployment=economyDeployment();assert(deployment);const config=configuration(),client=economyClient();assert.equal(await client.getChainId(),5042002);
 const chain=defineChain({id:5042002,name:'Arc testnet',nativeCurrency:{name:'USDC',symbol:'USDC',decimals:18},rpcUrls:{default:{http:[config.rpc]}}});
 const abi=async(name:string)=>(JSON.parse(await readFile(`contracts/artifacts/${name}.json`,'utf8')) as {abi:Abi}).abi;
 const policy=await abi('ObolosPolicyEnvelope'),market=await abi('ObolosMarketSettlement'),ledger=await abi('ObolosEconomicLedger');
 async function eoa(name:string,account:typeof buyer,to:Address,data:Hex){
  const filename=`${name}.json`;let record=await load(filename);const intent={from:account.address,to,data};
  if(record)assert.deepEqual(record.intent,intent,'Existing transaction has different intent');
  else{const wallet=createWalletClient({account,chain,transport:http(config.rpc)});const tx=await wallet.prepareTransactionRequest({account,to,data});const raw=await wallet.signTransaction(tx);record={intent,raw,hash:keccak256(raw)};await save(filename,record);}
  let receipt=await client.getTransactionReceipt({hash:record.hash}).catch(()=>null);
  if(!receipt){await client.sendRawTransaction({serializedTransaction:record.raw}).catch(()=>undefined);receipt=await client.waitForTransactionReceipt({hash:record.hash,timeout:60000});}
  assert.equal(receipt.status,'success',`${name} reverted`);console.log(name,receipt.transactionHash);return receipt;
 }
 async function circleReceipt(op:Operation){assert.equal(op.result?.sourceAddress?.toString().toLowerCase(),config.wallet.toLowerCase());assert.equal(op.result?.blockchain,'ARC-TESTNET');assert(typeof op.result.txHash==='string');const receipt=await client.waitForTransactionReceipt({hash:op.result.txHash as Hex,timeout:60000});assert.equal(receipt.status,'success');return receipt;}
 function api(account:typeof buyer){const cookies=new Map<string,string>();return {async request(path:string,body?:unknown){const response=await fetch(origin+path,{method:body?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',Cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; ')},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(60000)});for(const raw of response.headers.getSetCookie()){const part=raw.split(';')[0],i=part.indexOf('=');cookies.set(part.slice(0,i),part.slice(i+1));}const result=await response.json();if(!response.ok)throw Error(`${path}: ${response.status} ${result.code??''}`);return result;},async login(){const challenge=await this.request('/api/auth/challenge',{address:account.address});await this.request('/api/auth/verify',{signature:await account.signMessage({message:challenge.message})});}};}
 const buyerApi=api(buyer),sellerApi=api(seller);let state=await load('state.json');
 if(mode==='prepare'){
  await buyerApi.login();await sellerApi.login();
  if(!state){const result=await buyerApi.request('/api/agents',{name:'Economy compute buyer',description:'Bounded Arc contract settlement release check.',dataBudgetAtomic:0,verificationBudgetAtomic:50000});state={platformAgentId:result.agent.id,agentId:keccak256(toHex(result.agent.id)),orderId:keccak256(toHex('obolos-phase2-compute-2026-09-11-1'))};await save('state.json',state);}
  await circleReceipt(await executeCircle(config,'fund-economy-test-owner','0x3600000000000000000000000000000000000000','transfer(address,uint256)',[buyer.address,'100000']));
  await eoa('register-agent',buyer,deployment.policy,encodeFunctionData({abi:policy,functionName:'registerAgent',args:[state.agentId,config.wallet,50000n,50000n,86400n]}));
  await eoa('approve-seller',buyer,deployment.policy,encodeFunctionData({abi:policy,functionName:'setCounterparty',args:[state.agentId,1,seller.address,true]}));
  const definition=createServiceDefinition({chainId:5042002,settlementAddress:deployment.settlement,ledgerAddress:deployment.ledger,seller:seller.address,endpoint:origin+'/api/economy/reference-compute',category:'compute',unit:'compute-unit',quantity:'1',unitPriceAtomic:'1000',inputSchema:{type:'object',properties:{text:{type:'string',maxLength:32768}},required:['text'],additionalProperties:false},outputSchema:{type:'object',properties:{characters:{type:'integer',minimum:0},words:{type:'integer',minimum:0},bytes:{type:'integer',minimum:0},sha256:{type:'string',maxLength:64}},required:['characters','words','bytes','sha256'],additionalProperties:false}});
  await eoa('register-service',seller,deployment.settlement,encodeFunctionData({abi:market,functionName:'registerService',args:[1,keccak256(toHex(definition.unit)),1n,1000n,keccak256(toHex(definition.endpoint))]}));
  state.definition=definition;await save('state.json',state);await sellerApi.request('/api/economy/services',definition);console.log('Registered and published the real compute service.');
 }
 if(mode==='purchase'){
  assert(state?.definition,'Prepare first');await buyerApi.login();
  if(!state.agentKey){const credential=await buyerApi.request(`/api/agents/${state.platformAgentId}/keys`,{name:'Economy release delivery'});state.agentKey=credential.token;await save('state.json',state);}
  if(!state.order){const input={text:'Autonomous agents buy useful work within human-owned spending limits.'};state.input=input;state.order={orderId:state.orderId,agentId:state.agentId,category:1,seller:seller.address,serviceHash:state.definition.serviceHash,unitHash:keccak256(toHex('compute-unit')),quantity:'1',unitPrice:'1000',amount:'1000',inputHash:canonicalJsonHash(input),deadline:String(Math.floor(Date.now()/1000)+3600),policyVersion:String(await client.readContract({address:deployment.policy,abi:policy,functionName:'policyVersion'})),agentVersion:String(await client.readContract({address:deployment.policy,abi:policy,functionName:'agentVersions',args:[state.agentId]})),feeVersion:String(await client.readContract({address:deployment.policy,abi:policy,functionName:'feeVersion'}))};await save('state.json',state);}
  const order={...state.order};for(const key of ['quantity','unitPrice','amount','deadline','policyVersion','agentVersion','feeVersion'])order[key]=BigInt(order[key]);
  // eth_call first: no money moves if policy or exact service terms reject the quote.
  if(!await load('payment.json')){
   const paymentJournalExists=await readFile(resolve(config.journal,'pay-economy-one-order.json'),'utf8').then(()=>true).catch(error=>{if((error as NodeJS.ErrnoException).code==='ENOENT')return false;throw error;});
   // Recover the original durable result before any simulation: an already paid
   // order correctly fails a new eth_call because its replay marker is consumed.
   if(!paymentJournalExists){
    await circleReceipt(await approveCircleUsdc(config,'approve-economy-one-order',deployment.settlement,1000n));
    await client.call({account:config.wallet,to:deployment.settlement,data:encodeFunctionData({abi:market,functionName:'settle',args:[order]})});
   }
   const receipt=await circleReceipt(await settleCircleOrder(config,'pay-economy-one-order',deployment.settlement,order as SettlementOrder));await save('payment.json',{transactionHash:receipt.transactionHash});
  }
  const payment=await load('payment.json');const request:ServiceRequest={protocol:'obolos.service.v1',orderId:state.orderId,agentId:state.agentId,payer:config.wallet.toLowerCase() as Address,serviceHash:state.definition.serviceHash,inputHash:state.order.inputHash,category:'compute',unit:'compute-unit',quantity:'1',unitPriceAtomic:'1000',amountAtomic:'1000',settlement:{chainId:5042002,address:deployment.settlement,ledgerAddress:deployment.ledger,transactionHash:payment.transactionHash},input:state.input};
  const receipt=await client.getTransactionReceipt({hash:payment.transactionHash});verifyServiceSettlement(state.definition,request,{chainId:5042002,status:receipt.status,transactionHash:receipt.transactionHash,logs:receipt.logs});
  state.request=request;await save('state.json',state);
  const response=await fetch(`${origin}/api/v1/agents/${state.platformAgentId}/economy/orders`,{method:'POST',headers:{Authorization:`Bearer ${state.agentKey}`,'Content-Type':'application/json'},body:JSON.stringify({request}),signal:AbortSignal.timeout(60000)});
  const result=await response.json();assert(response.ok&&result.order?.state==='fulfilled','Paid order delivery remains pending; retry the original order');state.delivery=result.order;state.deliveryInterface='scoped-agent-api';await save('state.json',state);console.log(JSON.stringify(result));
 }
 if(mode==='acknowledge'){
  assert(state?.delivery?.outputHash,'Complete delivery first');
  await eoa('attest-delivery',seller,deployment.ledger,encodeFunctionData({abi:ledger,functionName:'attestDelivery',args:[state.orderId,state.delivery.outputHash]}));
  const receipt=await circleReceipt(await executeCircle(config,'ack-economy-delivery',deployment.ledger,'acknowledgeDelivery(bytes32,bytes32)',[state.orderId,state.delivery.outputHash]));await save('acknowledgment.json',{transactionHash:receipt.transactionHash});console.log('Seller delivery and buyer acknowledgment recorded independently.');
 }
 if(mode==='price-shock'){
  assert(state?.definition&&state?.delivery,'Complete the first paid job before publishing a second offer');
  const {protocol:_protocol,serviceHash:_serviceHash,...terms}=state.definition;
  const definition=createServiceDefinition({...terms,unitPriceAtomic:'3000'});
  await eoa('register-higher-quote',seller,deployment.settlement,encodeFunctionData({abi:market,functionName:'registerService',args:[1,keccak256(toHex(definition.unit)),1n,3000n,keccak256(toHex(definition.endpoint))]}));
  await sellerApi.login();await sellerApi.request('/api/economy/services',definition);
  const order={orderId:keccak256(toHex('obolos-phase2-price-shock-2026-09-11')),agentId:state.agentId,category:1,seller:seller.address,serviceHash:definition.serviceHash,unitHash:keccak256(toHex(definition.unit)),quantity:1n,unitPrice:3000n,amount:3000n,inputHash:state.request.inputHash,deadline:BigInt(Math.floor(Date.now()/1000)+3600),policyVersion:await client.readContract({address:deployment.policy,abi:policy,functionName:'policyVersion'}),agentVersion:await client.readContract({address:deployment.policy,abi:policy,functionName:'agentVersions',args:[state.agentId]}),feeVersion:await client.readContract({address:deployment.policy,abi:policy,functionName:'feeVersion'})};
  let blocked=false;try{await client.simulateContract({account:config.wallet,address:deployment.settlement,abi:[...market,...policy],functionName:'settle',args:[order]});}catch(error){const cause=error instanceof BaseError?error.walk(e=>e instanceof ContractFunctionRevertedError):null;blocked=cause instanceof ContractFunctionRevertedError&&cause.data?.errorName==='Limit';}
  assert(blocked,'Expected the actual registered offer to fail the on-chain spending limit');
  const marker=await client.readContract({address:deployment.settlement,abi:market,functionName:'orderHashes',args:[order.orderId]});assert.equal(marker,'0x'+'0'.repeat(64));
  await save('price-shock.json',{definition,order,blocked:true,reason:'Limit',method:'eth_call: no payment submitted',orderHash:marker,alternativeServiceHash:state.definition.serviceHash});console.log(JSON.stringify({quoteAtomic:'3000',capAtomic:'2000',blocked:true,paymentSubmitted:false,alternativeAtomic:'1000'}));
 }
}
main().catch(()=>{console.error('Economy test did not complete. Preserve the private state, signed-transaction files and Circle operation journal for reconciliation. Do not create another payment.');process.exitCode=1;});
