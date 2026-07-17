import { describe, it, expect } from 'vitest';
import { makeRng } from '../src/assets/rng';

describe('makeRng', () => {
  it('is deterministic for a given seed', () => {
    const a = makeRng(42);
    const b = makeRng(42);
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it('range/int/pick/chance behave within bounds', () => {
    const r = makeRng(7);
    for (let i = 0; i < 100; i++) {
      const x = r.range(2, 5);
      expect(x).toBeGreaterThanOrEqual(2);
      expect(x).toBeLessThan(5);
      const n = r.int(1, 3);
      expect([1, 2, 3]).toContain(n);
    }
    expect(r.pick([9])).toBe(9);
    expect(typeof r.chance(0.5)).toBe('boolean');
  });
});
