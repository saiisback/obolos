import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {expect,it} from 'vitest';
import {acquireProcessLock} from '../scripts/process-lock';
it('recovers a killed worker lock while refusing another live process',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'obolos-lock-')),file=join(dir,'worker.lock');
 try{
  await writeFile(file,JSON.stringify({pid:2147483647}),{mode:0o600});const release=await acquireProcessLock(file);
  await expect(acquireProcessLock(file)).rejects.toThrow(/another process/i);await release();
  const next=await acquireProcessLock(file);await next();
 }finally{await rm(dir,{recursive:true,force:true});}
});
