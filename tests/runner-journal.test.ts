import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createRun } from '../src/lib/engine';
import { RunnerJournal } from '../src/lib/runner/journal';

const dirs:string[]=[];
async function directory(){const dir=await mkdtemp(join(tmpdir(),'obolos-runner-'));dirs.push(dir);return dir;}
afterEach(async()=>{for(const dir of dirs.splice(0))await rm(dir,{recursive:true,force:true});});
function job(id='job-one',maxRuns=1){return {id,agentId:'agent-one',repos:['vercel/next.js'],mandate:{id:'mandate-one',maxRuns,message:'signed scope',signature:'signature'}} as Parameters<RunnerJournal['start']>[0];}
function run(id='job-one'){return {...createRun({repos:['vercel/next.js'],mode:'live'}),id};}

it('durably reserves a run before work and never resumes a started job after restart',async()=>{
 const dir=await directory(),first=await RunnerJournal.open(dir,'agent-one');
 await first.start(job(),run());
 expect(JSON.parse(await readFile(join(dir,'journal.json'),'utf8')).jobs[0].state).toBe('started');
 await first.close();
 const restarted=await RunnerJournal.open(dir,'agent-one');
 expect(restarted.pending()).toHaveLength(1);
 expect(restarted.pending()[0].run.status).toBe('failed');
 expect(restarted.pending()[0].run.error).toMatch(/uncertain/i);
 await expect(restarted.start(job(),run())).rejects.toThrow(/already/i);
 await expect(restarted.start(job('job-two'),run('job-two'))).rejects.toThrow(/run limit/i);
 await restarted.close();
});
it('retains completed receipts for repeated upload until acknowledgment and rejects changed identity',async()=>{
 const dir=await directory(),journal=await RunnerJournal.open(dir,'agent-one');
 await journal.start(job(),run());
 const result={...run(),status:'completed' as const};
 result.receipts=[{id:'receipt',requestId:'job-one:data',mode:'live',network:'hedera:testnet',asset:'HBAR',amountAtomic:100000,units:1,provider:'repo-standard',status:'settled',timestamp:new Date().toISOString(),transactionId:'testnet-transaction'}];
 await journal.finish('job-one',result);
 await journal.close();
 const reopened=await RunnerJournal.open(dir,'agent-one');
 expect(reopened.pending()[0].run.receipts[0].transactionId).toBe('testnet-transaction');
 await expect(reopened.start({...job(),repos:['sveltejs/kit']},run())).rejects.toThrow(/changed/i);
 await reopened.acknowledge('job-one');
 expect(reopened.pending()).toEqual([]);
 await reopened.close();
 const next=await RunnerJournal.open(dir,'agent-one');
 expect(next.pending()).toEqual([]);
 await expect(next.start(job('job-two'),run('job-two'))).rejects.toThrow(/run limit/i);
 await next.close();
});
it('allows only one writer, refuses corrupt journals, and pins the journal agent',async()=>{
 const dir=await directory(),journal=await RunnerJournal.open(dir,'agent-one');
 await expect(RunnerJournal.open(dir,'agent-one')).rejects.toThrow(/lock/i);
 await journal.close();
 await expect(RunnerJournal.open(dir,'agent-two')).rejects.toThrow(/agent/i);
 await writeFile(join(dir,'journal.json'),'broken');
 await expect(RunnerJournal.open(dir,'agent-one')).rejects.toThrow();
});
it('binds mandate nonce to one exact signed message even for different jobs',async()=>{
 const dir=await directory(),journal=await RunnerJournal.open(dir,'agent-one');
 await journal.start(job('job-one',2),run());
 const changed=job('job-two',2);changed.mandate.message='changed scope';
 await expect(journal.start(changed,run('job-two'))).rejects.toThrow(/mandate.*changed/i);
 await journal.close();
});
it('keeps its fsynced reservation and exclusive lock across a real process crash',async()=>{
 const {spawn}=await import('node:child_process');
 const {pathToFileURL}=await import('node:url');
 const {resolve}=await import('node:path');
 const {unlink}=await import('node:fs/promises');
 const dir=await directory(),work=job(),initial=run();
 const source=`import {RunnerJournal} from ${JSON.stringify(pathToFileURL(resolve('src/lib/runner/journal.ts')).href)};\nconst journal=await RunnerJournal.open(${JSON.stringify(dir)},'agent-one');\nawait journal.start(${JSON.stringify(work)},${JSON.stringify(initial)});\nprocess.kill(process.pid,'SIGKILL');`;
 const child=spawn(process.execPath,['--import','tsx','--input-type=module','-e',source],{stdio:'ignore'});
 const stopped=await new Promise<string|null>((resolve,reject)=>{child.once('error',reject);child.once('exit',(_code,signal)=>resolve(signal));});
 expect(stopped).toBe('SIGKILL');
 await expect(RunnerJournal.open(dir,'agent-one')).rejects.toThrow(/lock/i);
 // Operator reconciliation: the exited child is known dead. Only the stale lock is removed.
 await unlink(join(dir,'runner.lock'));
 const recovered=await RunnerJournal.open(dir,'agent-one');
 expect(recovered.pending()[0].run.error).toMatch(/uncertain/);
 await expect(recovered.start(work,initial)).rejects.toThrow(/already/);
 await expect(recovered.start(job('second'),run('second'))).rejects.toThrow(/run limit/);
 await recovered.close();
});
it('stops polling and retains the process lock after a journal write failure',async()=>{
 const {mkdir}=await import('node:fs/promises');
 const dir=await directory(),journal=await RunnerJournal.open(dir,'agent-one');
 await rm(join(dir,'journal.json'));await mkdir(join(dir,'journal.json'));
 await expect(journal.start(job(),run())).rejects.toThrow();
 expect(()=>journal.pending()).toThrow(/recovery/);
 await journal.close();await expect(readFile(join(dir,'runner.lock'),'utf8')).resolves.toContain('agent-one');
});
