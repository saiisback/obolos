import {describe,it,expect,vi} from 'vitest';
import {decryptBrokerSecrets} from '../src/lib/integrations/ledger';
describe('Speculos broker profile',()=>{
 it('passes the isolated Ring profile only in explicit emulator mode',async()=>{
  const run=vi.fn().mockResolvedValue({stdout:JSON.stringify({inferenceApiKey:'fixture',hedera:{accountId:'0.0.1',privateKey:'fixture',keyType:'der'}})});
  const env={LEDGER_RING_FILE:'/private/test.enc',LEDGER_RING_KEY:'test',WALLET_PASS:'fixture',LEDGER_SIGNER_MODE:'speculos',OBOLOS_SPECULOS_STATE_DIR:'/private/speculos',OBOLOS_SPECULOS_SYNC_URL:'http://127.0.0.1:5001',WALLET_CLI_MOCK:'1'};
  await decryptBrokerSecrets(env,run);
  expect(run.mock.calls[0][2].env.OBOLOS_SPECULOS_STATE_DIR).toBe('/private/speculos');
  expect(run.mock.calls[0][2].env.OBOLOS_SPECULOS_SYNC_URL).toBe('http://127.0.0.1:5001');
  expect(run.mock.calls[0][2].env.WALLET_CLI_MOCK).toBeUndefined();
  await decryptBrokerSecrets({...env,LEDGER_SIGNER_MODE:'usb'},run);
  expect(run.mock.calls[1][2].env.OBOLOS_SPECULOS_STATE_DIR).toBeUndefined();
 });
});
