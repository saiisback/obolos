import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DurablePayments, createBrokerApp } from '../services/broker';
import { assertCircleTransfer, circleTransferArgs, purchaseCircleVerification } from '../src/lib/integrations/circle';
import { approvalMessage } from '../scripts/ledger-approve';
import { decryptBrokerSecrets } from '../src/lib/integrations/ledger';
import * as ledger from '../src/lib/integrations/ledger';

const dirs: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(dirs.splice(0).map(p => rm(p, {recursive:true,force:true}))); });
async function journal() { const d=await mkdtemp(join(tmpdir(),'broker-test-')); dirs.push(d); return new DurablePayments(join(d,'journal.json')); }
describe('broker security boundary', () => {
  it('persists completed results, rejects changed payloads, and reserves uncertain sends across restart', async () => {
    const j=await journal(); let sends=0;
    const op=()=>j.execute('one','run-a','data',{amount:4},4,10,async()=>({id:++sends}));
    expect(await op()).toEqual({id:1}); expect(await op()).toEqual({id:1});
    await expect(j.execute('one','run-a','data',{amount:5},5,10,async()=>({id:++sends}))).rejects.toThrow('different');
    await expect(j.execute('two','run-b','data',{amount:4},4,10,async()=>{sends++; throw new Error('secret');})).rejects.toThrow('uncertain');
    const restarted=new DurablePayments(j.path);
    await expect(restarted.execute('two','run-b','data',{amount:4},4,10,async()=>({id:++sends}))).rejects.toThrow('uncertain');
    await expect(restarted.execute('three','run-c','data',{amount:4},4,10,async()=>({id:++sends}))).rejects.toThrow('budget');
    expect(sends).toBe(2);
  });
  it('refuses to attach the same chain transaction to two jobs',async()=>{
    const j=await journal();
    const receipt={network:'arc:testnet',transactionId:'same-real-chain-tx'};
    await j.execute('receipt-a','run-a','verify',{},1,10,async()=>({receipt}));
    await expect(j.execute('receipt-b','run-b','verify',{},1,10,async()=>({receipt}))).rejects.toThrow('uncertain');
  });
  it('signs exact live approval text and refuses rehearsal labels',()=>{
    const message='Obolos mandate authorization\nMode: live\nNew mandate: {"dataBudgetAtomic":100}';
    expect(approvalMessage({message})).toBe(message);
    expect(()=>approvalMessage({message:message.replace('live','rehearsal')})).toThrow();
  });
  it('serializes competing payments and prevents duplicate stage under a new request id',async()=>{
    const j=await journal();
    const result=await Promise.allSettled([j.execute('a','r','data',{},7,10,async()=>1),j.execute('b','r','data',{},7,10,async()=>2)]);
    expect(result.filter(x=>x.status==='fulfilled')).toHaveLength(1);
  });
  it('requires authentication even for health and redacts missing configuration',async()=>{
    const app=createBrokerApp({env:{BROKER_TOKEN:'a'.repeat(32)}});
    const server=app.listen(0,'127.0.0.1'); await new Promise<void>(r=>server.once('listening',r));
    try {
      const addr=server.address(); if(!addr||typeof addr==='string') throw Error('address');
      const url=`http://127.0.0.1:${addr.port}/health`;
      expect((await fetch(url)).status).toBe(401);
      const response=await fetch(url,{headers:{Authorization:`Bearer ${'a'.repeat(32)}`}});
      expect((await response.json()).ready).toBe(false);
      const bad=await fetch(url.replace('/health','/data'),{method:'POST',headers:{Authorization:`Bearer ${'a'.repeat(32)}`,'Content-Type':'application/json'},body:JSON.stringify({runId:'run',requestId:'request',repos:['owner/repo'],providerId:'primary',maxAmountAtomic:1,unitPriceAtomic:1,url:'https://evil.example'})});
      expect(bad.status).toBe(400);
      expect(await bad.json()).toEqual({error:'Invalid broker request.'});
      const stage=await fetch(url.replace('/health','/data'),{method:'POST',headers:{Authorization:`Bearer ${'a'.repeat(32)}`,'Content-Type':'application/json'},body:JSON.stringify({runId:'run',requestId:'run:data',mandateExpiresAt:'2099-01-01T00:00:00.000Z',repos:['owner/repo'],providerId:'primary',maxAmountAtomic:1,unitPriceAtomic:1})});
      expect(stage.status).toBe(409);
      expect((await stage.json()).error).toContain('Provider');
    } finally {await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
  });
  it('decrypts with an argument array and never leaks CLI failures',async()=>{
    const run=vi.fn().mockRejectedValue(new Error('private-key-must-not-leak'));
    await expect(decryptBrokerSecrets({LEDGER_RING_FILE:'/private/bundle.enc',LEDGER_RING_KEY:'obolos',WALLET_PASS:'secret'},run)).rejects.toThrow('Key Ring unavailable');
    expect(run.mock.calls[0][1]).toEqual(['ring','decrypt','-i','/private/bundle.enc','--key','obolos']);
    expect(run.mock.calls[0][2].shell).toBe(false);
  });
});
const sender='0x1111111111111111111111111111111111111111';
const recipient='0x2222222222222222222222222222222222222222';
const token='0x3600000000000000000000000000000000000000';
describe('Arc settlement',()=>{
  it('uses fixed Arc chain and exact decimal amount without shell text',()=>{
    expect(circleTransferArgs({sender,recipient,amountAtomic:10001})).toEqual(['wallet','transfer',recipient,'--amount','0.010001','--address',sender,'--chain','ARC-TESTNET','--token',token,'--output','json']);
  });
  it('requires an actual successful USDC Transfer event with exact sender, recipient and amount',()=>{
    const event={address:token,from:sender,to:recipient,value:10000n};
    expect(()=>assertCircleTransfer({chainId:5042002,status:'success',events:[event]}, {sender,recipient,amountAtomic:10000})).not.toThrow();
    for(const invalid of [{chainId:1},{status:'reverted'},{events:[{...event,to:sender}]},{events:[{...event,value:10001n}]}]){
      expect(()=>assertCircleTransfer({chainId:5042002,status:'success',events:[event],...invalid},{sender,recipient,amountAtomic:10000})).toThrow();
    }
  });
});

const sourceEvidence={repo:'owner/repo',description:'example',stars:1,forks:1,openIssues:0,pushedAt:'2030-01-01T00:00:00.000Z',language:'TS',license:'MIT',sourceUrl:'https://api.github.com/repos/owner/repo',fetchedAt:'2030-01-01T00:00:00.000Z'};
const sourceReport={title:'Comparison',summary:'owner/repo',recommendation:'Inspect',evidence:[sourceEvidence],generatedBy:'model',createdAt:'2030-01-01T00:00:00.000Z',checks:[],verified:false};
async function withBroker(env:Record<string,string>,action:(url:string)=>Promise<void>){
  const app=createBrokerApp({env:{BROKER_TOKEN:'a'.repeat(32),...env}});
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
  try {const addr=server.address();if(!addr||typeof addr==='string')throw Error('address');await action(`http://127.0.0.1:${addr.port}`);}
  finally {await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
}
function post(url:string,body:unknown){return fetch(url,{method:'POST',headers:{Authorization:`Bearer ${'a'.repeat(32)}`,'Content-Type':'application/json'},body:JSON.stringify(body)});}
describe('mandate validity at financial submission',()=>{
  it('does not invoke a queued payment when its mandate expires behind another operation',async()=>{
    const j=await journal();let now=Date.parse('2030-01-01T00:00:00Z');vi.spyOn(Date,'now').mockImplementation(()=>now);
    let release!:()=>void;let started!:()=>void;
    const began=new Promise<void>(r=>{started=r;});const gate=new Promise<void>(r=>{release=r;});
    const first=j.execute('first','first','data',{},1,10,async()=>{started();await gate;return 1;});
    await began;
    let sends=0;
    const second=j.execute('second','second','data',{},1,10,async()=>{sends++;return 2;},'2030-01-01T00:00:01Z');
    const rejected=expect(second).rejects.toThrow('expired');now+=2000;release();await first;await rejected;expect(sends).toBe(0);
  });
  it('rejects expired data and verification requests before loading credentials',async()=>{
    const decrypt=vi.spyOn(ledger,'decryptBrokerSecrets').mockRejectedValue(Error('should not load'));
    await withBroker({},async url=>{
      const expires='2000-01-01T00:00:00.000Z';
      const data=await post(url+'/data',{runId:'run',requestId:'run:data',mandateExpiresAt:expires,repos:['owner/repo'],providerId:'primary',maxAmountAtomic:1,unitPriceAtomic:1});
      expect(data.status).toBe(409);expect((await data.json()).error).toContain('expired');
      const verify=await post(url+'/verify',{runId:'run',requestId:'run:verify',mandateExpiresAt:expires,maxAmountAtomic:50000,report:sourceReport});
      expect(verify.status).toBe(409);expect((await verify.json()).error).toContain('expired');
    });expect(decrypt).not.toHaveBeenCalled();
  });
  it('refuses a lower configured verification fee before any spending or credential load',async()=>{
    const decrypt=vi.spyOn(ledger,'decryptBrokerSecrets').mockRejectedValue(Error('should not load'));
    await withBroker({ARC_VERIFICATION_FEE_ATOMIC:'49999'},async url=>{
      const response=await post(url+'/verify',{runId:'run',requestId:'run:verify',mandateExpiresAt:'2099-01-01T00:00:00.000Z',maxAmountAtomic:50000,report:sourceReport});
      expect(response.status).toBe(409);expect((await response.json()).error).toContain('50000');
    });expect(decrypt).not.toHaveBeenCalled();
  });
  it('reports Circle unavailable for a noncontract fee even with valid credentials and wallet',async()=>{
    vi.spyOn(ledger,'decryptBrokerSecrets').mockResolvedValue({inferenceApiKey:'test',hedera:{accountId:'0.0.123',privateKey:'test',keyType:'der'}});
    const cli=vi.spyOn(ledger,'runFile').mockResolvedValue({stdout:JSON.stringify({data:{wallets:[{type:'agent',blockchain:'ARC-TESTNET',address:sender}]}}),stderr:''});
    await withBroker({CIRCLE_WALLET_ADDRESS:sender,CIRCLE_CLI_HOME:'/private/session',ARC_VERIFIER_ADDRESS:recipient,BROKER_MAX_USDC_ATOMIC:'100000',ARC_VERIFICATION_FEE_ATOMIC:'49999'},async url=>{
      const response=await fetch(url+'/health',{headers:{Authorization:`Bearer ${'a'.repeat(32)}`}});const body=await response.json();
      expect(body.integrations.find((i:{id:string})=>i.id==='circle').ready).toBe(false);
    });expect(cli).not.toHaveBeenCalled();
  });
  it('never launches a transfer if the mandate expires during Circle wallet preflight',async()=>{
    let now=Date.parse('2030-01-01T00:00:00Z');vi.spyOn(Date,'now').mockImplementation(()=>now);
    const commands:string[][]=[];
    vi.spyOn(ledger,'runFile').mockImplementation((_file,args)=>{
      commands.push(args as string[]);now+=2000;
      return Object.assign(Promise.resolve({stdout:JSON.stringify({data:{wallets:[{type:'agent',blockchain:'ARC-TESTNET',address:sender}]}}),stderr:''}),{child:new ChildProcess()});
    });
    await expect(purchaseCircleVerification({runId:'run',requestId:'run:verify',amountAtomic:50000,mandateExpiresAt:'2030-01-01T00:00:01Z'},{CIRCLE_WALLET_ADDRESS:sender,CIRCLE_CLI_HOME:'/private/session',ARC_VERIFIER_ADDRESS:recipient})).rejects.toThrow();
    expect(commands).toHaveLength(1);expect(commands[0].slice(0,2)).toEqual(['wallet','list']);
  });
});

describe('report model compatibility',()=>{
  it.each(['gpt-5-nano','gpt-4.1-mini'])('generates a report with compatible bounded parameters for %s',async model=>{
    const j=await journal();
    await j.execute('input-data','report-check','data',{},1,10,async()=>({evidence:[sourceEvidence]}));
    vi.spyOn(ledger,'decryptBrokerSecrets').mockResolvedValue({inferenceApiKey:'test-only',hedera:{accountId:'0.0.123',privateKey:'test-only',keyType:'der'}});
    const realFetch=globalThis.fetch;
    let modelCalls=0;
    vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{
      if(String(input)==='https://api.openai.com/v1/chat/completions'){
        modelCalls++;
        const body=JSON.parse(String(init?.body));
        if(model==='gpt-5-nano'&&('max_tokens' in body||body.max_completion_tokens!==1000||body.reasoning_effort!=='minimal')){
          return new Response(JSON.stringify({error:{code:'unsupported_parameter'}}),{status:400});
        }
        if(model==='gpt-4.1-mini')expect(body.max_tokens).toBe(1000);
        expect(body.model).toBe(model);
        expect(body.response_format.json_schema.strict).toBe(true);
        return Response.json({choices:[{message:{content:JSON.stringify({analysis:'Evidence-based qualitative report.',repositories:[{repo:'owner/repo',stars:sourceEvidence.stars,forks:sourceEvidence.forks,openIssues:sourceEvidence.openIssues}]})}}]});
      }
      return realFetch(input,init);
    });
    await withBroker({BROKER_DATA_DIR:join(j.path,'..'),INFERENCE_MODEL:model,INFERENCE_BASE_URL:'https://api.openai.com/v1'},async url=>{
      const response=await post(url+'/report',{runId:'report-check',evidence:[sourceEvidence]});
      expect(response.status).toBe(200);
      const result=await response.json(); expect(result.summary).toContain('Evidence-based qualitative report.'); expect(result.summary).toContain(`owner/repo | stars=${sourceEvidence.stars} | forks=${sourceEvidence.forks} | openIssues=${sourceEvidence.openIssues}`);
    });
    expect(modelCalls).toBe(1);
  });
});
