import {afterEach,describe,expect,it,vi} from 'vitest';
import {getBrokerWallets} from '../src/lib/integrations/wallets';
import type {BrokerSecrets} from '../src/lib/integrations/ledger';
const address='0x1111111111111111111111111111111111111111';
const recipient='0x2222222222222222222222222222222222222222';
const secret:BrokerSecrets={inferenceApiKey:'never-return-inference',hedera:{accountId:'0.0.123',privateKey:'never-return-key',keyType:'der'}};
const env={CIRCLE_WALLET_ADDRESS:address,ARC_VERIFIER_ADDRESS:recipient,HEDERA_PAY_TO:'0.0.456'};
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
describe('read-only wallet snapshots',()=>{
  it('returns unconfigured unknown balances without touching the network',async()=>{
    const transport=vi.fn();vi.stubGlobal('fetch',transport);
    const result=await getBrokerWallets({});
    expect(result.wallets.map(w=>[w.balanceStatus,w.balanceAtomic,w.address])).toEqual([['unconfigured',null,null],['unconfigured',null,null]]);
    expect(transport).not.toHaveBeenCalled();
  });
  it('preserves exact atomic precision and uses the six-decimal USDC contract rather than native balance',async()=>{
    const calls:{url:string;method?:string;params?:unknown[]}[]=[];
    vi.stubGlobal('fetch',vi.fn(async(url:string,options?:RequestInit)=>{
      if(url.startsWith('https://testnet.mirrornode.hedera.com/'))return new Response('{"account":"0.0.123","balance":{"balance":9007199254740993}}');
      const body=JSON.parse(String(options?.body));calls.push({url,...body});
      return Response.json({jsonrpc:'2.0',id:body.id,result:body.method==='eth_chainId'?'0x4cef52':body.params[0].data==='0x313ce567'?'0x'+(6n).toString(16).padStart(64,'0'):'0x'+(9007199254740995n).toString(16).padStart(64,'0')});
    }));
    const result=await getBrokerWallets({...env,ARC_RPC_URL:'https://rpc.testnet.arc.network'},secret);
    expect(result.wallets.map(w=>w.balanceAtomic)).toEqual(['9007199254740993','9007199254740995']);
    expect(result.wallets[1]).toMatchObject({decimals:6,balanceStatus:'available',explorerUrl:`https://testnet.arcscan.app/address/${address}`,payTo:recipient});
    expect(calls.every(c=>c.url==='https://rpc.testnet.arc.io')).toBe(true);
    expect(calls.find(c=>c.method==='eth_call'&&(c.params?.[0] as {data:string})?.data.startsWith('0x70a08231'))?.params).toEqual([{to:'0x3600000000000000000000000000000000000000',data:'0x70a08231'+address.slice(2).padStart(64,'0')},'latest']);
    expect(JSON.stringify(result)).not.toMatch(/never-return/);
  });
  it.each(['wrong chain','wrong decimals','malformed','rpc failure'])('reports unknown instead of zero on %s',async failure=>{
    vi.stubGlobal('fetch',vi.fn(async(url:string,options?:RequestInit)=>{
      if(url.includes('mirrornode'))throw new Error('never-return-key');
      const body=JSON.parse(String(options?.body));
      if(failure==='rpc failure')return Response.json({error:{message:'never-return-key'},id:body.id,jsonrpc:'2.0'});
      const result=body.method==='eth_chainId'?(failure==='wrong chain'?'0x1':'0x4cef52'):failure==='malformed'?'oops':'0x'+(18n).toString(16).padStart(64,'0');
      return Response.json({id:body.id,jsonrpc:'2.0',result});
    }));
    const result=await getBrokerWallets(env,secret);
    expect(result.wallets).toHaveLength(2);
    expect(result.wallets.every(w=>w.balanceStatus==='unavailable'&&w.balanceAtomic===null)).toBe(true);
    expect(JSON.stringify(result)).not.toContain('never-return');
  });
  it('does not put invalid identifiers into RPC requests or explorer links',async()=>{
    const transport=vi.fn();vi.stubGlobal('fetch',transport);
    const result=await getBrokerWallets({...env,CIRCLE_WALLET_ADDRESS:'https://evil.test',HEDERA_PAY_TO:'0.0.1?secret',ARC_VERIFIER_ADDRESS:'bad'}, {...secret,hedera:{...secret.hedera,accountId:'../secrets'}});
    expect(result.wallets).toHaveLength(2);
    expect(result.wallets.every(w=>w.address===null&&w.explorerUrl===null&&w.payTo===null)).toBe(true);
    expect(transport).not.toHaveBeenCalled();
  });
  it('rejects a configured noncanonical Arc RPC instead of sending wallet data there',async()=>{
    const transport=vi.fn();vi.stubGlobal('fetch',transport);
    const result=await getBrokerWallets({...env,ARC_RPC_URL:'https://evil.test/rpc'});
    expect(result.wallets[1]).toMatchObject({balanceStatus:'unavailable',balanceAtomic:null});
    expect(transport).not.toHaveBeenCalled();
  });
});

it('authenticates the broker wallet endpoint before decrypting and exposes no secret material',async()=>{
  const ledger=await import('../src/lib/integrations/ledger');
  const {createBrokerApp}=await import('../services/broker');
  const decrypt=vi.spyOn(ledger,'decryptBrokerSecrets').mockResolvedValue(secret);
  const localFetch=globalThis.fetch;
  vi.stubGlobal('fetch',vi.fn(async()=>{throw Error('never-return-key');}));
  const token='a'.repeat(32);
  const app=createBrokerApp({env:{...env,BROKER_TOKEN:token}});
  const server=app.listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>server.once('listening',resolve));
  const url=`http://127.0.0.1:${(server.address() as {port:number}).port}/wallets`;
  try{
    expect((await localFetch(url)).status).toBe(401);
    expect(decrypt).not.toHaveBeenCalled();
    const response=await localFetch(url,{headers:{Authorization:`Bearer ${token}`}});
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body=await response.json();
    expect(body.wallets).toHaveLength(2);
    expect(body.wallets[0]).toMatchObject({address:'0.0.123',balanceAtomic:null,balanceStatus:'unavailable'});
    expect(JSON.stringify(body)).not.toContain('never-return');
  }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});
