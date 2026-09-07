import {afterEach,describe,it,expect,vi} from 'vitest';
import fs from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {parseEnv} from 'node:util';
import {setupLocal} from '../scripts/setup-local.mjs';
const roots:string[]=[];
async function fixture(){
  const root=await fs.realpath(await fs.mkdtemp(join(tmpdir(),'obolos-setup-local-')));roots.push(root);
  for(const name of ['.env.example','.env.broker.example','.env.services.example','.gitignore'])await fs.copyFile(resolve(name),join(root,name));
  await fs.mkdir(join(root,'node_modules/.bin'),{recursive:true});
  for(const name of ['circle','wallet-cli']){await fs.writeFile(join(root,'node_modules/.bin',name),'#!/bin/sh\nexit 99\n');await fs.chmod(join(root,'node_modules/.bin',name),0o700);}
  return root;
}
afterEach(async()=>{vi.restoreAllMocks();await Promise.all(roots.splice(0).map(root=>fs.rm(root,{recursive:true,force:true})));});
describe('local-only bootstrap',()=>{
  it('creates private matching config with independent secrets and no wallet credentials or secret output',async()=>{
    const root=await fixture();const result=await setupLocal(root,{});
    const app=parseEnv(await fs.readFile(join(root,'.env.local'),'utf8'));
    const broker=parseEnv(await fs.readFile(join(root,'.env.broker'),'utf8'));
    const service=parseEnv(await fs.readFile(join(root,'.env.services'),'utf8'));
    expect(new Set([app.SESSION_SECRET,app.OPERATOR_TOKEN,app.BROKER_TOKEN,app.DATA_SERVICE_OPERATOR_TOKEN]).size).toBe(4);
    for(const value of [app.SESSION_SECRET,app.OPERATOR_TOKEN,app.BROKER_TOKEN,app.DATA_SERVICE_OPERATOR_TOKEN]){expect(value).toMatch(/^[0-9a-f]{64}$/);expect(JSON.stringify(result)).not.toContain(value);}
    expect(app.BROKER_TOKEN).toBe(broker.BROKER_TOKEN);expect(app.DATA_SERVICE_OPERATOR_TOKEN).toBe(service.DATA_SERVICE_OPERATOR_TOKEN);
    expect(broker.LEDGER_WALLET_CLI).toBe(join(root,'node_modules/.bin/wallet-cli'));
    expect(broker.CIRCLE_CLI_HOME).toBe(join(root,'data/local-broker/circle-session'));
    expect(broker.HEDERA_PAY_TO).toBe('');expect(broker.CIRCLE_WALLET_ADDRESS).toBe('');expect(broker.WALLET_PASS).toBeUndefined();
    for(const name of ['.env.local','.env.broker','.env.services'])expect((await fs.stat(join(root,name))).mode&0o777).toBe(0o600);
    await expect(setupLocal(root,{})).rejects.toThrow(/existing configuration/i);
    expect(await fs.readFile(join(root,'.env.local'),'utf8')).toContain(app.SESSION_SECRET);
  });
  it('preserves valid prior session keys exactly',async()=>{
    const root=await fixture();await fs.mkdir(join(root,'data/app'),{recursive:true});const key='c'.repeat(64);await fs.writeFile(join(root,'data/app/session.key'),key,{mode:0o600});
    await setupLocal(root,{});
    expect(parseEnv(await fs.readFile(join(root,'.env.local'),'utf8')).SESSION_SECRET).toBe(key);
    expect(await fs.readFile(join(root,'data/app/session.key'),'utf8')).toBe(key);
  });
  it.each(['.env.local','.env.broker','.env.services'])('refuses every write if %s already exists',async existing=>{
    const root=await fixture();await fs.writeFile(join(root,existing),'DO_NOT_TOUCH=existing\n');
    await expect(setupLocal(root,{})).rejects.toThrow(/existing configuration/i);
    expect(await fs.readFile(join(root,existing),'utf8')).toBe('DO_NOT_TOUCH=existing\n');
    for(const name of ['.env.local','.env.broker','.env.services'].filter(name=>name!==existing))await expect(fs.stat(join(root,name))).rejects.toThrow();
    await expect(fs.stat(join(root,'data/local-broker'))).rejects.toThrow();
  });
  it('rolls back its own files and directories after an exclusive-create error',async()=>{
    const root=await fixture();const actualOpen=fs.open;
    vi.spyOn(fs,'open').mockImplementation(((file:Parameters<typeof fs.open>[0],...args:unknown[])=>{
      if(String(file)===join(root,'.env.services'))return Promise.reject(new Error('write failed'));
      return (actualOpen as (...args:unknown[])=>unknown)(file,...args);
    }) as typeof fs.open);
    await expect(setupLocal(root,{})).rejects.toThrow(/setup failed/i);
    for(const name of ['.env.local','.env.broker','.env.services','data/local-broker'])await expect(fs.stat(join(root,name))).rejects.toThrow();
  });
});

it('prints only setup statuses when executed in a temporary workspace',async()=>{
  const {execFile}=await import('node:child_process');const {promisify}=await import('node:util');
  const root=await fixture();
  const output=await promisify(execFile)(process.execPath,[resolve('scripts/setup-local.mjs')],{cwd:root,encoding:'utf8',env:{PATH:process.env.PATH,NODE_ENV:'test'}});
  const app=parseEnv(await fs.readFile(join(root,'.env.local'),'utf8'));
  expect(output.stdout).toContain('.env.local: created');
  expect(output.stdout).toContain('same OS user is not credential isolation');
  for(const name of ['SESSION_SECRET','OPERATOR_TOKEN','BROKER_TOKEN','DATA_SERVICE_OPERATOR_TOKEN'])expect(output.stdout+output.stderr).not.toContain(app[name]);
});
