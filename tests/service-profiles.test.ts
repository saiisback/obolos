import {describe,it,expect} from 'vitest';
import {createServiceDefinition} from '@/lib/economy/service-contract';
import {profileForService,validateServiceProfile} from '@/lib/economy/service-profile';
const address=('0x'+'a'.repeat(40)) as `0x${string}`;
const definition=createServiceDefinition({chainId:5042002,settlementAddress:address,ledgerAddress:address,seller:address,endpoint:'https://provider.example/translate',category:'inference',unit:'inference-request',quantity:'1',unitPriceAtomic:'1000',inputSchema:{type:'object',properties:{text:{type:'string',maxLength:1000},language:{type:'string',maxLength:30}},required:['text','language'],additionalProperties:false},outputSchema:{type:'object',properties:{translation:{type:'string',maxLength:2000}},required:['translation'],additionalProperties:false}});
describe('Seller-defined capability profiles',()=>{
 it('accepts custom non-repository service examples and strips no capability input',()=>{
  const result=validateServiceProfile(definition,{title:'Translate text',description:'Translate supplied text into a requested language.',tags:['translation','writing'],examples:[{text:'Hello',language:'Spanish'}]});
  expect(result).toMatchObject({serviceHash:definition.serviceHash,title:'Translate text',examples:[{text:'Hello',language:'Spanish'}]});
 });
 it('rejects incompatible examples and price/identity injection',()=>{
  const base={title:'Translate',description:'Translation service',tags:[],examples:[]};
  expect(()=>validateServiceProfile(definition,{...base,examples:[{repo:'octocat/Hello-World'}]})).toThrow();
  expect(()=>validateServiceProfile(definition,{...base,seller:address})).toThrow();
  expect(()=>validateServiceProfile(definition,{...base,unitPriceAtomic:'1'})).toThrow();
 });
 it('does not infer unsupported capabilities from an arbitrary service category or endpoint',()=>{
  const result=profileForService(definition);
  expect(result.description).toContain('seller-defined');
  expect(result.examples).toEqual([]);
 });
 it('does not grant a built-in capability without server-verified binding',()=>{
  const {protocol:_protocol,serviceHash:_hash,...terms}=definition;
  const hosted=createServiceDefinition({...terms,endpoint:'https://obolos.app/api/economy/reference/inference'});
  expect(profileForService(hosted).examples).toEqual([]);
  expect(profileForService(hosted,undefined,true).examples).toEqual([]);
 });
});
