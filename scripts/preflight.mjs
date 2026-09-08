import {parseEnv} from 'node:util';
import {access,readFile,stat} from 'node:fs/promises';
import {constants} from 'node:fs';
import {delimiter,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {isAddress} from 'viem';

const validAddress=value=>typeof value==='string'&&isAddress(value)&&!/^0x0{40}$/i.test(value);
const positive=value=>typeof value==='string'&&/^\d+$/.test(value)&&Number.isSafeInteger(Number(value))&&Number(value)>0;
const port=value=>positive(value)&&Number(value)<=65535;
const longToken=value=>typeof value==='string'&&value.length>=32;
const loopback=hostname=>['localhost','127.0.0.1','[::1]'].includes(hostname);
function safeUrl(value,{localOnly=false,originOnly=false,httpsOnly=false}={}){
  try{const url=new URL(value);if(url.username||url.password||url.search||url.hash||(originOnly&&url.pathname!=='/'))return null;
    if(httpsOnly?url.protocol!=='https:':url.protocol!=='https:'&&!(url.protocol==='http:'&&loopback(url.hostname)))return null;
    if(localOnly&&!loopback(url.hostname))return null;
    return url;
  }catch{return null;}
}
const normalized=value=>safeUrl(value)?.href.replace(/\/$/,'');

/** Local configuration inspection only: never executes tools, unlocks keys, or calls the network.
 * @param {string} root
 * @param {Record<string,string|undefined>} runtime
 */
export async function runPreflight(root=process.cwd(),runtime=process.env){
  const checks=[];
  const add=(name,status)=>checks.push({name,status});
  const required=(scope,env,name,predicate=value=>!!value)=>add(`${scope}:${name}`,!env[name]?'missing':predicate(env[name])?'ready':'invalid');
  const read=async filename=>{try{const info=await stat(resolve(root,filename));if(!info.isFile()||info.size>131072)throw Error();const env=parseEnv(await readFile(resolve(root,filename),'utf8'));add(filename,'ready');return env;}catch(error){add(filename,error?.code==='ENOENT'?'missing':'unreadable');return {};}};
  const [app,broker,service]=await Promise.all(['.env.local','.env.broker','.env.services'].map(read));
  const match=(name,a,b,normalize=value=>value)=>add(name,a&&b&&normalize(a)&&normalize(b)&&normalize(a)===normalize(b)?'ready':'mismatch');
  const existing=async(scope,name,value,kind)=>{
    if(!value){add(`${scope}:${name}`, 'missing');return;}
    try{const info=await stat(resolve(root,value));if(kind==='file'?!info.isFile():!info.isDirectory())throw Error();await access(resolve(root,value),constants.R_OK);add(`${scope}:${name}`,'ready');}catch{add(`${scope}:${name}`,'unavailable');}
  };
  const executable=async(name,value,fallback)=>{
    const command=value||fallback;
    const candidates=command.includes('/')?[resolve(root,command)]:(runtime.PATH||'').split(delimiter).filter(Boolean).map(directory=>resolve(directory,command));
    for(const candidate of candidates){try{if(!(await stat(candidate)).isFile())continue;await access(candidate,constants.X_OK);add(`broker:${name}`,'ready');return;}catch{/* Do not execute candidates or print configured paths. */}}
    add(`broker:${name}`,'unavailable');
  };
  for(const name of ['SESSION_SECRET','OPERATOR_TOKEN','BROKER_TOKEN'])required('app',app,name,longToken);
  required('app',app,'APP_ORIGIN',value=>!!safeUrl(value,{originOnly:true}));
  required('app',app,'BROKER_URL',value=>!!safeUrl(value,{localOnly:true,originOnly:true}));
  required('app',app,'LEDGER_CONTROLLER_ADDRESS',validAddress);
  required('app',app,'DATA_SERVICE_URL',value=>!!safeUrl(value));
  add('app:COOKIE_SECURE',safeUrl(app.APP_ORIGIN)?.protocol==='https:'?app.COOKIE_SECURE==='true'?'ready':'invalid':['true','false',undefined].includes(app.COOKIE_SECURE)?'ready':'invalid');
  add('SESSION_SECRET/OPERATOR_TOKEN/BROKER_TOKEN:independent',app.SESSION_SECRET&&app.OPERATOR_TOKEN&&app.BROKER_TOKEN&&new Set([app.SESSION_SECRET,app.OPERATOR_TOKEN,app.BROKER_TOKEN]).size===3?'ready':'invalid');
  required('broker',broker,'BROKER_TOKEN',longToken);
  for(const name of ['BROKER_MAX_DATA_ATOMIC','BROKER_MAX_USDC_ATOMIC'])required('broker',broker,name,positive);
  required('broker',broker,'BROKER_ALLOWED_PROVIDERS',value=>{const ids=value.split(',');return ids.length>0&&new Set(ids).size===ids.length&&ids.every(id=>['repo-standard','repo-economy'].includes(id));});
  add('broker:BROKER_PORT',port(broker.BROKER_PORT||'4319')?'ready':'invalid');
  const brokerUrl=safeUrl(app.BROKER_URL,{localOnly:true,originOnly:true});
  add('BROKER_URL/BROKER_PORT',brokerUrl&&Number(brokerUrl.port||(brokerUrl.protocol==='https:'?'443':'80'))===Number(broker.BROKER_PORT||'4319')?'ready':'mismatch');
  const appSigner=app.LEDGER_SIGNER_MODE||'usb',brokerSigner=broker.LEDGER_SIGNER_MODE||'usb';
  add('LEDGER_SIGNER_MODE:app/broker',['usb','speculos'].includes(appSigner)&&appSigner===brokerSigner?'ready':'mismatch');
  required('broker',broker,'LEDGER_RING_KEY');
  required('broker',broker,'LEDGER_CONTROLLER_ADDRESS',validAddress);
  add('broker:LEDGER_DERIVATION_PATH',/^44'\/60'\/\d+'\/\d+\/\d+$/.test(broker.LEDGER_DERIVATION_PATH||"44'/60'/0'/0/0")?'ready':'invalid');
  required('broker',broker,'DATA_SERVICE_URL',value=>!!safeUrl(value));
  required('broker',broker,'HEDERA_PAY_TO',value=>/^0\.0\.[1-9]\d*$/.test(value));
  required('broker',broker,'CIRCLE_WALLET_ADDRESS',validAddress);
  required('broker',broker,'ARC_VERIFIER_ADDRESS',validAddress);
  add('CIRCLE_WALLET_ADDRESS/ARC_VERIFIER_ADDRESS:distinct',broker.CIRCLE_WALLET_ADDRESS&&broker.ARC_VERIFIER_ADDRESS&&broker.CIRCLE_WALLET_ADDRESS.toLowerCase()!==broker.ARC_VERIFIER_ADDRESS.toLowerCase()?'ready':'invalid');
  const rpc=safeUrl(broker.ARC_RPC_URL||'https://rpc.testnet.arc.network');
  add('broker:ARC_RPC_URL',rpc&&['https://rpc.testnet.arc.io/','https://rpc.testnet.arc.network/'].includes(rpc.href)?'ready':'invalid');
  required('broker',broker,'ARC_VERIFICATION_FEE_ATOMIC',value=>value==='50000');
  required('broker',broker,'INFERENCE_BASE_URL',value=>!!safeUrl(value,{httpsOnly:true}));
  required('broker',broker,'INFERENCE_MODEL');
  add('runtime:WALLET_PASS',runtime.WALLET_PASS?'present':'missing');
  for(const [scope,env] of [['app',app],['broker',broker],['services',service]]){
    add(`${scope}:WALLET_PASS`,env.WALLET_PASS?'forbidden':'absent');
    for(const name of ['HEDERA_PAYER_PRIVATE_KEY','INFERENCE_API_KEY'])add(`${scope}:${name}`,env[name]?'forbidden':'absent');
  }
  required('services',service,'HEDERA_PAY_TO',value=>/^0\.0\.[1-9]\d*$/.test(value));
  required('services',service,'DATA_SERVICE_PUBLIC_URL',value=>!!safeUrl(value));
  required('services',service,'DATA_SERVICE_OPERATOR_TOKEN',value=>value.length>=24);
  add('services:DATA_SERVICE_PORT',port(service.DATA_SERVICE_PORT||'4402')?'ready':'invalid');
  const serviceUrl=safeUrl(service.DATA_SERVICE_PUBLIC_URL);
  add('DATA_SERVICE_PUBLIC_URL/DATA_SERVICE_PORT',!serviceUrl?'mismatch':loopback(serviceUrl.hostname)&&serviceUrl.protocol==='http:'&&Number(serviceUrl.port||'80')!==Number(service.DATA_SERVICE_PORT||'4402')?'mismatch':'ready');
  add('services:GITHUB_TOKEN',service.GITHUB_TOKEN?'present':'optional');
  match('BROKER_TOKEN:app/broker',app.BROKER_TOKEN,broker.BROKER_TOKEN);
  match('LEDGER_CONTROLLER_ADDRESS:app/broker',app.LEDGER_CONTROLLER_ADDRESS,broker.LEDGER_CONTROLLER_ADDRESS,value=>value.toLowerCase());
  match('HEDERA_PAY_TO:broker/services',broker.HEDERA_PAY_TO,service.HEDERA_PAY_TO);
  match('DATA_SERVICE_URL:app/broker',app.DATA_SERVICE_URL,broker.DATA_SERVICE_URL,normalized);
  match('DATA_SERVICE_URL:broker/services',broker.DATA_SERVICE_URL,service.DATA_SERVICE_PUBLIC_URL,normalized);
  if(app.DATA_SERVICE_OPERATOR_TOKEN)match('DATA_SERVICE_OPERATOR_TOKEN:app/services',app.DATA_SERVICE_OPERATOR_TOKEN,service.DATA_SERVICE_OPERATOR_TOKEN);
  else add('app:DATA_SERVICE_OPERATOR_TOKEN','optional');
  await Promise.all([
    existing('broker','LEDGER_RING_FILE',broker.LEDGER_RING_FILE,'file'),
    existing('broker','CIRCLE_CLI_HOME',broker.CIRCLE_CLI_HOME,'directory'),
    existing('broker','BROKER_DATA_DIR',broker.BROKER_DATA_DIR||'data/broker','directory'),
    executable('LEDGER_WALLET_CLI',broker.LEDGER_WALLET_CLI,'wallet-cli'),
    executable('CIRCLE_CLI',broker.CIRCLE_CLI,'circle'),
  ]);
  return {ok:checks.every(check=>['ready','present','absent','optional'].includes(check.status)),checks};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{const result=await runPreflight();for(const check of result.checks)console.log(`${check.name}: ${check.status}`);
    console.log(`CONFIGURATION: ${result.ok?'ready':'incomplete'}`);
    console.log('Configuration inspection only. Wallet sessions, funding, hardware approval and settlement remain unverified.');
    process.exitCode=result.ok?0:1;
  }catch{console.error('PREFLIGHT: unavailable');process.exitCode=1;}
}
