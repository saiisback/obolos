import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { Run } from '../contracts';
import { appendAudit } from '../policy';
import type { RunnerJob } from './types';

type Entry={job:RunnerJob;fingerprint:string;state:'started'|'finished'|'acknowledged';run:Run};
type Journal={version:1;agentId:string;jobs:Entry[]};
function fingerprint(value:unknown){return createHash('sha256').update(JSON.stringify(value)).digest('hex');}
export function stopUncertain(run:Run):Run {
 const result=structuredClone(run);
 result.status='failed';result.updatedAt=new Date().toISOString();
 result.error='Execution interrupted; settlement may be uncertain. Reconcile the local broker journal manually. This job will never execute again.';
 result.events=appendAudit(result.events,'broker','blocked','Runner execution interrupted',result.error);
 return result;
}

/** One process per private directory. Stale locks require explicit operator reconciliation. */
export class RunnerJournal {
 private closed=false;
 private poisoned=false;
 private constructor(private directory:string,private data:Journal){}
 static async open(directory:string,agentId:string):Promise<RunnerJournal>{
  await mkdir(directory,{recursive:true,mode:0o700});
  const lockPath=join(directory,'runner.lock');
  let lock;
  try{lock=await open(lockPath,'wx',0o600);}catch{throw new Error('Runner lock exists or cannot be created. Stop other writers and reconcile any stale lock manually.');}
  try{
   await lock.writeFile(JSON.stringify({pid:process.pid,agentId}));await lock.sync();await lock.close();
   let data:Journal;
   try{data=JSON.parse(await readFile(join(directory,'journal.json'),'utf8'));}
   catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw new Error('Runner journal is corrupt or unreadable. Manual reconciliation required.');data={version:1,agentId,jobs:[]};}
   if(data.version!==1||data.agentId!==agentId||!Array.isArray(data.jobs))throw new Error('Runner journal does not match the pinned agent or journal version.');
   if(new Set(data.jobs.map(e=>e.job?.id)).size!==data.jobs.length||data.jobs.some(e=>!e.job?.id||e.job.agentId!==agentId||!e.run||e.run.id!==e.job.id||e.fingerprint!==fingerprint(e.job)||!['started','finished','acknowledged'].includes(e.state)))throw new Error('Runner journal integrity check failed. Manual reconciliation required.');
   const journal=new RunnerJournal(directory,data);
   for(const entry of data.jobs)if(entry.state==='started'){entry.run=stopUncertain(entry.run);entry.state='finished';}
   await journal.persist();
   return journal;
  }catch(error){await lock.close().catch(()=>{});await unlink(lockPath).catch(()=>{});throw error;}
 }
 private assertHealthy(){if(this.closed||this.poisoned)throw new Error('Runner journal is closed or requires recovery.');}
 private async persist(){
  this.assertHealthy();
  const path=join(this.directory,`.journal-${randomUUID()}.tmp`);
  try{
   const file=await open(path,'wx',0o600);
   try{await file.writeFile(JSON.stringify(this.data));await file.sync();}finally{await file.close();}
   await rename(path,join(this.directory,'journal.json'));
   const directory=await open(this.directory,'r');try{await directory.sync();}finally{await directory.close();}
  }catch(error){this.poisoned=true;throw error;}
 }
 pending():Entry[]{this.assertHealthy();return structuredClone(this.data.jobs.filter(e=>e.state==='finished'));}
 existing(job:RunnerJob):boolean{
  this.assertHealthy();
  const entry=this.data.jobs.find(e=>e.job.id===job.id);
  if(entry&&entry.fingerprint!==fingerprint(job))throw new Error('Existing job parameters changed.');
  return Boolean(entry);
 }
 async start(job:RunnerJob,run:Run){
  if(job.agentId!==this.data.agentId||run.id!==job.id)throw new Error('Job does not match the pinned agent or run.');
  if(this.existing(job))throw new Error('Job already started; it cannot execute again.');
  const previous=this.data.jobs.filter(e=>e.job.mandate.id===job.mandate.id);
  if(previous.some(e=>fingerprint(e.job.mandate)!==fingerprint(job.mandate)))throw new Error('Mandate nonce parameters changed.');
  if(!Number.isInteger(job.mandate.maxRuns)||job.mandate.maxRuns<1||job.mandate.maxRuns>10||previous.length>=job.mandate.maxRuns)throw new Error('Signed mandate run limit exhausted.');
  this.data.jobs.push({job:structuredClone(job),fingerprint:fingerprint(job),state:'started',run:structuredClone(run)});
  await this.persist();
 }
 async checkpoint(id:string,run:Run){
  const entry=this.data.jobs.find(e=>e.job.id===id);
  if(!entry||entry.state!=='started'||run.id!==id)throw new Error('Invalid runner checkpoint.');
  entry.run=structuredClone(run);await this.persist();
 }
 async finish(id:string,run:Run){
  const entry=this.data.jobs.find(e=>e.job.id===id);
  if(!entry||entry.state!=='started'||run.id!==id||!['completed','failed','awaiting_approval'].includes(run.status))throw new Error('Invalid terminal runner result.');
  entry.run=structuredClone(run);entry.state='finished';await this.persist();
 }
 async acknowledge(id:string){
  const entry=this.data.jobs.find(e=>e.job.id===id);
  if(!entry||entry.state!=='finished')throw new Error('Invalid runner acknowledgment.');
  entry.state='acknowledged';await this.persist();
 }
 async close(){if(this.closed)return;this.closed=true;if(!this.poisoned)await unlink(join(this.directory,'runner.lock'));}
}
