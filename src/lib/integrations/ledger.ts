import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';

export type BrokerEnv = Record<string, string | undefined>;
export const runFile = promisify(execFile);
const secretSchema = z.object({
  inferenceApiKey: z.string().min(1),
  hedera: z.object({accountId:z.string().regex(/^0\.0\.\d+$/),privateKey:z.string().min(1),keyType:z.enum(['ecdsa','ed25519','der']).default('der')}),
}).strict();
export type BrokerSecrets = z.infer<typeof secretSchema>;

/** Only the trusted broker calls this. Stdout and error objects must never reach logs. */
export async function decryptBrokerSecrets(env: BrokerEnv, runner = runFile): Promise<BrokerSecrets> {
  try {
    if (!env.LEDGER_RING_FILE || !env.LEDGER_RING_KEY || !env.WALLET_PASS) throw Error();
    const {stdout} = await runner(env.LEDGER_WALLET_CLI || 'wallet-cli',
      ['ring','decrypt','-i',env.LEDGER_RING_FILE,'--key',env.LEDGER_RING_KEY],
      {shell:false,timeout:30_000,maxBuffer:64*1024,encoding:'utf8',env:{NODE_ENV:'production',PATH:env.PATH,HOME:env.HOME,WALLET_PASS:env.WALLET_PASS,...(env.LEDGER_SIGNER_MODE==='speculos'?{OBOLOS_SPECULOS_STATE_DIR:env.OBOLOS_SPECULOS_STATE_DIR,OBOLOS_SPECULOS_SYNC_URL:env.OBOLOS_SPECULOS_SYNC_URL}:{})}});
    return secretSchema.parse(JSON.parse(String(stdout)));
  } catch { throw new Error('Key Ring unavailable; provision the encrypted broker bundle.'); }
}
