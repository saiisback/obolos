import { describe, expect, it } from 'vitest';
import { formatMarketPrice, parseMarketPrice } from '@/components/platform/marketplace';

describe('marketplace price controls', () => {
  it('preserves exact micro-USDC values within the listing bounds', () => {
    expect(parseMarketPrice('0.001')).toBe(1_000);
    expect(parseMarketPrice('0.060001')).toBe(60_001);
    expect(parseMarketPrice('1')).toBe(1_000_000);
    expect(formatMarketPrice(60_001)).toBe('0.060001');
  });

  it('rejects prices outside the listing bounds or with ambiguous precision', () => {
    for (const value of ['0', '0.000999', '1.000001', '1e-3', '.1', ' 0.1', '']) {
      expect(() => parseMarketPrice(value), value).toThrow();
    }
  });
});
