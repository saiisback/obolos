import {describe,expect,it} from 'vitest';
import {privateKeyToAccount} from 'viem/accounts';
import {canonicalJson} from '../src/lib/economy/service-contract';
import {authenticateEvidence, selectEvidenceBasket} from '../src/lib/economy/evidence';
const signer=privateKeyToAccount(`0x${'12'.repeat(32)}`),other=privateKeyToAccount(`0x${'13'.repeat(32)}`);
const address=(n:string)=>`0x${n.repeat(40)}` as `0x${string}`,hash=(n:string)=>`0x${n.repeat(64)}`;
export const deployment={chainId:5042002 as const,policy:address('1'),ledger:address('2'),settlement:address('3'),fromBlock:'1',controller:address('4'),approver:address('5'),reserve:address('6'),reviewPool:address('7')};
const base={protocol:'obolos.evidence.v1',chainId:5042002,policy:deployment.policy,ledger:deployment.ledger,settlement:deployment.settlement,asset:'USDC',windowStart:86400,windowEnd:172800,issuedAt:172801,signer:signer.address.toLowerCase(),sourceReference:'ipfs://real-evidence-digest',sourceHash:hash('a')};
const windowPayload={...base,kind:'window',capitalAtomic:'1000000',activeAgentIds:[hash('b')],anchorBlock:'9',anchorBlockHash:hash('c')};
async function signed(payload:unknown,account=signer){return {payload,signature:await account.signMessage({message:`Obolos economic evidence v1\n${canonicalJson(payload)}`})};}
const trust={[signer.address.toLowerCase()]:['window','order','basket']};
describe('signed economic evidence',()=>{
 it('authenticates canonical signatures with explicit role trust',async()=>{expect((await authenticateEvidence(await signed(windowPayload),deployment,trust,172802)).payload).toEqual(windowPayload);});
 it('rejects untrusted signers and signatures from another account',async()=>{await expect(authenticateEvidence(await signed(windowPayload),deployment,{},172802)).rejects.toThrow('trusted');await expect(authenticateEvidence(await signed(windowPayload,other),deployment,trust,172802)).rejects.toThrow('signature');});
 it('rejects cross-deployment and open or non-day windows',async()=>{for(const changes of [{settlement:address('9')},{windowEnd:259200},{windowStart:86401},{issuedAt:172799}])await expect(authenticateEvidence(await signed({...windowPayload,...changes}),deployment,trust,172802)).rejects.toThrow();});
 it('uses only the explicitly selected fixed-basket hash, even when another newer offer exists',()=>{
  const component={id:'compute',category:'compute' as const,unit:hash('1'),baselineAtomic:'100',weightBps:'10000',baselineServiceHash:hash('2'),quoteServiceHash:hash('2')};
  const services=[{serviceHash:hash('2'),unitHash:hash('1'),category:'compute',unitPrice:'100',quantity:'1',seller:address('a'),endpointHash:hash('3'),registeredAt:1},{serviceHash:hash('4'),unitHash:hash('1'),category:'compute',unitPrice:'500',quantity:'1',seller:address('a'),endpointHash:hash('3'),registeredAt:100}];
  expect(selectEvidenceBasket([component],services,172800)[0].currentAtomic).toBe(100n);
  expect(selectEvidenceBasket([{...component,quoteServiceHash:hash('9')}],services,172800)[0].currentAtomic).toBeNull();
 });
});
