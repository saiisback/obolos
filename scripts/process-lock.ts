import {link,mkdir,open,readFile,stat,unlink} from 'node:fs/promises';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
/** Atomic, nonempty PID lock. A dead process can be recovered without discarding any intent. */
export async function acquireProcessLock(path:string):Promise<()=>Promise<void>>{
 await mkdir(dirname(path),{recursive:true,mode:0o700});const candidate=path+'.'+randomUUID(),file=await open(candidate,'wx',0o600);
 try{await file.writeFile(JSON.stringify({pid:process.pid}));await file.sync();}finally{await file.close();}
 try{
  for(let attempt=0;attempt<3;attempt++){
   try{await link(candidate,path);const owned=await stat(path);return async()=>{const current=await stat(path).catch(()=>null);if(current?.ino===owned.ino)await unlink(path);};}
   catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}
   const before=await stat(path).catch(()=>null);if(!before)continue;
   let pid:number;try{pid=JSON.parse(await readFile(path,'utf8')).pid;if(!Number.isSafeInteger(pid)||pid<1)throw Error();}catch{throw Error('Unrecognized lock; inspect it before manual recovery.');}
   try{process.kill(pid,0);throw Error('Another process owns this operation lock.');}catch(error){if((error as NodeJS.ErrnoException).code!=='ESRCH')throw error;}
   const after=await stat(path).catch(()=>null);if(after?.ino===before.ino)await unlink(path);
  }
  throw Error('Operation lock changed; retry later.');
 }finally{await unlink(candidate).catch(()=>{});}
}
