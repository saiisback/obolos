import {beforeEach,expect,it,vi} from 'vitest';
import {keccak256,toHex,type Hex} from 'viem';

const state=vi.hoisted(()=>({query:vi.fn()}));
vi.mock('../src/lib/platform/db',()=>({sql:()=>state.query}));
import {providerWorkAction} from '../src/lib/economy/provider-queue';
import {canonicalJsonHash,createServiceDefinition} from '../src/lib/economy/service-contract';
import {providerSchemas} from '../src/lib/economy/provider-work';
import deployment from '../src/lib/economy/deployment.json';

const orderId=keccak256(toHex('completed-storage-order'));
const attestationHash=keccak256(toHex('completed-storage-attestation'));
const claimToken='11111111-1111-4111-8111-111111111111';
const leaseStartedAt=1;
const output={objectId:orderId,bytes:7,sha256:'a'.repeat(64),expiresAt:new Date((leaseStartedAt+3600)*1000).toISOString()};
const definition=createServiceDefinition({
 chainId:5042002,
 settlementAddress:deployment.settlement as Hex,
 ledgerAddress:deployment.ledger as Hex,
 seller:'0xd2137e6d65165400641aff0e34781d09a0215858',
 endpoint:'https://obolos.app/api/economy/reference/storage',
 category:'storage',unit:'stored-object-hour',quantity:'1',unitPriceAtomic:'1000',
 inputSchema:providerSchemas.storage.input,outputSchema:providerSchemas.storage.output,
});

beforeEach(()=>state.query.mockReset().mockResolvedValue([{order_id:orderId,claim_token:claimToken,state:'completed',definition,lease_started_at:leaseStartedAt,output,output_hash:canonicalJsonHash(output),attestation_hash:attestationHash}]));

it('converges a lost completion response after the storage retrieval lease expires',async()=>{
 await expect(providerWorkAction({action:'complete',orderId,token:claimToken,output,attestationHash})).resolves.toEqual({state:'completed'});
 expect(state.query).toHaveBeenCalledTimes(1);
});
