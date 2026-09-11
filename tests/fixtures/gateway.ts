import {randomUUID} from 'node:crypto';
import type {Provider,Receipt} from '../../src/lib/contracts';
import type {Gateway} from '../../src/lib/gateway';
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

/** Unit-test transport only; these receipts never enter the deployed bundle. */
export const liveFixtureGateway:Gateway={...rehearsalGateway,
 async purchaseData(input){const result=await rehearsalGateway.purchaseData(input);return {...result,receipt:{...result.receipt,mode:'live',status:'settled',transactionId:'unit-test-hedera'}};},
 async verify(input){const result=await rehearsalGateway.verify(input);return {...result,receipt:{...result.receipt,amountAtomic:input.maxAmountAtomic,mode:'live',status:'settled',transactionId:'unit-test-arc'},checks:[{label:'Fixture verification',passed:true,detail:'Unit test only'}]};}
};
