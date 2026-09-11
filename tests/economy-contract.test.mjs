import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createPublicClient, createWalletClient, http, encodeAbiParameters, keccak256, toHex, zeroHash } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { compile } from '../scripts/contracts/compile.mjs';
const hash = x => keccak256(toHex(x));
const canonical = '0x3600000000000000000000000000000000000000';
const categoryType = {type:'tuple',components:[{name:'enabled',type:'bool'},{name:'perOrderCap',type:'uint256'},{name:'windowCap',type:'uint256'},{name:'windowSeconds',type:'uint64'},{name:'delaySeconds',type:'uint64'}]};

test('real EVM: policy-authorized USDC settlement, roles, accounting, delivery and observations', {timeout:120000}, async t => {
  const artifacts = compile();
  const port = 18545 + Math.floor(Math.random()*1000);
  const process_ = spawn(process.execPath,['node_modules/@foundry-rs/anvil/bin.mjs','--port',String(port),'--silent'],{stdio:'ignore'});
  t.after(()=>process_.kill());
  const client = createPublicClient({pollingInterval:50,transport:http(`http://127.0.0.1:${port}`,{timeout:500,retryCount:0})});
  let ready=false;
  for(let i=0;i<100;i++) { try {await client.getChainId();ready=true;break} catch {if(process_.exitCode!==null)throw Error('Local Anvil exited before startup');await new Promise(r=>setTimeout(r,50))} }
  assert.equal(ready,true,'Local Anvil did not start within five seconds');
  const accounts = await client.request({method:'eth_accounts'});
  const wallets = accounts.map(account => createWalletClient({account,transport:http(`http://127.0.0.1:${port}`)}));
  const [controller,owner,payer,seller,reserve,review,guardian,attacker] = accounts;
  const approver = privateKeyToAccount('0x'+'42'.repeat(32));
  async function deploy(name,args=[]) {const h=await wallets[0].deployContract({abi:artifacts[name].abi,bytecode:`0x${artifacts[name].evm.bytecode.object}`,args,chain:null});return (await client.waitForTransactionReceipt({hash:h})).contractAddress;}
  const policy=await deploy('ObolosPolicyEnvelope',[controller,approver.address,guardian]);
  const ledger=await deploy('ObolosEconomicLedger',[controller,controller]);
  const market=await deploy('ObolosMarketSettlement',[policy,ledger,reserve,review]);
  await client.request({method:'anvil_setCode',params:[canonical,`0x${artifacts.TestUSDC.evm.deployedBytecode.object}`]});
  const contractNames = new Map([[policy,'ObolosPolicyEnvelope'],[ledger,'ObolosEconomicLedger'],[market,'ObolosMarketSettlement'],[canonical,'TestUSDC']]);
  const abi = address => artifacts[contractNames.get(address)].abi;
  const read=(address,functionName,args=[])=>client.readContract({address,abi:abi(address),functionName,args});
  async function write(index,address,functionName,args=[]) {const h=await wallets[index].writeContract({address,abi:abi(address),functionName,args,chain:null});const r=await client.waitForTransactionReceipt({hash:h});assert.equal(r.status,'success');return r;}
  async function rejects(index,address,functionName,args=[]) {await assert.rejects(async()=>{const h=await wallets[index].writeContract({address,abi:abi(address),functionName,args,chain:null});const r=await client.waitForTransactionReceipt({hash:h});if(r.status==='reverted') throw new Error('reverted');});}
  const now=()=>client.getBlock().then(b=>b.timestamp);
  async function approve(action,observation=zeroHash) {const deadline=await now()+1000n;const digest=await read(policy,'approvalDigest',[action,observation,await read(policy,'approvalNonce'),deadline]);return [observation,deadline,await approver.signMessage({message:{raw:digest}})];}
  let c = {enabled:true,perOrderCap:10000n,windowCap:20000n,windowSeconds:3600n,delaySeconds:0n};
  async function category(value=c,index=0) {const action=keccak256(encodeAbiParameters([{type:'string'},{type:'uint8'},categoryType],['CATEGORY',3,value]));const args=[3,value,...await approve(action)];await write(index,policy,'setCategory',args);return args;}
  await write(0,policy,'wireSettlement',[market]);await write(0,ledger,'wireSettlement',[market]);
  await rejects(0,policy,'wireSettlement',[market]);await rejects(7,ledger,'setAttester',[attacker]);
  const initialApproval=await category();await rejects(0,policy,'setCategory',initialApproval);
  const badApproval=[...initialApproval];badApproval[4]='0x'+'00'.repeat(65);await rejects(0,policy,'setCategory',badApproval);
  const agent=hash('buyer-agent');
  const bindingAction=keccak256(encodeAbiParameters([{type:'string'},{type:'address'},{type:'address'}],['EXECUTOR_OWNER',payer,owner]));
  const bindingArgs=[payer,owner,...await approve(bindingAction)];
  await rejects(2,policy,'bindExecutor',bindingArgs);await write(0,policy,'bindExecutor',bindingArgs);
  await rejects(0,policy,'bindExecutor',[payer,attacker,...await approve(bindingAction)]);
  await rejects(2,policy,'registerAgent',[hash('self-owned-escape'),payer,1000000n,1000000n,3600n]);
  await rejects(7,policy,'registerAgent',[hash('victim-executor-front-run'),payer,1000000n,1000000n,3600n]);
  const attackerBinding=keccak256(encodeAbiParameters([{type:'string'},{type:'address'},{type:'address'}],['EXECUTOR_OWNER',attacker,attacker]));
  await write(0,policy,'bindExecutor',[attacker,attacker,...await approve(attackerBinding)]);
  await write(1,policy,'registerAgent',[agent,payer,30000n,20000n,3600n]);
  await write(1,policy,'setCounterparty',[agent,3,seller,true]);
  const globalVersion=await read(policy,'policyVersion'); await write(7,policy,'registerAgent',[hash('unrelated'),attacker,1n,1n,3600n]); assert.equal(await read(policy,'policyVersion'),globalVersion);
  await rejects(0,policy,'setAgent',[agent,attacker,true,100000n,100000n,3600n]);
  await rejects(7,policy,'setCounterparty',[agent,3,attacker,true]);
  const unit=hash('verification-job'),endpoint=hash('https://seller.example/v1');
  await write(3,market,'registerService',[3,unit,1n,10000n,endpoint]);
  const serviceHash=keccak256(encodeAbiParameters([{type:'uint256'},{type:'address'},{type:'address'},{type:'uint8'},{type:'bytes32'},{type:'uint256'},{type:'uint256'},{type:'bytes32'}],[31337n,market,seller,3,unit,1n,10000n,endpoint]));
  await write(0,canonical,'mint',[payer,100000n]);await write(2,canonical,'approve',[market,100000n]);
  const order=async(id,overrides={})=>({orderId:hash(id),agentId:agent,category:3,seller,serviceHash,unitHash:unit,quantity:1n,unitPrice:10000n,amount:10000n,inputHash:hash('input'),deadline:await now()+1000n,policyVersion:await read(policy,'policyVersion'),agentVersion:await read(policy,'agentVersions',[agent]),feeVersion:await read(policy,'feeVersion'),...overrides});
  await rejects(7,market,'settle',[await order('unauthorized')]);
  await rejects(0,market,'settle',[await order('controller-cannot-debit')]);
  for(const override of [{seller:attacker},{amount:9999n},{quantity:2n},{unitHash:hash('wrong')},{category:2},{deadline:1n},{policyVersion:0n},{agentVersion:0n},{feeVersion:0n}]) await rejects(2,market,'settle',[await order('bad',override)]);
  assert.equal(await read(canonical,'balanceOf',[payer]),100000n);
  const first=await order('first');await write(2,market,'settle',[first]);
  assert.equal(await read(canonical,'balanceOf',[seller]),9500n);assert.equal(await read(canonical,'balanceOf',[reserve]),300n);assert.equal(await read(canonical,'balanceOf',[review]),200n);assert.equal(await read(canonical,'balanceOf',[market]),0n);
  await rejects(2,market,'settle',[first]);
  assert.deepEqual(await read(ledger,'reputation',[seller]),[1n,0n,0n]);assert.deepEqual(await read(ledger,'reputation',[attacker]),[0n,0n,0n]);
  await rejects(7,ledger,'attestDelivery',[first.orderId,hash('out')]);await rejects(3,ledger,'attestDelivery',[hash('missing'),hash('out')]);
  await write(3,ledger,'attestDelivery',[first.orderId,hash('out')]);await rejects(3,ledger,'attestDelivery',[first.orderId,hash('out2')]);
  await rejects(7,ledger,'acknowledgeDelivery',[first.orderId,hash('out')]);await rejects(2,ledger,'acknowledgeDelivery',[first.orderId,hash('bad')]);
  await write(2,ledger,'acknowledgeDelivery',[first.orderId,hash('out')]);await rejects(2,ledger,'acknowledgeDelivery',[first.orderId,hash('out')]);
  assert.deepEqual(await read(ledger,'reputation',[seller]),[1n,1n,1n]);
  // Allowance failure rolls back order replay and both policy accounting windows.
  await write(2,canonical,'approve',[market,0n]);const second=await order('second');await rejects(2,market,'settle',[second]);assert.equal(await read(policy,'consumed',[second.orderId]),false);
  await write(2,canonical,'approve',[market,100000n]);await write(2,market,'settle',[second]);
  await rejects(2,market,'settle',[await order('window-cap')]);
  await client.request({method:'evm_increaseTime',params:[3601]});await client.request({method:'evm_mine'});
  await write(2,market,'settle',[await order('third')]);await rejects(2,market,'settle',[await order('total-cap')]);
  await write(1,policy,'setAgent',[agent,payer,true,100000n,10000n,3600n]);
  await rejects(2,market,'settle',[await order('agent-window-cap')]);
  await write(1,policy,'setAgent',[agent,payer,true,100000n,50000n,3600n]);
  await category({...c,windowCap:10000n}); await rejects(2,market,'settle',[await order('category-window-cap')]);
  await category(c);
  const staleAgent=await order('stale-agent');
  await write(1,policy,'setAgent',[agent,payer,false,100000n,50000n,3600n]);
  await rejects(2,market,'settle',[await order('inactive')]);
  await write(1,policy,'setAgent',[agent,payer,true,100000n,50000n,3600n]);
  await rejects(2,market,'settle',[staleAgent]);
  await write(1,policy,'setCounterparty',[agent,3,seller,false]); await rejects(2,market,'settle',[await order('seller-denied')]);
  await write(1,policy,'setCounterparty',[agent,3,seller,true]);
  await category({...c,perOrderCap:9999n});await rejects(2,market,'settle',[await order('price-cap')]);
  await category({...c,windowCap:50000n,delaySeconds:100n});await rejects(2,market,'settle',[await order('delay')]);
  await client.request({method:'evm_increaseTime',params:[101]});await client.request({method:'evm_mine'});await write(2,market,'settle',[await order('after-delay')]);
  await write(6,policy,'emergencyPause',[hash('emergency')]);await rejects(2,market,'settle',[await order('paused')]);
  const oldResumeArgs=await approve(keccak256(encodeAbiParameters([{type:'string'}],['RESUME'])));
  await write(6,policy,'emergencyPause',[hash('fresh-emergency')]);await rejects(0,policy,'resume',oldResumeArgs);
  const resumeArgs=await approve(keccak256(encodeAbiParameters([{type:'string'}],['RESUME'])));await rejects(6,policy,'resume',resumeArgs);await write(0,policy,'resume',resumeArgs);
  const staleFeeOrder=await order('stale-fee');const fees=keccak256(encodeAbiParameters([{type:'string'},{type:'uint16'},{type:'uint16'}],['FEES',400,200]));await write(0,policy,'setFees',[400,200,...await approve(fees)]);await rejects(2,market,'settle',[{...staleFeeOrder,policyVersion:await read(policy,'policyVersion')}]);
  await rejects(0,policy,'setFees',[1000,1,...await approve(fees)]);
  // Tiny principal pays all dust to seller and never traps atoms in settlement.
  await category({...c,windowCap:50000n});await write(3,market,'registerService',[3,unit,1n,1n,endpoint]);
  const tinyHash=keccak256(encodeAbiParameters([{type:'uint256'},{type:'address'},{type:'address'},{type:'uint8'},{type:'bytes32'},{type:'uint256'},{type:'uint256'},{type:'bytes32'}],[31337n,market,seller,3,unit,1n,1n,endpoint]));
  const before=await read(canonical,'balanceOf',[seller]);await write(2,market,'settle',[await order('tiny',{serviceHash:tinyHash,unitPrice:1n,amount:1n})]);assert.equal(await read(canonical,'balanceOf',[seller]),before+1n);
  const obs=[hash('ARPI'),1n,2n,1000000n,1000000n,hash('root'),hash('method-v1')];await rejects(7,ledger,'recordObservation',obs);await write(0,ledger,'recordObservation',obs);await rejects(0,ledger,'recordObservation',obs);
});
