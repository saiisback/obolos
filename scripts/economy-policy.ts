import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {encodeAbiParameters,keccak256,verifyMessage,type Abi,type Address,type Hex} from 'viem';
import {z} from 'zod';
import {economyClient,economyDeployment} from '../src/lib/economy/chain';
import {configuration,executeCircle,signPolicyDigest} from './economy-circle';
const addr=z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform(v=>v as Address);
const atomic=z.string().regex(/^\d+$/);
const actionSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('enroll'),executor:addr,owner:addr}).strict(),
 z.object({kind:z.literal('category'),category:z.number().int().min(0).max(4),enabled:z.boolean(),perOrderCap:atomic,windowCap:atomic,windowSeconds:atomic,delaySeconds:atomic}).strict(),
]);
export function policyAction(value:unknown){const action=actionSchema.parse(value);
 if(action.kind==='enroll')return {action,hash:keccak256(encodeAbiParameters([{type:'string'},{type:'address'},{type:'address'}],['EXECUTOR_OWNER',action.executor,action.owner])),signature:'bindExecutor(address,address,bytes32,uint256,bytes)',parameters:[action.executor,action.owner]};
 const tuple=[action.enabled,BigInt(action.perOrderCap),BigInt(action.windowCap),BigInt(action.windowSeconds),BigInt(action.delaySeconds)] as const;
 return {action,hash:keccak256(encodeAbiParameters([{type:'string'},{type:'uint8'},{type:'tuple',components:[{type:'bool'},{type:'uint256'},{type:'uint256'},{type:'uint64'},{type:'uint64'}]}],['CATEGORY',action.category,tuple])),signature:'setCategory(uint8,(bool,uint256,uint256,uint64,uint64),bytes32,uint256,bytes)',parameters:[String(action.category),JSON.stringify(tuple.map(v=>typeof v==='bigint'?v.toString():v))]};
}
async function main(){
 const [file,flag]=process.argv.slice(2);if(!file||flag!=='--execute-testnet')throw Error('Provide an action JSON file and --execute-testnet. Review its exact limits first.');
 const filename=resolve(file),raw=JSON.parse(await readFile(filename,'utf8'));
 const plan=z.object({name:z.string().regex(/^[a-zA-Z0-9_-]{1,70}$/),observation:z.string().regex(/^0x[0-9a-fA-F]{64}$/),action:z.unknown(),approval:z.object({digest:z.string(),nonce:atomic,deadline:atomic,signature:z.string().optional(),signerMode:z.string().optional()}).optional()}).strict().parse(raw);
 const prepared=policyAction(plan.action),deployment=economyDeployment();if(!deployment)throw Error('Deploy first');
 const client=economyClient(),config=configuration();const artifact=JSON.parse(await readFile('contracts/artifacts/ObolosPolicyEnvelope.json','utf8')) as {abi:Abi};
 if(!plan.approval){const nonce=await client.readContract({address:deployment.policy,abi:artifact.abi,functionName:'approvalNonce'}) as bigint;const deadline=BigInt(Math.floor(Date.now()/1000)+3600);const digest=await client.readContract({address:deployment.policy,abi:artifact.abi,functionName:'approvalDigest',args:[prepared.hash,plan.observation,nonce,deadline]}) as Hex;plan.approval={digest,nonce:String(nonce),deadline:String(deadline)};await writeFile(filename,JSON.stringify(plan,null,2)+'\n',{mode:0o600});}
 const expected=await client.readContract({address:deployment.policy,abi:artifact.abi,functionName:'approvalDigest',args:[prepared.hash,plan.observation,BigInt(plan.approval.nonce),BigInt(plan.approval.deadline)]}) as Hex;
 const approver=await client.readContract({address:deployment.policy,abi:artifact.abi,functionName:'approver'}) as Address;
 if(expected.toLowerCase()!==plan.approval.digest.toLowerCase()||approver.toLowerCase()!==config.approver.toLowerCase())throw Error('Saved approval differs from the displayed action or configured authority');
 if(!plan.approval.signature){console.log(JSON.stringify({review:prepared.action,policy:deployment.policy,digest:plan.approval.digest,mode:process.env.LEDGER_SIGNER_MODE}));const signed=await signPolicyDigest(plan.approval.digest as Hex);plan.approval.signature=signed.signature;plan.approval.signerMode=signed.signerMode;await writeFile(filename,JSON.stringify(plan,null,2)+'\n',{mode:0o600});}
 if(!await verifyMessage({address:approver,message:{raw:expected},signature:plan.approval.signature as Hex}))throw Error('Invalid policy signature');
 const op=await executeCircle(config,plan.name,deployment.policy,prepared.signature,[...prepared.parameters,plan.observation,plan.approval.deadline,plan.approval.signature]);
 if(typeof op.result?.txHash!=='string')throw Error('Reconcile pending policy operation');
 const receipt=await client.waitForTransactionReceipt({hash:op.result.txHash as Hex});if(receipt.status!=='success')throw Error('Policy transaction reverted');
 console.log(JSON.stringify({name:plan.name,transactionHash:receipt.transactionHash,blockNumber:String(receipt.blockNumber),signerMode:plan.approval.signerMode}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(()=>{console.error('Policy action did not complete. Preserve the action file and operation journal for reconciliation.');process.exitCode=1;});
