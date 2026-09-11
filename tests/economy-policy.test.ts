import {describe,it,expect} from 'vitest';
import {calculateEconomyMetrics} from '../src/lib/economy/metrics';
import {projectCapital,proposeEconomyPolicy} from '../src/lib/economy/policy';
const base=calculateEconomyMetrics([],[],{start:0,end:100,asset:'USDC',activeAgentIds:[],capitalAtomic:null,previousArpi:null});
const limits={inflationBps:100n,minimumProductivityBps:10000n,maximumTurnoverBps:20000n,minimumUtilizationBps:2000n};
describe('paper policy responses',()=>{
 it('does not fabricate proposals from missing observations',()=>expect(proposeEconomyPolicy(base,limits)).toEqual([]));
 it('requires human review for every measured shock',()=>{const result=proposeEconomyPolicy({...base,inflationBps:101n,productivityBps:9000n,paymentTurnoverBps:20001n,utilizationBps:1000n,surplusAtomic:-1n},limits);expect(result).toHaveLength(5);expect(result.every(r=>r.requiresHumanApproval)).toBe(true);});
 it('accounts for retained surplus and depreciation without minting',()=>expect(projectCapital({capitalAtomic:100n,surplusAtomic:20n,savingsBps:5000n,depreciationAtomic:3n})).toEqual({nextCapitalAtomic:107n,retainedAtomic:10n,insolvent:false,kind:'accounting-projection'}));
 it('preserves deficits rather than clamping away insolvency',()=>expect(projectCapital({capitalAtomic:10n,surplusAtomic:-30n,savingsBps:10000n,depreciationAtomic:1n}).nextCapitalAtomic).toBe(-21n));
});
