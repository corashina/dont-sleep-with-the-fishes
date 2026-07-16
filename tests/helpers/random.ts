import type { RandomSource } from '../../src/survival/survivalTypes';

export function sequenceRandom(values: readonly number[]): RandomSource {
  let index = 0;
  return {
    next(): number {
      const raw = values.length === 0 ? 0 : values[index++ % values.length]!;
      return Math.min(0.999999, Math.max(0, raw));
    },
  };
}
