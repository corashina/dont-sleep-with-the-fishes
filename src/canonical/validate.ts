import type { IntegerRange } from './types';

export function validateRange(range: IntegerRange, path: string): void {
  if (!Number.isInteger(range.min) || !Number.isInteger(range.max) || range.min > range.max) {
    throw new Error(`${path} has an invalid integer range`);
  }
}
export function validateWeights(entries: readonly { weight: number }[], path: string): void {
  if (entries.length === 0) throw new Error(`${path} is empty`);
  if (entries.some(({ weight }) => !Number.isFinite(weight) || weight < 0)) {
    throw new Error(`${path} contains a negative or invalid weight`);
  }
  if (entries.every(({ weight }) => weight === 0)) throw new Error(`${path} has no selectable weight`);
}
