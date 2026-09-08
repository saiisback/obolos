import { describe, expect, it } from 'vitest';
import { fromAtomic, toAtomic } from '@/components/platform/api';

describe('workspace budget conversion', () => {
  it('preserves the smallest units and decimal values without rounding', () => {
    expect(toAtomic('0.00000001', 8)).toBe(1);
    expect(toAtomic('0.000001', 6)).toBe(1);
    expect(toAtomic('0.29', 8)).toBe(29_000_000);
    expect(toAtomic('0.999999', 6)).toBe(999_999);
    expect(toAtomic('1.00000000', 8)).toBe(100_000_000);
    expect(fromAtomic(1, 8)).toBe('0.00000001');
    expect(fromAtomic(100_000_000, 8)).toBe('1');
    expect(fromAtomic(0, 6)).toBe('0');
  });
  it('rejects excess precision, out-of-budget amounts, and ambiguous input', () => {
    for (const value of ['0.000000001', '1.00000001', '2', '-1', '1e-8', 'NaN', '', ' 0.1', '.1', '00.1']) {
      expect(() => toAtomic(value, 8), value).toThrow();
    }
  });
});
