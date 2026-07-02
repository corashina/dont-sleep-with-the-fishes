import { describe, it, expect } from 'vitest';
import { Rng, weightedPick } from '../src/utils/rng';

describe('rng', () => {
  it('is deterministic for a seed', () => {
    const a = new Rng(42).next();
    const b = new Rng(42).next();
    expect(a).toBe(b);
  });
  it('produces values in [0,1)', () => {
    const r = new Rng(1);
    for (let i = 0; i < 100; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it('weightedPick returns fallbackIndex when all weights are 0', () => {
    const rng = new Rng(5);
    const items = [{ w: 0 }, { w: 0 }];
    expect(weightedPick(rng, items.map((i) => ({ weight: i.w })), 1)).toBe(1);
  });
  it('weightedPick selects the only weighted item', () => {
    const rng = new Rng(5);
    const idx = weightedPick(rng, [{ weight: 0 }, { weight: 1 }], 0);
    expect(idx).toBe(1);
  });
});
