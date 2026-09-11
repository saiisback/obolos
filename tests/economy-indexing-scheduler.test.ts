import {describe,expect,it} from 'vitest';
import {authenticateIndexing,indexFreshness,safeIndexFailure} from '../src/lib/economy/indexing-scheduler';
describe('indexing scheduler boundary',()=>{
 it('fails closed on missing configuration, absent and wrong bearer tokens',()=>{
  const secret='a'.repeat(32);
  expect(()=>authenticateIndexing(null,'')).toThrow();
  expect(()=>authenticateIndexing(null,secret)).toThrow();
  expect(()=>authenticateIndexing(`Bearer ${'b'.repeat(32)}`,secret)).toThrow();
  expect(()=>authenticateIndexing(`Bearer ${secret}`,secret)).not.toThrow();
 });
 it('distinguishes stale chain evidence from a recent refresh',()=>{
  const now=172800000;
  expect(indexFreshness(null,now).status).toBe('awaiting_index');
  expect(indexFreshness({indexedAt:new Date(now).toISOString(),chainTimestamp:172799,caughtUp:false},now).status).toBe('catching_up');
  expect(indexFreshness({indexedAt:new Date(now).toISOString(),chainTimestamp:170000,caughtUp:true},now).status).toBe('stale');
  expect(indexFreshness({indexedAt:new Date(now).toISOString(),chainTimestamp:172799,caughtUp:true},now).status).toBe('fresh');
 });
});

it('limits scheduler diagnostics to known phases and safe error identifiers',()=>{
 const failure={name:'Error',code:'ENOTFOUND',message:'postgres://user:secret@db/secret',cause:{name:'Error',code:'postgres://user:secret@db'}};
 expect(safeIndexFailure('database-connect',failure)).toEqual({phase:'database-connect',errors:[{name:'Error',code:'ENOTFOUND'},{name:'Error',code:'unknown'}]});
 expect(JSON.stringify(safeIndexFailure('postgres://private',failure))).not.toContain('secret');
 expect(safeIndexFailure('postgres://private',failure).phase).toBe('unknown');
});
