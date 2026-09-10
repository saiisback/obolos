import {describe, expect, it} from 'vitest';
import {selectionPriceState, priceChangeLabel} from '../src/lib/market/price-state';
import type {MarketService} from '../src/lib/market/contracts';
const current: MarketService={id:'11111111-1111-4111-8111-111111111111',name:'Verifier',revision:1,recipient:`0x${'1'.repeat(40)}`,priceAtomic:50000,endpoint:'https://obolos.app/api/market/services/one',description:'',active:true,execution:'hosted-metric-verifier',createdAt:'2026-09-10T00:00:00Z'};
describe('signed service quote state',()=>{
 it('treats an unchanged quote as current',()=>expect(selectionPriceState(current,[current]).state).toBe('current'));
 it('requires new authorization for increases and decreases',()=>{for(const priceAtomic of [25000,75000])expect(selectionPriceState(current,[{...current,priceAtomic}]).state).toBe('changed');});
 it('requires review for revision, recipient, endpoint and name changes',()=>{for(const delta of [{revision:2},{recipient:`0x${'2'.repeat(40)}`},{endpoint:'https://obolos.app/changed'},{name:'New terms'}])expect(selectionPriceState(current,[{...current,...delta}]).state).toBe('changed');});
 it('blocks unavailable and paused services',()=>{expect(selectionPriceState(current,[]).state).toBe('unavailable');expect(selectionPriceState(current,[{...current,active:false}]).state).toBe('unavailable');});
 it('distinguishes no signed selection and reports actual relative price changes',()=>{expect(selectionPriceState(undefined,[]).state).toBe('unselected');expect(priceChangeLabel(50000,75000)).toBe('Up 50%');expect(priceChangeLabel(50000,25000)).toBe('Down 50%');expect(priceChangeLabel(50000,50000)).toBe('Price unchanged');});
});
