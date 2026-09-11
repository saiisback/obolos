import { describe,expect,it } from 'vitest';
import { buildLiveOverview,safeServiceUrl } from '../src/lib/live-readiness';
import { createRun } from '../src/lib/engine';
import type { BrokerWallets } from '../src/lib/live-contracts';
const env={OPERATOR_TOKEN:'configured',LEDGER_CONTROLLER_ADDRESS:`0x${'12'.repeat(20)}`,DATA_SERVICE_URL:'https://service.example'};
const wallets:BrokerWallets={observedAt:'2026-09-07T10:00:00Z',wallets:[{id:'circle-agent',name:'Circle',network:'arc:testnet',asset:'USDC',decimals:6,address:`0x${'34'.repeat(20)}`,payTo:null,balanceAtomic:'9007199254740993000000',balanceStatus:'available',balanceSource:'arc-rpc',explorerUrl:null,detail:'Observed'}]};
describe('live readiness disclosure',()=>{
  it('never exposes wallet or deployment addresses to an unauthenticated browser',()=>{
    const value=buildLiveOverview({authenticated:false,env,runs:[],health:{ready:true,integrations:[]},wallets,serviceReachable:false});
    expect(value.wallets).toEqual([]);expect(value.controllerAddress).toBeNull();expect(value.serviceUrl).toBeNull();expect(value.liveEnabled).toBe(false);
  });
  it('preserves exact balances and does not turn missing reads into zero',()=>{
    const value=buildLiveOverview({authenticated:true,env,runs:[],health:{ready:true,integrations:[]},wallets,serviceReachable:true});
    expect(value.wallets[0].balanceAtomic).toBe('9007199254740993000000');
    expect(value.checks.find(c=>c.id==='funding-circle-agent')?.status).toBe('ready');
    expect(value.checks.find(c=>c.id==='funding-hedera-payer')?.status).toBe('action');
  });
  it('does not treat rehearsal or pending receipts as qualification evidence',()=>{
    const rehearsal={...createRun({mode:'live',repos:['vercel/next.js']}),mode:'rehearsal' as const};
    rehearsal.receipts=[{id:'x',requestId:'r',mode:'rehearsal',network:'arc:testnet',asset:'USDC',amountAtomic:1,units:1,provider:'v',status:'simulated',timestamp:new Date().toISOString()}];
    const value=buildLiveOverview({authenticated:true,env,runs:[rehearsal],health:{ready:true,integrations:[]},serviceReachable:true});
    expect(value.evidence).toEqual({liveRuns:0,hederaPayments:0,arcPayments:0,ledgerApprovals:0});
    expect(value.checks.find(c=>c.id==='payments')?.status).toBe('action');
  });
  it('rejects credential-bearing or insecure remote service URLs',()=>{
    for(const value of ['https://user:pass@example.com','https://example.com?key=secret','http://remote.example','javascript:alert(1)'])expect(safeServiceUrl(value)).toBeNull();
    expect(safeServiceUrl('http://127.0.0.1:4402')).toBe('http://127.0.0.1:4402');
  });
});
