import { mkdir,readFile,rename,writeFile } from 'node:fs/promises';
import { join,resolve } from 'node:path';
import type { Run } from './contracts';
import { appendAudit } from './policy';

interface StoredRun {owner:string;run:Run;inFlight?:{stage:string;startedAt:string}}
interface Snapshot {version:1;records:StoredRun[]}
// A single Next.js node process owns this store. Use a durable volume in deployment.
export class RunStore {
 private tail:Promise<unknown>=Promise.resolve();
 constructor(private directory=resolve(/* turbopackIgnore: true */ process.env.AGENTGDP_DATA_DIR??'data/app')){}
 private async serial<T>(operation:()=>Promise<T>):Promise<T>{
  const next=this.tail.then(operation,operation);this.tail=next.catch(()=>{});return next;
 }
 private async read():Promise<Snapshot>{
  try{return JSON.parse(await readFile(join(this.directory,'runs.json'),'utf8')) as Snapshot;}
  catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return {version:1,records:[]};throw new Error('Run storage could not be read. No actions were executed.');}
 }
 private async write(snapshot:Snapshot){
  await mkdir(this.directory,{recursive:true,mode:0o700});
  const temp=join(this.directory,'runs.json.tmp');await writeFile(temp,JSON.stringify(snapshot),{mode:0o600});await rename(temp,join(this.directory,'runs.json'));
 }
 async list(owner:string){return this.serial(async()=>{const data=await this.read();return data.records.filter(x=>x.owner===owner).map(x=>structuredClone(this.recover(x).run)).reverse();});}
 async insert(owner:string,run:Run){return this.serial(async()=>{
  const data=await this.read();if(data.records.filter(x=>x.owner===owner).length>=50)throw new Error('This session has reached 50 jobs. Export your records and start a new browser session.');
  if(data.records.length>=500)throw new Error('This demo server has reached its run capacity. Ask the operator to archive the data.');
  data.records.push({owner,run});await this.write(data);return run;
 });}
 async get(owner:string,id:string){return this.serial(async()=>{
  const data=await this.read(),record=data.records.find(x=>x.owner===owner&&x.run.id===id);if(!record)throw new Error('Run not found.');return structuredClone(this.recover(record).run);
 });}
 private recover(record:StoredRun){
  if(record.inFlight){
   record.run.status='failed';record.run.error='The server restarted during an operation. Reconcile the broker payment journal before starting another job; this operation will not be retried.';
   record.run.events=appendAudit(record.run.events,'broker','blocked','Interrupted operation',`${record.inFlight.stage} started at ${record.inFlight.startedAt}. ${record.run.error}`);record.inFlight=undefined;
  }return record;
 }
 async mutate(owner:string,id:string,action:(run:Run)=>Promise<Run>|Run){return this.serial(async()=>{
  const data=await this.read(),record=data.records.find(x=>x.owner===owner&&x.run.id===id);if(!record)throw new Error('Run not found.');
  this.recover(record);
  // Persist intent BEFORE any network operation. An interrupted operation fails closed on recovery.
  record.inFlight={stage:record.run.stage,startedAt:new Date().toISOString()};await this.write(data);
  try{record.run=await action(record.run);record.inFlight=undefined;await this.write(data);return structuredClone(record.run);}
  catch(error){record.inFlight=undefined;await this.write(data);throw error;}
 });}
}
const g=globalThis as unknown as {agentgdpStore?:RunStore};
export const store=g.agentgdpStore??=new RunStore();
