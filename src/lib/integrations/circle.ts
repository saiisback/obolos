import { createHash } from 'node:crypto';
import { createPublicClient, decodeEventLog, http, isAddress, parseAbiItem, type Address } from 'viem';
import type { Receipt } from '../contracts';
import { runFile, type BrokerEnv } from './ledger';

export const ARC_CHAIN_ID = 5042002;
export const ARC_USDC = '0x3600000000000000000000000000000000000000';
const transferEvent = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');
interface Transfer {sender:string;recipient:string;amountAtomic:number}
function validate(input:Transfer) {
  if(!isAddress(input.sender)||!isAddress(input.recipient)||!Number.isSafeInteger(input.amountAtomic)||input.amountAtomic<=0) throw Error('Invalid Arc payment configuration.');
}
export function circleTransferArgs(input:Transfer, idempotencyKey?:string):string[] {
  validate(input);
  const amount=(BigInt(input.amountAtomic)/1_000_000n).toString()+'.'+(BigInt(input.amountAtomic)%1_000_000n).toString().padStart(6,'0');
  return ['wallet','transfer',input.recipient,'--amount',amount,'--address',input.sender,'--chain','ARC-TESTNET','--token',ARC_USDC,...(idempotencyKey?['--idempotency-key',idempotencyKey]:[]),'--output','json'];
}
export function assertCircleTransfer(settlement:{chainId:number;status:string;events:{address:string;from:string;to:string;value:bigint}[]}, input:Transfer) {
  validate(input);
  if(settlement.chainId!==ARC_CHAIN_ID||settlement.status!=='success'||!settlement.events.some(e=>e.address.toLowerCase()===ARC_USDC.toLowerCase()&&e.from.toLowerCase()===input.sender.toLowerCase()&&e.to.toLowerCase()===input.recipient.toLowerCase()&&e.value===BigInt(input.amountAtomic))) throw Error('Arc settlement did not match the authorized USDC transfer.');
}
function cliEnv(env:BrokerEnv) {return {NODE_ENV:'production' as const,PATH:env.PATH,HOME:env.HOME,CIRCLE_CLI_HOME:env.CIRCLE_CLI_HOME,DO_NOT_TRACK:'1'};}
export async function circleAgentReady(env:BrokerEnv):Promise<boolean> {
  try {
    if(!env.CIRCLE_WALLET_ADDRESS||!env.CIRCLE_CLI_HOME||!env.ARC_VERIFIER_ADDRESS||!isAddress(env.ARC_VERIFIER_ADDRESS)) return false;
    const {stdout}=await runFile(env.CIRCLE_CLI||'circle',['wallet','list','--type','agent','--chain','ARC-TESTNET','--output','json'],{shell:false,encoding:'utf8',timeout:20_000,maxBuffer:256*1024,env:cliEnv(env)});
    const result=JSON.parse(stdout);
    return Array.isArray(result.data?.wallets)&&result.data.wallets.some((w:{type?:string;blockchain?:string;address?:string})=>w.type==='agent'&&w.blockchain==='ARC-TESTNET'&&w.address?.toLowerCase()===env.CIRCLE_WALLET_ADDRESS!.toLowerCase());
  } catch {return false;}
}
/** Caller must persist a pending intent BEFORE invoking this function. */
export async function purchaseCircleVerification(input:{runId:string;requestId:string;amountAtomic:number;mandateExpiresAt:string;onSubmitted?:(hash:string)=>Promise<void>},env:BrokerEnv):Promise<Receipt> {
  const transfer={sender:env.CIRCLE_WALLET_ADDRESS||'',recipient:env.ARC_VERIFIER_ADDRESS||'',amountAtomic:input.amountAtomic};
  validate(transfer);
  const assertExpiry=()=>{
    const expiresAt=Date.parse(input.mandateExpiresAt);
    if(!Number.isFinite(expiresAt)||expiresAt<=Date.now())throw Error('Mandate expired before Arc transfer submission.');
  };
  assertExpiry();
  // Preserve the original namespace across branding changes to prevent duplicate payments.
  // Derive UUID from immutable request identity. CLI 1.0.0 accepts and echoes this key.
  const h=createHash('sha256').update(`agentgdp:arc:${input.runId}:${input.requestId}`).digest('hex');
  const key=`${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
  try {
    if(!await circleAgentReady(env)) throw Error();
    assertExpiry();
    const {stdout}=await runFile(env.CIRCLE_CLI||'circle',circleTransferArgs(transfer,key),{shell:false,encoding:'utf8',timeout:180_000,maxBuffer:256*1024,env:cliEnv(env)});
    const tx=JSON.parse(stdout).data;
    if(tx?.idempotencyKey!==key||tx.blockchain!=='ARC-TESTNET'||typeof tx.txHash!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(tx.txHash)||tx.sourceAddress?.toLowerCase()!==transfer.sender.toLowerCase()||tx.destinationAddress?.toLowerCase()!==transfer.recipient.toLowerCase()) throw Error();
    if(input.onSubmitted)await input.onSubmitted(tx.txHash);
    const client=createPublicClient({transport:http(env.ARC_RPC_URL||'https://rpc.testnet.arc.network',{timeout:20_000,retryCount:0})});
    const chainId=await client.getChainId();
    const receipt=await client.waitForTransactionReceipt({hash:tx.txHash as `0x${string}`,confirmations:1,timeout:60_000});
    const events=receipt.logs.flatMap(log=>{
      if(log.address.toLowerCase()!==ARC_USDC.toLowerCase()) return [];
      try {const e=decodeEventLog({abi:[transferEvent],data:log.data,topics:log.topics}); return [{address:log.address,from:e.args.from as Address,to:e.args.to as Address,value:e.args.value}];} catch{return [];}
    });
    assertCircleTransfer({chainId,status:receipt.status,events},transfer);
    return {id:`arc-${tx.txHash}`,requestId:input.requestId,mode:'live',network:'arc:testnet',asset:'USDC',amountAtomic:input.amountAtomic,units:1,provider:'arc-verifier',status:'settled',timestamp:new Date().toISOString(),transactionId:tx.txHash,explorerUrl:`https://testnet.arcscan.app/tx/${tx.txHash}`};
  } catch {throw Error('Arc payment outcome uncertain; reconcile the persisted request before any new payment.');}
}
