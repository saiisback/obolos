import {it,expect} from 'vitest';
import {assertMarketTransfer} from '../src/lib/market/chain';
const input={payer:'0x1111111111111111111111111111111111111111',recipient:'0x2222222222222222222222222222222222222222',amountAtomic:1000,createdAt:'2026-09-10T10:00:00Z',expiresAt:'2026-09-10T10:15:00Z'};
const proof={chainId:5042002,status:'success',timestamp:BigInt(Date.parse('2026-09-10T10:05:00Z')/1000),events:[{address:'0x3600000000000000000000000000000000000000',from:input.payer,to:input.recipient,value:1000n}]};
it('accepts only exact canonical transfer in order window',()=>expect(()=>assertMarketTransfer(proof,input)).not.toThrow());
it.each([{chainId:1},{status:'reverted'},{timestamp:0n},{events:[{...proof.events[0],value:1001n}]},{events:[{...proof.events[0],from:input.recipient}]},{events:[{...proof.events[0],to:input.payer}]},{events:[{...proof.events[0],address:input.payer}]}])('rejects incorrect proof %s',change=>expect(()=>assertMarketTransfer({...proof,...change},input)).toThrow());
it('accepts a transfer mined within the quote creation second',()=>expect(()=>assertMarketTransfer({...proof,timestamp:BigInt(Date.parse(input.createdAt)/1000)},{...input,createdAt:'2026-09-10T10:00:00.900Z'})).not.toThrow());
