import { existsSync, readFileSync, mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { stateDir } from '../adapters/state-dir';
import { writeSecureFile } from '../shared/secure-file';
export const APP_NAME = 'obolos-ledger-speculos';
export const STAGING_API = 'https://trustchain-backend.api.aws.stg.ldg-tech.com';
const schema = z.object({ version: z.literal(1), mode:z.literal('speculos'), backend:z.literal(STAGING_API), trustchain:z.object({rootId:z.string().min(1),applicationPath:z.string().min(1)}).optional(), passwordSalt:z.string().regex(/^[0-9a-f]{32}$/).optional(), domains:z.array(z.object({domain:z.string(),firstUsed:z.string()})).default([]) });
type Data=z.infer<typeof schema>;
export type TrustchainMeta=NonNullable<Data['trustchain']>;
export function trustchainFromMeta(meta:TrustchainMeta){return {...meta,walletSyncEncryptionKey:''};}
export class Session {
  constructor(private data:Data){}
  static async read(){ const path=join(stateDir(APP_NAME),'session.json');return new Session(schema.parse(existsSync(path)?JSON.parse(readFileSync(path,'utf8')):{version:1,mode:'speculos',backend:STAGING_API,domains:[]}));}
  get trustchain(){return this.data.trustchain;}
  get passwordSalt(){return this.data.passwordSalt;}
  get domains(){return this.data.domains;}
  setTrustchain(meta:TrustchainMeta){this.data.trustchain=meta;}
  setPasswordSalt(salt:string){this.data.passwordSalt=salt;}
  trackDomain(domain:string){if(this.data.domains.some(d=>d.domain===domain))return false;this.data.domains.push({domain,firstUsed:new Date().toISOString()});return true;}
  write(){const dir=stateDir(APP_NAME);mkdirSync(dir,{recursive:true,mode:0o700});chmodSync(dir,0o700);writeSecureFile(join(dir,'session.json'),Buffer.from(JSON.stringify(this.data,null,2)+'\n'));}
}
