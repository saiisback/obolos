import {it,expect} from 'vitest';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {executeDurableHcsOperation} from '../scripts/hedera-register';
it('records identity before dispatch and never resubmits an uncertain operation',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'hcs-journal-')),file=path.join(dir,'intent.json');
 try{
  await expect(executeDurableHcsOperation(file,'terms',async()=>({transactionId:'0.0.123@1789190000.000000001',signedBytes:'private-signed-transaction'}),async intent=>{
   expect(JSON.parse(await readFile(file,'utf8')).transactionId).toBe(intent.transactionId);
   throw Error('transport timeout');
  },async()=>{throw Error('mirror not yet available');})).rejects.toThrow('transport timeout');
  const stored=JSON.parse(await readFile(file,'utf8'));expect(stored.signedBytes).toBe('private-signed-transaction');
  const recovered=await executeDurableHcsOperation(file,'terms',async()=>{throw Error('replacement signing forbidden');},async()=>{throw Error('second dispatch forbidden');},async intent=>({transactionId:intent.transactionId,confirmed:true}));
  expect(recovered).toEqual({transactionId:stored.transactionId,confirmed:true});
  await expect(executeDurableHcsOperation(file,'changed-terms',async()=>{throw Error();},async()=>({}),async()=>({}))).rejects.toThrow('different terms');
 }finally{await rm(dir,{recursive:true,force:true});}
});
