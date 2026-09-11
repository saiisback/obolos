import {describe,expect,it} from 'vitest';
import {assertProviderAuthorization,validateProviderBinding} from '../src/lib/economy/provider-queue';
import {createServiceDefinition} from '../src/lib/economy/service-contract';
import {providerSchemas} from '../src/lib/economy/provider-work';
import deployment from '../src/lib/economy/deployment.json';
describe('provider queue boundary',()=>{
 it('rejects absent and incorrect worker credentials',()=>{
  for(const [header,secret] of [[null,undefined],['Bearer wrong','a'.repeat(48)],['Bearer short','short']])expect(()=>assertProviderAuthorization(header??null,secret??undefined)).toThrow();
  expect(()=>assertProviderAuthorization('Bearer '+ 'a'.repeat(48),'a'.repeat(48))).not.toThrow();
 });
 it('binds reference services to the pinned seller, endpoint and actual schemas',()=>{
  const seller='0xd2137e6d65165400641aff0e34781d09a0215858';
  const definition=createServiceDefinition({chainId:5042002,settlementAddress:deployment.settlement as `0x${string}`,ledgerAddress:deployment.ledger as `0x${string}`,seller,endpoint:'https://obolos.app/api/economy/reference/compute',category:'compute',unit:'compute-unit',quantity:'1',unitPriceAtomic:'1000',inputSchema:providerSchemas.compute.input,outputSchema:providerSchemas.compute.output});
  expect(()=>validateProviderBinding(definition,'compute','https://obolos.app',seller)).not.toThrow();
  expect(()=>validateProviderBinding(definition,'inference','https://obolos.app',seller)).toThrow();
  expect(()=>validateProviderBinding(definition,'compute','https://evil.test',seller)).toThrow();
  expect(()=>validateProviderBinding({...definition,unit:'gigabyte-hour'},'compute','https://obolos.app',seller)).toThrow();
  expect(()=>validateProviderBinding({...definition,outputSchema:{type:'null'}},'compute','https://obolos.app',seller)).toThrow();
 });
});
