import {describe,it,expect} from 'vitest';
import {receiptCost,providerUsage} from '../src/lib/economy/accounting-draft';
const hash=`0x${'a'.repeat(64)}`,seller=`0x${'1'.repeat(40)}`,ledger=`0x${'2'.repeat(40)}`;
const receipt={transactionHash:hash,from:seller,to:ledger,status:'success',blockNumber:10n,blockHash:hash,gasUsed:21000n,effectiveGasPrice:1000000001n};
describe('production cost observations',()=>{
 it('keeps native gas exact and rounds up once into six-decimal USDC',()=>{expect(receiptCost(receipt,{seller,ledger,transactionHash:hash,finalizedBlock:10n})).toMatchObject({nativeAtomic:'21000000021000',amountAtomic:'22',rounding:'ceil-to-micro-USDC'});});
 it.each([{from:ledger},{to:seller},{status:'reverted'},{blockNumber:11n},{transactionHash:`0x${'b'.repeat(64)}`},{gasUsed:-1n}])('rejects mismatched or nonfinal seller delivery receipts',patch=>{expect(()=>receiptCost({...receipt,...patch},{seller,ledger,transactionHash:hash,finalizedBlock:10n})).toThrow();});
 it('retains actual model usage without fabricating prices or missing cache usage',()=>{expect(providerUsage('inference',{model:'gpt-5-nano',promptTokens:12,completionTokens:8,requestId:'chatcmpl-actual'})).toEqual({model:'gpt-5-nano',promptTokens:12,completionTokens:8,requestId:'chatcmpl-actual',cachedPromptTokens:null,costAtomic:null});expect(providerUsage('compute',{})).toBeNull();});
});
