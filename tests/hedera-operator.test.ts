import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {mkdtemp,readFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {AccountBalanceQuery,Hbar,PrivateKey,Transaction} from '@hiero-ledger/sdk';
import {proto} from '@hiero-ledger/proto';
import {scheduleMemo,type SchedulePlan} from '../src/lib/hedera/commerce';

const mocks=vi.hoisted(()=>({durable:vi.fn(),sql:vi.fn()}));
vi.mock('../scripts/hedera-register',()=>({executeDurableHcsOperation:mocks.durable}));
vi.mock('../src/lib/platform/db',()=>({sql:()=>mocks.sql}));
import {createPaymentSchedules,privateWrite,provisionTestCredits} from '../scripts/hedera-commerce';

type Intent={transactionId:string;signedBytes:string};
type Captured={file:string;body:proto.TransactionBody;intent:Intent};
let directory:string,captured:Captured[];
const credentials={accountId:'0.0.123',privateKey:PrivateKey.generateED25519().toStringDer()};
function plan():SchedulePlan{return {id:'f32a1f26-a784-4c8e-87b2-59e6dca214a3',payer:credentials.accountId,payTo:'0.0.456',repos:['octocat/Hello-World','vercel/next.js'],unitPriceAtomic:100000,count:2,intervalSeconds:30,firstExecutionAt:new Date(Math.ceil((Date.now()+120000)/1000)*1000).toISOString(),maxTotalAtomic:400000};}
function decode(bytes:string):proto.TransactionBody {
 const list=proto.TransactionList.decode(Buffer.from(bytes,'base64'));
 const signed=proto.SignedTransaction.decode(list.transactionList[0].signedTransactionBytes!);
 expect(signed.sigMap?.sigPair?.length).toBeGreaterThan(0);
 return proto.TransactionBody.decode(signed.bodyBytes);
}
function account(id:proto.IAccountID|undefined|null){return `0.0.${id?.accountNum?.toString()}`;}
const failedTokenId='0.0.123@1789238131.788715881',failedMirrorId='0.0.123-1789238131-788715881';
async function seedFailedToken(){await privateWrite(path.join(directory,'token.json'),{transactionId:failedTokenId,signedBytes:'retained-original-signed-intent'});return readFile(path.join(directory,'token.json'),'utf8');}
function originalFailureResponse(result='INSUFFICIENT_TX_FEE',entity_id:string|null=null,transaction_id=failedMirrorId){return Response.json({transactions:[{transaction_id,result,entity_id}]});}
function mockOriginalFailure(response:()=>Response){vi.mocked(fetch).mockImplementation(async(url,options)=>{expect(String(url)).toBe(`https://testnet.mirrornode.hedera.com/api/v1/transactions/${failedMirrorId}`);expect(options?.redirect).toBe('error');return response();});}
beforeEach(async()=>{
 directory=await mkdtemp(path.join(tmpdir(),'obolos-hedera-operator-'));captured=[];mocks.sql.mockReset();mocks.sql.mockResolvedValue([]);mocks.durable.mockReset();
 vi.stubEnv('HEDERA_PAY_TO','0.0.456');
 vi.stubGlobal('fetch',vi.fn(async()=>{throw Error('No network dispatch is allowed in operator body tests.');}));
 vi.spyOn(Transaction.prototype,'execute').mockImplementation(async()=>{throw Error('Funding dispatch forbidden in operator body tests.');});
 vi.spyOn(AccountBalanceQuery.prototype,'execute').mockResolvedValue({hbars:new Hbar(20)} as never);
 const real=await vi.importActual<typeof import('../scripts/hedera-register')>('../scripts/hedera-register');
 mocks.durable.mockImplementation(async(file:string,fingerprint:string,prepare:()=>Promise<Intent>)=>{
  const proof=(intent:Intent)=>({transactionId:intent.transactionId,entityId:file.endsWith('recipient.json')?'0.0.900':file.endsWith('token.json')?'0.0.901':file.endsWith('schedule-0.json')?'0.0.902':'0.0.903',...(file.includes('schedule-')?{scheduledTransactionId:intent.transactionId+'?scheduled'}:{})});
  return real.executeDurableHcsOperation(file,fingerprint,async()=>{
   if(file.includes('schedule-'))expect(JSON.parse(await readFile(path.join(directory,'schedule-plan.json'),'utf8')).payer).toBe(credentials.accountId);
   const intent=await prepare();captured.push({file,body:decode(intent.signedBytes),intent});return intent;
  },async intent=>{
   expect(JSON.parse(await readFile(file,'utf8')).transactionId).toBe(intent.transactionId);
   return proof(intent);
  },async intent=>proof(intent));
 });
});
afterEach(async()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();await rm(directory,{recursive:true,force:true});});

