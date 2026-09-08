import { afterEach, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deriveDomainKey, encryptData, decryptData, deriveWrappingKey } from '../src/key-ring/crypto';
import { emulatorUrl } from '../src/device/speculos';
import { createLkrpSdk } from '../src/key-ring/lkrp-sdk';
import { Session } from '../src/session/session-store';
const initial={...process.env}; const paths:string[]=[];
afterEach(()=>{process.env={...initial};for(const path of paths.splice(0))rmSync(path,{recursive:true,force:true});});
test('scoped encryption authenticates payload and rejects other domains',async()=>{
 const key=await deriveDomainKey('ab'.repeat(32),'obolos-broker');const other=await deriveDomainKey('ab'.repeat(32),'other');const msg=new TextEncoder().encode('public test fixture');const ct=await encryptData(key,msg);
 expect(await decryptData(key,ct)).toEqual(msg);expect(ct.length).toBe(msg.length+28);
 await expect(decryptData(other,ct)).rejects.toThrow();ct[13]^=1;await expect(decryptData(key,ct)).rejects.toThrow();
});
test('rejects empty restored key and malformed password salt',async()=>{await expect(deriveDomainKey('','test')).rejects.toThrow();await expect(deriveWrappingKey('fixture','bad')).rejects.toThrow();});
test('loopback transport rejects remote origins and credentials',()=>{for(const url of ['https://127.0.0.1:5001','http://example.com','http://user:pass@127.0.0.1:5001','http://127.0.0.1:5001/a']){process.env.OBOLOS_SPECULOS_SYNC_URL=url;expect(emulatorUrl).toThrow();}process.env.OBOLOS_SPECULOS_SYNC_URL='http://127.0.0.1:5001';expect(emulatorUrl().port).toBe('5001');});
test('mock variables fail closed',()=>{process.env.WALLET_CLI_MOCK='1';expect(()=>createLkrpSdk()).toThrow('Mock');});
test('state stores only public metadata with private permissions',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'obolos-speculos-test-'));paths.push(dir);process.env.OBOLOS_SPECULOS_STATE_DIR=dir;
 const session=await Session.read();session.setTrustchain({rootId:'test-public-root',applicationPath:'m/17'});session.setPasswordSalt('ab'.repeat(16));session.write();
 const path=join(dir,'session.json');const data=JSON.parse(readFileSync(path,'utf8'));expect(data.mode).toBe('speculos');expect(data.trustchain.walletSyncEncryptionKey).toBeUndefined();expect(statSync(path).mode&0o777).toBe(0o600);expect(statSync(dir).mode&0o777).toBe(0o700);
});
