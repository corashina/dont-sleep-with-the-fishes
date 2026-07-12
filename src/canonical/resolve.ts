import type { IntegerValue, RandomReader, Sourced, Weighted } from './types';

export const resolved = <T>(entry: Sourced<T>): Sourced<T> => ({ ...entry });
export const resolveInteger = (value: IntegerValue, random: RandomReader): number =>
  typeof value === 'number' ? value : value.min + Math.floor(random.next() * (value.max - value.min + 1));
export function drawWeighted<T>(entries: readonly Weighted<T>[], random: RandomReader): T {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = random.next() * total;
  for (const entry of entries) {
    if (roll < entry.weight) return entry.value;
    roll -= entry.weight;
  }
  return entries[entries.length - 1]!.value;
}
