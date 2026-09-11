import {expect,it} from 'vitest';
import {sameKnownController} from '../src/lib/economy/ownership';
const a='0x'+'a'.repeat(40),b='0x'+'b'.repeat(40),owner='0x'+'c'.repeat(40);
it('excludes distinct executors bound to the same known owner from independent economic activity',()=>{
 const bindings=new Map([[a,owner],[b,owner]]);
 expect(sameKnownController(a,b,bindings)).toBe(true);
 expect(sameKnownController(a,owner,bindings)).toBe(true);
 expect(sameKnownController(a,'0x'+'d'.repeat(40),bindings)).toBe(false);
});

it('compares chains entering the same ownership cycle by the cycle, not the entry path',()=>{
 const bindings=new Map([[a,b],[b,owner],[owner,b]]);
 expect(sameKnownController(a,b,bindings)).toBe(true);
 expect(sameKnownController(a,owner,bindings)).toBe(true);
});
