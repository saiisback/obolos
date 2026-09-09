import { constants } from 'node:fs';
import { mkdir, open, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import type { RunnerPins } from './types';
export interface RunnerConfig { readonly pins:Readonly<RunnerPins>;readonly token:string;readonly dataDir:string;readonly brokerUrl:string;readonly brokerToken:string;readonly dataServiceUrl:string }
const loopback=(url:URL)=>['127.0.0.1','localhost','[::1]'].includes(url.hostname);
function parseUrl(value:string|undefined,label:string):URL{
 let url:URL;try{url=new URL(value??'');}catch{throw new Error(`${label} must be configured as an absolute URL.`);}
 if(url.username||url.password||url.search||url.hash)throw new Error(`${label} cannot contain credentials, query parameters or fragments.`);
 return url;
}
export async function loadRunnerConfig(env:Record<string,string|undefined>=process.env):Promise<RunnerConfig>{
 const platform=parseUrl(env.RUNNER_PLATFORM_URL,'RUNNER_PLATFORM_URL');
 if(platform.pathname!=='/'||(platform.protocol!=='https:'&&!(platform.protocol==='http:'&&loopback(platform))))throw new Error('RUNNER_PLATFORM_URL must be an HTTPS origin (HTTP is allowed only for loopback development).');
 const broker=parseUrl(env.BROKER_URL,'BROKER_URL');
 if(broker.protocol!=='http:'||!loopback(broker)||broker.pathname!=='/')throw new Error('BROKER_URL must be a loopback HTTP origin.');
 const dataService=parseUrl(env.DATA_SERVICE_URL,'DATA_SERVICE_URL');
 if(dataService.protocol!=='https:'&&!(dataService.protocol==='http:'&&loopback(dataService)))throw new Error('DATA_SERVICE_URL must be HTTPS or loopback HTTP.');
 if(!z.uuid().safeParse(env.RUNNER_AGENT_ID).success||!/^0x[0-9a-fA-F]{40}$/.test(env.RUNNER_OWNER_ADDRESS??''))throw new Error('Pin RUNNER_AGENT_ID and RUNNER_OWNER_ADDRESS from your agent and owner wallet.');
 if(!env.BROKER_TOKEN||/[\r\n]/.test(env.BROKER_TOKEN))throw new Error('The local broker credential is missing or invalid.');
 if(!env.RUNNER_DATA_DIR||!env.RUNNER_TOKEN_FILE)throw new Error('RUNNER_DATA_DIR and RUNNER_TOKEN_FILE are required.');
 const dataDir=resolve(env.RUNNER_DATA_DIR),brokerDir=resolve(env.BROKER_DATA_DIR||'data/broker');
 await mkdir(dataDir,{recursive:true,mode:0o700});
 const canonical=await realpath(dataDir),canonicalBroker=await realpath(brokerDir).catch(()=>brokerDir);
 if(canonical===canonicalBroker)throw new Error('Runner and broker must have distinct journal directories.');
 const file=await open(resolve(env.RUNNER_TOKEN_FILE),constants.O_RDONLY|constants.O_NOFOLLOW);
 let token:string;
 try{
  const metadata=await file.stat();
  if(!metadata.isFile()||(metadata.mode&0o777)!==0o600||(process.getuid&&metadata.uid!==process.getuid())||metadata.size>4096)throw new Error('Runner token file must be a private regular file owned by this user with mode 0600.');
  token=(await file.readFile('utf8')).trim();
 }finally{await file.close();}
 if(!/^[A-Za-z0-9_-]{32,512}$/.test(token))throw new Error('Runner token file does not contain a valid raw pairing token.');
 return Object.freeze({pins:Object.freeze({origin:platform.origin,agentId:env.RUNNER_AGENT_ID!,owner:env.RUNNER_OWNER_ADDRESS!}),token,dataDir:canonical,brokerUrl:broker.origin,brokerToken:env.BROKER_TOKEN,dataServiceUrl:dataService.href.replace(/\/$/,'')});
}
