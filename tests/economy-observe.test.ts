import {describe,expect,it,vi} from 'vitest';
import {keccak256,toHex} from 'viem';
import {prepareObservation,executePreparedObservation,type ObservationChain} from '../scripts/economy-observe';

const hash=(n:string)=>`0x${n.padStart(64,'0')}` as `0x${string}`;
const seller='0x1111111111111111111111111111111111111111' as const;
const service={seller,category:1,unitHash:keccak256(toHex('compute-unit')),quantity:1n,unitPrice:1000n,endpointHash:hash('22'),blockNumber:100n,blockTimestamp:1000,transactionHash:hash('33')};
const chain:ObservationChain={finalizedBlock:vi.fn(async()=>({number:120n,timestamp:1200})),service:vi.fn(async()=>service)};
const input={protocol:'obolos.observation-input.v1' as const,operationName:'arpi-compute-1000-1200',asset:'USDC' as const,start:1000,end:1200,components:[{id:'compute-reference',category:'compute' as const,unit:'compute-unit',weightBps:'10000',baselineServiceHash:hash('44'),currentServiceHash:hash('44'),sourceReference:'registered Arc quote'}],previousObservation:null};

describe('economy observation operator',()=>{
 it('computes a fixed-basket ARPI and leaves unavailable economic values null',async()=>{
  const result=await prepareObservation(input,chain);
  expect(result.metrics.arpiBps).toBe('10000');
  expect(result.metrics.inflationBps).toBeNull();
  expect(result.metrics.gapAtomic).toBeNull();
  expect(result.metrics.moneyVelocityBps).toBeNull();
  expect(result.publicInputs.methodology).toBe('obolos-agentgdp-v2');
  expect(result.record.parameters[6]).toBe(keccak256(toHex('obolos-agentgdp-v2')));
  expect(result.quoteMeaning).toMatch(/selected registered quote/i);
  expect(result.record.parameters).toHaveLength(7);
 });
 it('requires like-for-like registered services and a closed window',async()=>{
  const mismatch:ObservationChain={...chain,service:vi.fn(async h=>({...service,endpointHash:h===hash('55')?hash('99'):service.endpointHash}))};
  await expect(prepareObservation({...input,components:[{...input.components[0],currentServiceHash:hash('55')}]},mismatch)).rejects.toThrow(/comparable/i);
  await expect(prepareObservation({...input,end:1201},chain)).rejects.toThrow(/closed/i);
 });
 it('only reports inflation for a contiguous observation with the same basket',async()=>{
  const first=await prepareObservation(input,chain);
  const previous={methodology:'obolos-agentgdp-v2' as const,asset:'USDC' as const,end:1000,basketIdentity:String(first.metrics.basketIdentity),arpiBps:'9000'};
  expect((await prepareObservation({...input,previousObservation:previous},chain)).metrics.inflationBps).toBe('1111');
  expect((await prepareObservation({...input,previousObservation:{...previous,end:999}},chain)).metrics.inflationBps).toBeNull();
  expect((await prepareObservation({...input,previousObservation:{...previous,methodology:'obolos-agentgdp-v1'}},chain)).metrics.inflationBps).toBeNull();
 });
 it('persists evidence before dispatch and then binds the confirmed event',async()=>{
  const prepared=await prepareObservation(input,chain);const order:string[]=[];
  const result=await executePreparedObservation(prepared,{persist:async()=>{order.push('persist')},dispatch:async()=>{order.push('dispatch');return {txHash:hash('77')}},confirm:async()=>({transactionHash:hash('77'),observationHash:hash('88')})});
  expect(order).toEqual(['persist','dispatch','persist']);expect(result.status).toBe('confirmed');
 });
});
