import type { RandomSource } from './survivalTypes';

export class Mulberry32Random implements RandomSource {
  constructor(private value: number) {
    this.value >>>= 0;
  }

  next(): number {
    this.value = (this.value + 0x6D2B79F5) >>> 0;
    let mixed = this.value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  }

  exportState(): number {
    return this.value;
  }
}

export function mulberry32(seed: number): Mulberry32Random {
  return new Mulberry32Random(seed);
}

export function restoreMulberry32(state: number): Mulberry32Random {
  return new Mulberry32Random(state);
}
