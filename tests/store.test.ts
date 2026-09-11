import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {describe,it,expect} from 'vitest';
import {RunStore} from '../src/lib/store';
import {createRun,advanceRun} from '../src/lib/engine';
import {liveFixtureGateway} from './fixtures/gateway';
describe('persistent run isolation',()=>{
 it('isolates sessions and serializes competing actions',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'ag-store-')),store=new RunStore(directory),run=createRun({repos:['vercel/next.js'],mode:'live'});
  await store.insert('alice',run);expect(await store.list('bob')).toEqual([]);await expect(store.get('bob',run.id)).rejects.toThrow('not found');
  await Promise.all(Array.from({length:8},()=>store.mutate('alice',run.id,r=>advanceRun(r,liveFixtureGateway))));
  const finished=await store.get('alice',run.id);expect(finished.status).toBe('completed');expect(finished.receipts).toHaveLength(2);
 });
 it('fails closed after a server interruption during a payment',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'ag-store-')),store=new RunStore(directory),run=createRun({repos:['vercel/next.js'],mode:'live'});
  await store.insert('alice',run);
  const file=join(directory,'runs.json'),data=JSON.parse(await readFile(file,'utf8'));data.records[0].inFlight={stage:'purchase',startedAt:new Date().toISOString()};await writeFile(file,JSON.stringify(data));
  const loaded=await store.get('alice',run.id);expect(loaded.status).toBe('failed');expect(loaded.error).toContain('Reconcile');
 });
});
