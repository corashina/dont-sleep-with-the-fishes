import type { RandomSource } from './survivalTypes';

export function mulberry32(seed: number): RandomSource {
  let value = seed >>> 0;
  return {
    next(): number {
      value += 0x6D2B79F5;
      let mixed = value;
      mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
      mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
      return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    },
  };
}

export function sequenceRandom(values: readonly number[]): RandomSource {
  let index = 0;
  return {
    next(): number {
      const raw = values.length === 0 ? 0 : values[index++ % values.length]!;
      return Math.min(0.999999, Math.max(0, raw));
    },
  };
}
