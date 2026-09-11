import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expect,it} from 'vitest';
import {durableSignedTransaction} from '../scripts/economy-eoa';
import {keccak256,type Hex} from 'viem';
it('persists one signed transaction and reuses its hash after a broadcast timeout',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'obolos-eoa-'));let signed=0,broadcast=0;const raw='0x1234' as Hex;
 const intent={from:'0x'+'1'.repeat(40),to:'0x'+'2'.repeat(40),data:'0x12345678'};
 try{
  await expect(durableSignedTransaction(dir,'delivery',intent,{sign:async()=>{signed++;return raw;},receipt:async()=>null,broadcast:async()=>{broadcast++;throw Error('timeout');}})).rejects.toThrow(/uncertain/i);
  const result=await durableSignedTransaction(dir,'delivery',intent,{sign:async()=>{signed++;return raw;},receipt:async()=>({status:'success',transactionHash:keccak256(raw)}),broadcast:async()=>{broadcast++;}});
  expect(result.transactionHash).toBe(keccak256(raw));expect(signed).toBe(1);expect(broadcast).toBe(1);
  await expect(durableSignedTransaction(dir,'delivery',{...intent,data:'0x87654321'},{sign:async()=>raw,receipt:async()=>null,broadcast:async()=>{}})).rejects.toThrow(/different/i);
 }finally{await rm(dir,{recursive:true,force:true});}
});
