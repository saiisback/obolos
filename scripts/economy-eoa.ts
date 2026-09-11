import {mkdir,open,readFile,rename,unlink} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {keccak256,type Hex} from 'viem';
import {acquireProcessLock} from './process-lock';
export async function savePrivateJson(filename:string,value:unknown){
 await mkdir(dirname(filename),{recursive:true,mode:0o700});const temp=filename+'.'+randomUUID()+'.tmp',file=await open(temp,'wx',0o600);
 try{await file.writeFile(JSON.stringify(value,(_k,v)=>typeof v==='bigint'?v.toString():v));await file.sync();}finally{await file.close();}
 await rename(temp,filename);const folder=await open(dirname(filename),'r');try{await folder.sync();}finally{await folder.close();}
}
export async function loadPrivateJson<T>(filename:string):Promise<T|null>{try{return JSON.parse(await readFile(filename,'utf8')) as T;}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e;}}
type Intent={from:string;to:string;data:string};
type Receipt={status:string;transactionHash:Hex};
/** The signed bytes, nonce and transaction hash are permanent, including after timeout. */
export async function durableSignedTransaction<T extends Receipt>(directory:string,name:string,intent:Intent,adapter:{sign:()=>Promise<Hex>;receipt:(hash:Hex)=>Promise<T|null>;broadcast:(raw:Hex)=>Promise<unknown>}):Promise<T>{
 if(!/^[a-zA-Z0-9_-]{1,100}$/.test(name))throw Error('Invalid transaction name');await mkdir(directory,{recursive:true,mode:0o700});const filename=join(directory,name+'.json'),release=await acquireProcessLock(filename+'.lock');
 try{
  let record=await loadPrivateJson<{intent:Intent;raw:Hex;hash:Hex}>(filename);
  if(record){if(JSON.stringify(record.intent)!==JSON.stringify(intent)||keccak256(record.raw)!==record.hash)throw Error('Saved transaction has different or invalid intent');}
  else{const raw=await adapter.sign();record={intent,raw,hash:keccak256(raw)};await savePrivateJson(filename,record);}
  let receipt=await adapter.receipt(record.hash);
  if(!receipt){await adapter.broadcast(record.raw).catch(()=>{});receipt=await adapter.receipt(record.hash);}
  if(!receipt)throw Error('Transaction outcome uncertain. Preserve the signed transaction and reconcile its original hash.');
  if(receipt.status!=='success'||receipt.transactionHash.toLowerCase()!==record.hash.toLowerCase())throw Error('Original transaction did not succeed. No replacement submitted.');return receipt;
 }finally{await release();}
}
