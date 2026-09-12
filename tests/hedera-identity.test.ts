import {describe,it,expect} from 'vitest';
import {canonicalAgentData,createUaid} from '../src/lib/hedera/identity';
const vector={registry:'hol',name:'Support Agent',version:'1.0.0',protocol:'hcs-10',nativeId:'hedera:testnet:0.0.123456',skills:[0,17]};
describe('HCS-14 identity',()=>{
 it('pins official vector inputs to normative alphabetical UTF8 SHA384 base58',()=>{
  expect(canonicalAgentData(vector)).toEqual(vector);
  expect(createUaid(vector)).toBe('uaid:aid:8yjEeyipVRyYFKKjnt8QXXTTQbprY1fVCqZA3UvN39v4JQtjHACwMmaq9HXCcZRu6V;uid=0;registry=hol;proto=hcs-10;nativeId=hedera:testnet:0.0.123456');
 });
 it('normalizes only the six fields and sorts skills',()=>expect(createUaid({...vector,registry:' HOL ',protocol:' HCS-10 ',name:' Support Agent ',skills:[17,0],endpoint:'private'} as typeof vector)).toBe(createUaid(vector)));
 it('allows empty skills and rejects reserved, fractional and missing inputs',()=>{
  expect(()=>createUaid({...vector,skills:[]})).not.toThrow();
  for(const skills of [[40],[99],[-1],[1.1]])expect(()=>createUaid({...vector,skills})).toThrow();
  expect(()=>createUaid({...vector,name:' '})).toThrow();
 });
 it('rejects parameter injection and preserves mandated routing order',()=>{
  expect(()=>createUaid(vector,{uid:'x;registry=evil'})).toThrow();
  expect(createUaid(vector,{uid:'buyer',domain:'example.com'})).toMatch(/;uid=buyer;registry=hol;proto=hcs-10;nativeId=hedera:testnet:0.0.123456;domain=example.com$/);
 });
});
