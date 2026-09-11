/** Read-only ERC-4337 correlation. Never guesses a hash from amount or timing. */
import {createPublicClient,decodeEventLog,parseAbi,type Address,type Hex} from 'viem';
const supportedEntryPoint='0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789';
const eventAbi=parseAbi(['event UserOperationEvent(bytes32 indexed userOpHash,address indexed sender,address indexed paymaster,uint256 nonce,bool success,uint256 actualGasCost,uint256 actualGasUsed)']);
export type UserOpRecoveryClient=Pick<ReturnType<typeof createPublicClient>,'getBlock'|'readContract'|'getLogs'|'getTransactionReceipt'>;
export async function findFinalizedUserOperation(client:UserOpRecoveryClient,wallet:Address,userOpHash:Hex):Promise<Hex|null>{
 if(!/^0x[\da-f]{64}$/i.test(userOpHash))throw Error('Invalid Circle user operation hash.');
 const finalized=await client.getBlock({blockTag:'finalized'});if(finalized.number===null)throw Error('Finalized block unavailable.');
 // Circle's currently deployed wallet exposes getEntryPoint; require its exact
 // onchain binding and the reviewed v0.6 EntryPoint, not any matching event emitter.
 const entryPoint=await client.readContract({address:wallet,abi:parseAbi(['function getEntryPoint() view returns(address)']),functionName:'getEntryPoint',blockNumber:finalized.number});
 if(entryPoint.toLowerCase()!==supportedEntryPoint)throw Error('Unsupported Circle wallet EntryPoint binding.');
 const logs=await client.getLogs({address:entryPoint,event:eventAbi[0],args:{userOpHash,sender:wallet},fromBlock:finalized.number>1999n?finalized.number-1999n:0n,toBlock:finalized.number});
 if(logs.length===0)return null;if(logs.length!==1)throw Error('Ambiguous UserOperationEvent evidence.');
 const match=(log:{address:string;data:Hex;topics:readonly Hex[]})=>{
  if(log.address.toLowerCase()!==supportedEntryPoint)return false;
  const event=decodeEventLog({abi:eventAbi,data:log.data,topics:log.topics as [Hex,...Hex[]],strict:true});
  return event.args.userOpHash.toLowerCase()===userOpHash.toLowerCase()&&event.args.sender.toLowerCase()===wallet.toLowerCase()&&event.args.success;
 };
 const log=logs[0];if(log.removed||!log.transactionHash||!log.blockHash||log.blockNumber===null||log.blockNumber>finalized.number||!match(log))throw Error('Invalid or failed UserOperationEvent.');
 const receipt=await client.getTransactionReceipt({hash:log.transactionHash});
 if(receipt.status!=='success'||receipt.transactionHash!==log.transactionHash||receipt.blockNumber!==log.blockNumber||receipt.blockHash!==log.blockHash||receipt.blockNumber>finalized.number||receipt.logs.filter(l=>{try{return match(l);}catch{return false;}}).length!==1)throw Error('User operation does not match a finalized successful receipt.');
 const canonical=await client.getBlock({blockNumber:receipt.blockNumber});if(canonical.number!==receipt.blockNumber||canonical.hash!==receipt.blockHash)throw Error('User operation receipt differs from canonical block.');
 return receipt.transactionHash;
}
