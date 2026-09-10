import {describe,expect,it,vi} from 'vitest';
import {runExampleProvider} from '../src/lib/market/example-provider';
import {reportDigest} from '../src/lib/market/digest';
const now='2026-09-10T00:00:00Z';
const report={title:'Report',summary:'owner/repo | stars=1 | forks=2 | openIssues=3',recommendation:'Observe.',generatedBy:'model' as const,createdAt:now,checks:[],verified:false,evidence:[{repo:'owner/repo',description:'',stars:1,forks:2,openIssues:3,pushedAt:now,language:'TypeScript',license:'MIT',sourceUrl:'https://api.github.com/repos/owner/repo',fetchedAt:now}]};
const order={id:'11111111-1111-4111-8111-111111111111',serviceId:'22222222-2222-4222-8222-222222222222',revision:1,recipient:`0x${'1'.repeat(40)}`,amountAtomic:1000,transactionHash:`0x${'a'.repeat(64)}`,reportDigest:reportDigest(report),receiptUrl:'http://127.0.0.1/private'};
const expected={serviceId:order.serviceId,recipient:order.recipient};
const receipt={...order,status:'paid',chainConfirmed:true,timestamp:String(Date.parse(now)/1000)};
describe('example external provider',()=>{
 it('uses only an order ID lookup and computes checks for the paid report',async()=>{const lookup=vi.fn(async()=>receipt);const result=await runExampleProvider({protocol:'obolos.verifier.v1',order,report},lookup,expected);expect(lookup).toHaveBeenCalledExactlyOnceWith(order.id);expect(result.checks.every(c=>c.passed)).toBe(true);});
 it('rejects unpaid requests and tampered reports',async()=>{await expect(runExampleProvider({protocol:'obolos.verifier.v1',order,report},async()=>({...receipt,status:'quoted',chainConfirmed:false}),expected)).rejects.toMatchObject({code:'PAID_REQUEST_REQUIRED'});await expect(runExampleProvider({protocol:'obolos.verifier.v1',order,report:{...report,summary:'Changed'}},async()=>receipt,expected)).rejects.toMatchObject({code:'PAID_REQUEST_REQUIRED'});});
 it('rejects a real payment to another seller even if its order matches',async()=>{await expect(runExampleProvider({protocol:'obolos.verifier.v1',order,report},async()=>receipt,{...expected,recipient:`0x${'2'.repeat(40)}`})).rejects.toMatchObject({code:'PAID_REQUEST_REQUIRED'});});
 it('does not accept a different recipient, amount or transaction',async()=>{for(const patch of [{amountAtomic:2000},{recipient:`0x${'2'.repeat(40)}`},{transactionHash:`0x${'b'.repeat(64)}`}])await expect(runExampleProvider({protocol:'obolos.verifier.v1',order,report},async()=>({...receipt,...patch}),expected)).rejects.toMatchObject({code:'PAID_REQUEST_REQUIRED'});});
});
