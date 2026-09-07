import {describe,it,expect} from 'vitest';
import {mkdtemp,writeFile,mkdir,chmod,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runPreflight} from '../scripts/preflight.mjs';

describe('read-only local configuration preflight',()=>{
  it('reports absent configuration safely',async()=>{
    const root=await mkdtemp(join(tmpdir(),'obolos-preflight-'));
    try{const result=await runPreflight(root,{});expect(result.ok).toBe(false);expect(result.checks).toContainEqual({name:'.env.local',status:'missing'});}finally{await rm(root,{recursive:true,force:true});}
  });
  it('validates cross-service pins without exposing secrets or running configured tools',async()=>{
    const root=await mkdtemp(join(tmpdir(),'obolos-preflight-'));
    const token='sensitive-broker-token-'.repeat(3);
    const controller='0x1111111111111111111111111111111111111111';
    const cli=join(root,'wallet-cli');
    await writeFile(cli,'#!/bin/sh\ntouch "'+join(root,'must-not-exist')+'"\n');await chmod(cli,0o700);
    await writeFile(join(root,'bundle.enc'),'opaque encrypted payload');await mkdir(join(root,'circle'));await mkdir(join(root,'state'));
    const app=`SESSION_SECRET=${'a'.repeat(32)}\nOPERATOR_TOKEN=${'b'.repeat(32)}\nAPP_ORIGIN=http://127.0.0.1:3000\nCOOKIE_SECURE=false\nBROKER_URL=http://127.0.0.1:4319\nBROKER_TOKEN=${token}\nLEDGER_CONTROLLER_ADDRESS=${controller}\nDATA_SERVICE_URL=http://127.0.0.1:4402\nDATA_SERVICE_OPERATOR_TOKEN=${'p'.repeat(32)}\n`;
    const broker=`BROKER_TOKEN=${token}\nBROKER_PORT=4319\nBROKER_DATA_DIR=${join(root,'state')}\nBROKER_MAX_DATA_ATOMIC=10000000\nBROKER_MAX_USDC_ATOMIC=1000000\nBROKER_ALLOWED_PROVIDERS=repo-standard,repo-economy\nLEDGER_WALLET_CLI=wallet-cli\nLEDGER_RING_FILE=${join(root,'bundle.enc')}\nLEDGER_RING_KEY=obolos-broker\nLEDGER_CONTROLLER_ADDRESS=${controller}\nDATA_SERVICE_URL=http://127.0.0.1:4402\nHEDERA_PAY_TO=0.0.456\nCIRCLE_CLI=${cli}\nCIRCLE_CLI_HOME=${join(root,'circle')}\nCIRCLE_WALLET_ADDRESS=0x2222222222222222222222222222222222222222\nARC_VERIFIER_ADDRESS=0x3333333333333333333333333333333333333333\nARC_RPC_URL=https://rpc.testnet.arc.io\nARC_VERIFICATION_FEE_ATOMIC=50000\nINFERENCE_BASE_URL=https://api.openai.com/v1\nINFERENCE_MODEL=test-model\n`;
    const service=`HEDERA_PAY_TO=0.0.456\nDATA_SERVICE_PORT=4402\nDATA_SERVICE_PUBLIC_URL=http://127.0.0.1:4402\nDATA_SERVICE_OPERATOR_TOKEN=${'p'.repeat(32)}\n`;
    await Promise.all([writeFile(join(root,'.env.local'),app),writeFile(join(root,'.env.broker'),broker),writeFile(join(root,'.env.services'),service)]);
    try{
      const result=await runPreflight(root,{PATH:root,WALLET_PASS:'super-secret-runtime-only'});
      expect(result.ok).toBe(true);
      expect(JSON.stringify(result)).not.toMatch(/sensitive-broker|super-secret|opaque encrypted|0x111111/);
      await expect(access(join(root,'must-not-exist'))).rejects.toThrow();
      await writeFile(join(root,'.env.broker'),broker.replace('HEDERA_PAY_TO=0.0.456','HEDERA_PAY_TO=0.0.999'));
      const mismatch=await runPreflight(root,{PATH:root,WALLET_PASS:'super-secret-runtime-only'});
      expect(mismatch.ok).toBe(false);
      expect(mismatch.checks).toContainEqual({name:'HEDERA_PAY_TO:broker/services',status:'mismatch'});
    }finally{await rm(root,{recursive:true,force:true});}
  });
});
