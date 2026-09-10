import {createPublicClient,decodeEventLog,http,parseAbiItem} from 'viem';
import {PlatformError} from '../platform/http';
const token='0x3600000000000000000000000000000000000000';
const transfer=parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');
type Expected={payer:string;recipient:string;amountAtomic:number;createdAt:string;expiresAt:string};
type Proof={chainId:number;status:string;timestamp:bigint;events:{address:string;from:string;to:string;value:bigint}[]};
export function assertMarketTransfer(p:Proof,o:Expected) {
 if(p.chainId!==5042002||p.status!=='success'||Number(p.timestamp)<Math.floor(Date.parse(o.createdAt)/1000)||Number(p.timestamp)>Math.floor(Date.parse(o.expiresAt)/1000)||!p.events.some(e=>e.address.toLowerCase()===token&&e.from.toLowerCase()===o.payer.toLowerCase()&&e.to.toLowerCase()===o.recipient.toLowerCase()&&e.value===BigInt(o.amountAtomic)))throw new PlatformError(409,'PAYMENT_UNCONFIRMED','Canonical Arc testnet USDC transfer does not match this order and its payment window.');
}
export async function verifyMarketTransfer(transactionHash:`0x${string}`,order:Expected) {
 // Never accept a runner-supplied RPC endpoint or chain assertion.
 const client=createPublicClient({transport:http('https://rpc.testnet.arc.network',{timeout:20000,retryCount:0})});
 const [chainId,receipt]=await Promise.all([client.getChainId(),client.getTransactionReceipt({hash:transactionHash})]);
 const block=await client.getBlock({blockHash:receipt.blockHash});
 const events=receipt.logs.flatMap(log=>{try{const event=decodeEventLog({abi:[transfer],data:log.data,topics:log.topics});return [{address:log.address,from:event.args.from,to:event.args.to,value:event.args.value}];}catch{return [];}});
 assertMarketTransfer({chainId,status:receipt.status,timestamp:block.timestamp,events},order);
 return {chainId,transactionHash,blockHash:receipt.blockHash,blockNumber:receipt.blockNumber.toString(),timestamp:block.timestamp.toString(),token,payer:order.payer,recipient:order.recipient,amountAtomic:order.amountAtomic};
}
