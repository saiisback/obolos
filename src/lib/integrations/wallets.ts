import {isAddress} from 'viem';
import type {BrokerEnv,BrokerSecrets} from './ledger';
import {brokerWalletsSchema,type BrokerWallets,type WalletSnapshot} from '../live-contracts';

const HEDERA_MIRROR='https://testnet.mirrornode.hedera.com';
const ARC_RPC='https://rpc.testnet.arc.io';
const ARC_USDC='0x3600000000000000000000000000000000000000';
const ARC_CHAIN=5042002n;
const account=(value:unknown):string|null=>typeof value==='string'&&/^0\.0\.[1-9]\d{0,18}$/.test(value)?value:null;
const evm=(value:unknown):string|null=>typeof value==='string'&&isAddress(value)&&!/^0x0{40}$/i.test(value)?value:null;

async function readText(response:Response):Promise<string>{
  if(!response.ok||!response.body)throw Error('Wallet read failed');
  const reader=response.body.getReader();
  const chunks:Uint8Array[]=[];let length=0;
  try {
    while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>131072)throw Error('Oversized wallet response');chunks.push(value);}
  } finally {await reader.cancel().catch(()=>undefined);}
  return Buffer.concat(chunks).toString('utf8');
}

/** JSON numeric tokens stay exact on Node 22+; older runtimes fail closed on unsafe numbers. */
function parseMirror(text:string):unknown{
  return JSON.parse(text,(_key:string,value:unknown,context?:{source?:string})=>{
    if(typeof value!=='number')return value;
    if(context?.source)return context.source;
    if(!Number.isSafeInteger(value))throw Error('Unsafe mirror number');
    return String(value);
  });
}

async function readHedera(address:string,signal:AbortSignal):Promise<string>{
  const response=await fetch(`${HEDERA_MIRROR}/api/v1/accounts/${address}?transactions=false`,{redirect:'error',signal,headers:{Accept:'application/json'}});
  const body=parseMirror(await readText(response)) as {account?:unknown;balance?:{balance?:unknown}};
  const balance=body?.balance?.balance;
  if(body?.account!==address||typeof balance!=='string'||!/^\d+$/.test(balance)||BigInt(balance)>9223372036854775807n)throw Error('Invalid mirror account balance');
  return BigInt(balance).toString();
}

async function readArc(address:string,signal:AbortSignal):Promise<string>{
  let id=0;
  const rpc=async(method:string,params:unknown[]):Promise<string>=>{
    const requestId=++id;
    const response=await fetch(ARC_RPC,{method:'POST',redirect:'error',signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:requestId,method,params})});
    const body=JSON.parse(await readText(response)) as {id?:unknown;jsonrpc?:unknown;error?:unknown;result?:unknown};
    if(body.id!==requestId||body.jsonrpc!=='2.0'||body.error!==undefined||typeof body.result!=='string'||!/^0x[0-9a-fA-F]+$/.test(body.result))throw Error('Invalid Arc RPC response');
    return body.result;
  };
  if(BigInt(await rpc('eth_chainId',[]))!==ARC_CHAIN)throw Error('Wrong Arc chain');
  const decimals=await rpc('eth_call',[{to:ARC_USDC,data:'0x313ce567'},'latest']);
  if(!/^0x[0-9a-fA-F]{64}$/.test(decimals)||BigInt(decimals)!==6n)throw Error('Wrong token precision');
  const balance=await rpc('eth_call',[{to:ARC_USDC,data:'0x70a08231'+address.slice(2).toLowerCase().padStart(64,'0')},'latest']);
  if(!/^0x[0-9a-fA-F]{64}$/.test(balance))throw Error('Invalid token balance');
  return BigInt(balance).toString();
}

/** Read-only. No wallet login, signing, funding or CLI execution occurs here. */
export async function getBrokerWallets(env:BrokerEnv,secrets?:BrokerSecrets):Promise<BrokerWallets>{
  const hederaAddress=account(secrets?.hedera.accountId);
  const arcAddress=evm(env.CIRCLE_WALLET_ADDRESS);
  const hedera:WalletSnapshot={id:'hedera-payer',name:'Hedera payer',network:'hedera:testnet',asset:'HBAR',decimals:8,address:hederaAddress,payTo:account(env.HEDERA_PAY_TO),balanceAtomic:null,balanceStatus:hederaAddress?'unavailable':'unconfigured',balanceSource:hederaAddress?'hedera-mirror':null,explorerUrl:hederaAddress?`https://hashscan.io/testnet/account/${hederaAddress}`:null,detail:hederaAddress?'Testnet mirror balance unavailable.':'Unlock the broker Key Ring bundle to identify the Hedera payer.'};
  const arc:WalletSnapshot={id:'circle-agent',name:'Circle agent wallet',network:'arc:testnet',asset:'USDC',decimals:6,address:arcAddress,payTo:evm(env.ARC_VERIFIER_ADDRESS),balanceAtomic:null,balanceStatus:arcAddress?'unavailable':'unconfigured',balanceSource:arcAddress?'arc-rpc':null,explorerUrl:arcAddress?`https://testnet.arcscan.app/address/${arcAddress}`:null,detail:arcAddress?'Arc testnet USDC balance unavailable.':'Configure the public Circle agent wallet address.'};
  // Independent fixed-host reads share an eight-second upper deadline, with no retries.
  const signal=AbortSignal.timeout(8000);
  await Promise.allSettled([
    (async()=>{if(!hederaAddress)return;try{hedera.balanceAtomic=await readHedera(hederaAddress,signal);hedera.balanceStatus='available';hedera.detail='Observed HBAR balance from the testnet mirror; indexing may lag consensus.';}catch{/* Never return provider errors or credentials. */}})(),
    (async()=>{if(!arcAddress)return;try{
      if(env.ARC_RPC_URL){const configured=new URL(env.ARC_RPC_URL);if(![ARC_RPC+'/', 'https://rpc.testnet.arc.network/'].includes(configured.href)||configured.username||configured.password)throw Error('Noncanonical RPC');}
      arc.balanceAtomic=await readArc(arcAddress,signal);arc.balanceStatus='available';arc.detail='Observed canonical USDC ERC-20 balance on chain 5042002, using six decimals. This does not prove an active Circle signing session.';
    }catch{/* Balance remains explicitly unknown. */}})(),
  ]);
  return brokerWalletsSchema.parse({observedAt:new Date().toISOString(),wallets:[hedera,arc]});
}
