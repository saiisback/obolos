import {describe,it,expect} from 'vitest';
import {mkdtemp,readFile,stat,writeFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {prepareSpeculos} from '../scripts/setup-speculos.mjs';
describe('private emulator identity',()=>{
 it('creates a private seed once and preserves it across restarts',async()=>{
  const root=await mkdtemp(join(tmpdir(),'obolos-speculos-'));
  try{
   await prepareSpeculos(root);
   const path=join(root,'data/speculos/device.seed'),seed=await readFile(path,'utf8');
   expect(seed.trim()).toMatch(/^[a-f0-9]{128}$/);
   expect((await stat(path)).mode&0o777).toBe(0o600);
   expect((await stat(join(root,'data/speculos'))).mode&0o777).toBe(0o700);
   await prepareSpeculos(root);expect(await readFile(path,'utf8')).toBe(seed);
  }finally{await rm(root,{recursive:true,force:true});}
 });
 it('refuses corrupt existing identity rather than silently rotating it',async()=>{
  const root=await mkdtemp(join(tmpdir(),'obolos-speculos-'));
  try{await mkdir(join(root,'data/speculos'),{recursive:true});await writeFile(join(root,'data/speculos/device.seed'),'bad');await expect(prepareSpeculos(root)).rejects.toThrow('existing');}
  finally{await rm(root,{recursive:true,force:true});}
 });
});
