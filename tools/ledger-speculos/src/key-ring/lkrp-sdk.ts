import { getSdk } from '@ledgerhq/ledger-key-ring-protocol';
import { withDevice } from '../device/speculos';
import { STAGING_API } from '../session/session-store';
import { LKRP_APPLICATION_ID } from './constants';
export function createLkrpSdk(memberName='obolos-speculos'){
 if(process.env.WALLET_CLI_MOCK||process.env.MOCK)throw new Error('Mock mode is prohibited in this adapter.');
 return getSdk(false,{applicationId:LKRP_APPLICATION_ID,name:memberName,apiBaseUrl:STAGING_API},withDevice);
}