describe('private Hedera operator SDK transaction boundaries',()=>{
 it('signs exactly the finite authorized schedule after persisting its plan, with exact memos, expiry and fee limits',async()=>{
  const p=plan();const result=await createPaymentSchedules(p,credentials,directory);expect(result.schedules).toHaveLength(p.count);expect(captured).toHaveLength(p.count);
  for(const [round,{body}] of captured.entries()){
   expect(body.transactionFee.toString()).toBe('100000000');expect(body.transactionValidDuration?.seconds?.toString()).toBe('120');
   const schedule=body.scheduleCreate!;expect(schedule.waitForExpiry).toBe(true);expect(account(schedule.payerAccountID)).toBe(p.payer);expect(schedule.adminKey?.ed25519?.length).toBe(32);
   const due=Date.parse(p.firstExecutionAt)/1000+round*p.intervalSeconds;expect(schedule.expirationTime?.seconds?.toString()).toBe(String(due));expect(schedule.expirationTime?.nanos??0).toBe(0);
   const memo=scheduleMemo(p,round),transfer=schedule.scheduledTransactionBody!;expect(schedule.memo).toBe(memo);expect(transfer.memo).toBe(memo);expect(transfer.transactionFee?.toString()).toBe('100000000');
   expect(transfer.cryptoTransfer?.tokenTransfers?.length??0).toBe(0);expect(transfer.cryptoTransfer?.transfers?.accountAmounts?.map(row=>({account:account(row.accountID),amount:row.amount?.toString()}))).toEqual([{account:p.payer,amount:'-200000'},{account:p.payTo,amount:'200000'}]);
  }
  expect((await stat(path.join(directory,'schedule-plan.json'))).mode&0o777).toBe(0o600);
  expect(Transaction.prototype.execute).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();expect(mocks.sql).not.toHaveBeenCalled();
 });
 it('refuses changed payer, recipient, caps and expired deadlines before any SDK signing or dispatch',async()=>{
  const p=plan();for(const change of [{payer:'0.0.999'},{payTo:'0.0.999'},{count:11},{maxTotalAtomic:399999},{firstExecutionAt:'2020-01-01T00:00:00.000Z'}])await expect(createPaymentSchedules({...p,...change},credentials,directory)).rejects.toThrow();
  expect(captured).toHaveLength(0);expect(mocks.durable).not.toHaveBeenCalled();expect(Transaction.prototype.execute).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
 });
 it('recovers the same schedule identities without replacement signing and refuses altered persistent authority',async()=>{
  const p=plan();const first=await createPaymentSchedules(p,credentials,directory);vi.spyOn(Date,'now').mockReturnValue(Date.parse(p.firstExecutionAt)+120000);const second=await createPaymentSchedules(p,credentials,directory);expect(second).toEqual(first);expect(captured).toHaveLength(p.count);
  await expect(createPaymentSchedules({...p,unitPriceAtomic:1},credentials,directory)).rejects.toThrow(/different terms/);expect(captured).toHaveLength(p.count);expect(Transaction.prototype.execute).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
 });
 it('creates only fixed-supply test credits and the bounded auto-associating service account, without live funding',async()=>{
  const result=await provisionTestCredits(credentials,directory);expect(result.config).toMatchObject({asset:'0.0.901',payTo:'0.0.900',decimals:0,unitPriceAtomic:1,network:'hedera:testnet'});expect(captured).toHaveLength(2);
  const accountBody=captured[0].body;expect(accountBody.transactionFee.toString()).toBe('100000000');expect(accountBody.cryptoCreateAccount?.initialBalance?.toString()).toBe('100000000');expect(accountBody.cryptoCreateAccount?.maxAutomaticTokenAssociations).toBe(2);
  const tokenBody=captured[1].body,token=tokenBody.tokenCreation!;expect(tokenBody.transactionFee.toString()).toBe('1000000000');expect(token.decimals).toBe(0);expect(token.initialSupply?.toString()).toBe('1000');expect(token.maxSupply?.toString()).toBe('1000');expect(token.supplyType).toBe(proto.TokenSupplyType.FINITE);expect(token.tokenType).toBe(proto.TokenType.FUNGIBLE_COMMON);expect(account(token.treasury)).toBe(credentials.accountId);expect(token.supplyKey).toBeNull();expect(token.customFees?.length??0).toBe(0);
  expect(JSON.parse(await readFile(path.join(directory,'token-public.json'),'utf8'))).not.toHaveProperty('privateKey');expect((await stat(path.join(directory,'service-recipient-private.json'))).mode&0o777).toBe(0o600);
  vi.mocked(AccountBalanceQuery.prototype.execute).mockResolvedValue({hbars:new Hbar(0)} as never);await provisionTestCredits(credentials,directory);expect(captured).toHaveLength(2);expect(Transaction.prototype.execute).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
 });
 it('refuses insufficient balance before provisioning any new recipient or token',async()=>{
  vi.mocked(AccountBalanceQuery.prototype.execute).mockResolvedValue({hbars:new Hbar(1)} as never);await expect(provisionTestCredits(credentials,directory)).rejects.toThrow(/Insufficient/);expect(captured).toHaveLength(0);expect(mocks.durable).not.toHaveBeenCalled();expect(Transaction.prototype.execute).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
 });
 it.each([
  ['unavailable mirror',()=>new Response(null,{status:404})],
  ['successful original creation',()=>originalFailureResponse('SUCCESS','0.0.901')],
  ['uncertain original result',()=>originalFailureResponse('UNKNOWN')],
  ['failure with a created entity',()=>originalFailureResponse('INSUFFICIENT_TX_FEE','0.0.901')],
  ['failure for another identity',()=>originalFailureResponse('INSUFFICIENT_TX_FEE',null,'0.0.123-1789238132-788715881')],
  ['missing original result',()=>Response.json({transactions:[]})],
 ])('refuses the raised token fee when there is %s before replacement signing',async(_label,response)=>{
  const original=await seedFailedToken();mockOriginalFailure(response);vi.mocked(AccountBalanceQuery.prototype.execute).mockResolvedValue({hbars:new Hbar(100)} as never);
  await expect(provisionTestCredits(credentials,directory,true)).rejects.toThrow(/failure|insufficient-fee/);
  expect(await readFile(path.join(directory,'token.json'),'utf8')).toBe(original);expect(captured).toHaveLength(0);expect(mocks.durable).not.toHaveBeenCalled();expect(Transaction.prototype.execute).not.toHaveBeenCalled();expect(mocks.sql).not.toHaveBeenCalled();
 });
 it('requires the exact remaining 52 HBAR bound before signing an explicit fee retry',async()=>{
  await seedFailedToken();mockOriginalFailure(()=>originalFailureResponse());vi.mocked(AccountBalanceQuery.prototype.execute).mockResolvedValue({hbars:Hbar.fromTinybars(5199999999)} as never);
  await expect(provisionTestCredits(credentials,directory,true)).rejects.toThrow(/Insufficient/);expect(captured).toHaveLength(0);expect(mocks.durable).not.toHaveBeenCalled();expect(Transaction.prototype.execute).not.toHaveBeenCalled();
 });
 it('preserves the failed intent, caps the explicit retry at 50 HBAR and recovers the same retry without signing another',async()=>{
  const original=await seedFailedToken();mockOriginalFailure(()=>originalFailureResponse());vi.mocked(AccountBalanceQuery.prototype.execute).mockResolvedValue({hbars:new Hbar(52)} as never);
  const first=await provisionTestCredits(credentials,directory,true);expect(captured).toHaveLength(2);const retry=captured.find(row=>row.file.endsWith('token-fee-retry.json'))!;
  expect(retry.intent.transactionId).not.toBe(failedTokenId);expect(retry.body.transactionFee.toString()).toBe('5000000000');expect(retry.body.tokenCreation).toMatchObject({decimals:0,supplyType:proto.TokenSupplyType.FINITE,tokenType:proto.TokenType.FUNGIBLE_COMMON});expect(retry.body.tokenCreation?.initialSupply?.toString()).toBe('1000');expect(retry.body.tokenCreation?.maxSupply?.toString()).toBe('1000');expect(retry.body.tokenCreation?.supplyKey).toBeNull();expect(retry.body.tokenCreation?.customFees?.length??0).toBe(0);
  const journal=await readFile(retry.file,'utf8');expect(JSON.parse(journal).transactionId).toBe(retry.intent.transactionId);expect(await readFile(path.join(directory,'token.json'),'utf8')).toBe(original);
  vi.mocked(AccountBalanceQuery.prototype.execute).mockResolvedValue({hbars:new Hbar(0)} as never);expect(await provisionTestCredits(credentials,directory,true)).toEqual(first);expect(captured).toHaveLength(2);expect(await readFile(retry.file,'utf8')).toBe(journal);expect(await readFile(path.join(directory,'token.json'),'utf8')).toBe(original);expect(Transaction.prototype.execute).not.toHaveBeenCalled();
 });
});
