import { describe, expect, it } from 'vitest';
import { drawWeighted, resolveInteger, resolved } from '../src/canonical/resolve';
import { validateRange, validateWeights } from '../src/canonical/validate';

describe('canonical primitives', () => {
  it('resolves provenance without losing it', () => {
    expect(resolved({ value: 35, provenance: 'wiki', source: 'events' }))
      .toEqual({ value: 35, provenance: 'wiki', source: 'events' });
  });

  it('samples inclusive integer boundaries', () => {
    expect(resolveInteger({ min: 5, max: 10 }, { next: () => 0 })).toBe(5);
    expect(resolveInteger({ min: 5, max: 10 }, { next: () => 0.999999 })).toBe(10);
  });

  it('treats weights as relative values', () => {
    const values = [{ weight: 80, value: 'safe' }, { weight: 20, value: 'hurt' }] as const;
    expect(drawWeighted(values, { next: () => 0.799999 })).toBe('safe');
    expect(drawWeighted(values, { next: () => 0.8 })).toBe('hurt');
  });

  it('rejects reversed ranges and empty or negative weight groups', () => {
    expect(() => validateRange({ min: 10, max: 5 }, 'damage')).toThrow(/damage.*range/i);
    expect(() => validateWeights([], 'outcomes')).toThrow(/outcomes.*empty/i);
    expect(() => validateWeights([{ weight: -1 }], 'outcomes')).toThrow(/negative/i);
  });
});
