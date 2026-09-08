// Real public challenge → emulated Sync signature/attestation → real Ledger staging authentication.
// Creates no Ring/member credentials, persists no token, and exports no secrets.
import { HWDeviceProvider } from '@ledgerhq/ledger-key-ring-protocol/HWDeviceProvider';
import { openTransport,closeTransport,withDevice } from './device/speculos';
import { STAGING_API } from './session/session-store';
async function main(){
 if(process.env.WALLET_CLI_MOCK||process.env.MOCK)throw new Error('Mock mode prohibited');
 await openTransport();
 process.stderr.write('Review the login request in the local Sync emulator and approve there.\n');
 const provider=new HWDeviceProvider(STAGING_API,withDevice);
 await provider.withJwt('obolos-speculos-sync',async()=>{
  process.stdout.write(JSON.stringify({mode:'speculos',hardwareBacked:false,backend:STAGING_API,challengeAuthentication:'verified',ringEnrolled:false})+'\n');
 },'no-cache');
}
main().catch(error=>{process.stderr.write(`Authentication failed: ${error instanceof Error?error.message:'unknown failure'}\n`);process.exitCode=1;}).finally(async()=>{await closeTransport();process.stdout.write('',()=>process.exit(process.exitCode??0));});
