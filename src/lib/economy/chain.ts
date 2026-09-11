import {createPublicClient, http, parseAbi, type Address} from 'viem';
import {z} from 'zod';
import deploymentFile from './deployment.json';

const address=z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform(value=>value.toLowerCase() as Address);
export const deploymentSchema=z.object({chainId:z.literal(5042002),policy:address,ledger:address,settlement:address,fromBlock:z.string().regex(/^\d+$/),controller:address,approver:address,reserve:address,reviewPool:address});
export type EconomyDeployment=z.infer<typeof deploymentSchema>;
export function economyDeployment():EconomyDeployment|null{return deploymentFile===null?null:deploymentSchema.parse(deploymentFile);}
export const marketAbi=parseAbi([
 'event ServiceRegistered(bytes32 indexed serviceHash,address indexed seller,uint8 category,bytes32 unitHash,uint256 quantity,uint256 unitPrice,bytes32 endpointHash)',
 'event OrderSettled(bytes32 indexed orderId,bytes32 indexed orderHash,address indexed payer,uint256 amount,uint256 sellerAmount,uint256 reserveAmount,uint256 reviewAmount,uint256 rebateAmount,uint64 policyVersion,uint64 feeVersion)',
 'function services(bytes32) view returns(address seller,uint8 category,bytes32 unitHash,uint256 quantity,uint256 unitPrice,bytes32 endpointHash)',
 'function orderHashes(bytes32) view returns(bytes32)',
]);
export const ledgerAbi=parseAbi([
 'event OrderPaid(bytes32 indexed orderId,bytes32 indexed agentId,address indexed seller,bytes32 serviceHash,uint8 category,bytes32 unitHash,uint256 quantity,uint256 unitPrice,uint256 amount,bytes32 inputHash)',
 'event DeliveryAttested(bytes32 indexed orderId,address indexed seller,bytes32 outputHash)',
 'event BuyerAcknowledged(bytes32 indexed orderId,address indexed payer,bytes32 outputHash)',
 'event ObservationRecorded(bytes32 indexed observationHash,bytes32 indexed metricId,uint64 windowStart,uint64 windowEnd,int256 value,uint256 baseline,bytes32 inputRoot,bytes32 methodologyHash)',
 'function reputation(address) view returns(uint256 paid,uint256 delivered,uint256 acknowledged)',
]);
export const policyAbi=parseAbi([
 'function categories(uint8) view returns(bool enabled,uint256 perOrderCap,uint256 windowCap,uint64 windowSeconds,uint64 delaySeconds)',
 'function marketEnabled() view returns(bool)',
 'function reserveBps() view returns(uint16)', 'function reviewBps() view returns(uint16)',
 'function policyVersion() view returns(uint64)', 'function feeVersion() view returns(uint64)',
 'function agents(bytes32) view returns(address owner,address executor,bool active,uint256 totalCap,uint256 spent,uint256 windowCap,uint64 windowSeconds)',
 'event AgentRegistered(bytes32 indexed agentId,address indexed owner,address executor)',
 'event PolicyChanged(uint64 indexed version,bytes32 indexed actionHash,bytes32 indexed observationHash,address actor,bytes32 approvalDigest)',
]);
export function economyClient(){return createPublicClient({transport:http(process.env.ARC_RPC_URL||'https://rpc.testnet.arc.network',{timeout:20000,retryCount:1})});}
export function serializable<T>(value:T):unknown{return JSON.parse(JSON.stringify(value,(_key,v)=>typeof v==='bigint'?v.toString():v));}
