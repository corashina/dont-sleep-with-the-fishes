import type { RandomSource } from '../survival/survivalTypes';

export type Provenance = 'wiki' | 'preserved' | 'default';
export interface Sourced<T> { value: T; provenance: Provenance; source: string; note?: string }
export interface IntegerRange { min: number; max: number }
export interface Weighted<T> { weight: number; value: T }
export type IntegerValue = number | IntegerRange;
export type RandomReader = Pick<RandomSource, 'next'>;

export const source = <T>(value: T, provenance: Provenance, sourceId: string, note?: string): Sourced<T> =>
  ({ value, provenance, source: sourceId, note });
