import { FISHING_CATCHES, eligibleCatches, type FishingCatchDefinition } from '../canonical/fishing';
import { drawWeighted } from '../canonical/resolve';
import type { RandomSource } from './survivalTypes';

export interface FishingResult extends Omit<FishingCatchDefinition, 'weight' | 'minDay'> {}

export function resolveFishing(day: number, useBait: boolean, random: RandomSource): FishingResult {
  const pool = eligibleCatches(day);
  const selected = drawWeighted(
    pool.map((entry) => ({ weight: entry.weight, value: entry })),
    random,
  );
  return {
    id: selected.id,
    label: selected.label,
    food: selected.food,
    ...(selected.itemGain === undefined ? {} : { itemGain: selected.itemGain }),
    ...(selected.itemCondition === undefined ? {} : { itemCondition: selected.itemCondition }),
    consumesBait: useBait && selected.consumesBait,
  };
}

export { FISHING_CATCHES };
