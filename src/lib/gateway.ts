import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { BrokerHealth, DataPurchase, Provider, Receipt, RepoEvidence, Report, VerificationPurchase } from './contracts';

export interface Gateway {
 discover():Promise<Provider[]>;
 purchaseData(input:DataPurchase):Promise<{evidence:RepoEvidence[];receipt:Receipt}>;
 generateReport(evidence:RepoEvidence[],runId:string):Promise<string>;
 verify(input:VerificationPurchase):Promise<{receipt:Receipt;checks?:Report['checks']}>;
}
export const DEFAULT_PROVIDERS:Provider[]=[
 {id:'repo-standard',name:'Repository Signals',description:'Current repository metadata with source evidence.',network:'hedera:testnet',asset:'HBAR',unit:'repository',unitPriceAtomic:100000},
 {id:'repo-economy',name:'Repository Signals Economy',description:'An alternative quote for the same verified repository fields.',network:'hedera:testnet',asset:'HBAR',unit:'repository',unitPriceAtomic:120000}
];
function simulatedReceipt(requestId:string,network:Receipt['network'],amount:number,units:number,provider:string):Receipt{
 return {id:randomUUID(),requestId,mode:'rehearsal',network,asset:network==='hedera:testnet'?'HBAR':'USDC',amountAtomic:amount,units,provider,status:'simulated',timestamp:new Date().toISOString()};
}
export const rehearsalGateway:Gateway={
 async discover(){return structuredClone(DEFAULT_PROVIDERS);},
 async purchaseData(input){
  const samples:Record<string,[number,number,string]>={'vercel/next.js':[135000,29000,'TypeScript'],'remix-run/react-router':[55000,10800,'TypeScript'],'sveltejs/kit':[19000,1900,'JavaScript']};
  return {evidence:input.repos.map(repo=>({repo,description:'Illustrative rehearsal fixture; not current GitHub data.',stars:samples[repo]?.[0]??1000,forks:samples[repo]?.[1]??100,openIssues:200,pushedAt:'2026-09-01T10:00:00.000Z',language:samples[repo]?.[2]??'TypeScript',license:'MIT',sourceUrl:`https://api.github.com/repos/${repo}`,fetchedAt:'2026-09-01T12:00:00.000Z'})),receipt:simulatedReceipt(input.requestId,'hedera:testnet',input.unitPriceAtomic*input.repos.length,input.repos.length,input.providerId)};
 },
 async generateReport(evidence){return `This rehearsal compares ${evidence.length} repositories using illustrative metadata. Review popularity, maintenance recency and licensing together; repository counts alone do not determine technical suitability.`;},
 async verify(input){return {receipt:simulatedReceipt(input.requestId,'arc:testnet',50000,1,'Report Verifier')};}
};
const providerSchema=z.object({id:z.string().regex(/^repo-(standard|economy)$/),name:z.string().max(100),description:z.string().max(500),network:z.literal('hedera:testnet'),asset:z.literal('HBAR'),unit:z.string().max(40),unitPriceAtomic:z.number().int().positive().max(100000000),endpoint:z.string().optional()});
export async function brokerRequest<T>(path:string,body?:unknown):Promise<T>{
 const url=process.env.BROKER_URL,token=process.env.BROKER_TOKEN;
 if(!url||!token)throw new Error('Live broker is not configured.');
 const response=await fetch(`${url.replace(/\/$/,'')}${path}`,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(path==='/health'?10000:path==='/wallets'?45000:300000),cache:'no-store',redirect:'error'});
 if(!response.ok)throw new Error(`Broker operation failed (${response.status}). Inspect the broker locally; no payment retry was made.`);
 return await response.json() as T;
}
export const liveGateway:Gateway={
 async discover(){
  if(!process.env.DATA_SERVICE_URL)throw new Error('Data service URL is not configured.');
  const response=await fetch(`${process.env.DATA_SERVICE_URL.replace(/\/$/,'')}/discovery`,{signal:AbortSignal.timeout(10000),cache:'no-store'});
  if(!response.ok)throw new Error('Service discovery is unavailable.');
  return z.array(providerSchema).min(1).max(10).parse(await response.json());
 },
 purchaseData(input){return brokerRequest('/data',input);},
 async generateReport(evidence,runId){const response=await brokerRequest<{summary:string}>('/report',{runId,evidence});return z.string().min(1).max(12000).parse(response.summary);},
 verify(input){return brokerRequest('/verify',input);}
};
export async function brokerHealth():Promise<BrokerHealth>{
 try{return await brokerRequest<BrokerHealth>('/health');}
 catch{return {ready:false,integrations:[{id:'ledger',name:'Ledger Key Ring',ready:false,detail:'Provision the ring and start the isolated broker.'},{id:'hedera',name:'Hedera · Blocky402',ready:false,detail:'Fund testnet accounts and configure the data service.'},{id:'circle',name:'Circle · Arc',ready:false,detail:'Authenticate a Circle testnet wallet in the broker environment.'}]};}
}
export function checkReport(report:Report){
 const records=report.evidence;
 return [
  {label:'Source coverage',passed:records.length>0&&new Set(records.map(x=>x.repo)).size===records.length,detail:`${records.length} distinct repository records are attached.`},
  {label:'Source attribution',passed:records.every(x=>x.sourceUrl===`https://api.github.com/repos/${x.repo}`),detail:'Every record points to its exact GitHub API source.'},
  {label:'Valid observed counts',passed:records.every(x=>[x.stars,x.forks,x.openIssues].every(n=>Number.isSafeInteger(n)&&n>=0)),detail:'Stars, forks and issue counts are non-negative integers.'},
  {label:'Observation timestamps',passed:records.every(x=>Number.isFinite(Date.parse(x.fetchedAt))&&Number.isFinite(Date.parse(x.pushedAt))),detail:'Each observation includes fetch and last-push timestamps.'}
 ];
}
