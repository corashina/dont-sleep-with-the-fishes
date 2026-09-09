import type { ItemId } from '../../src/game/ItemState';
import { eligibleFishingCatches, type FishingCatchId } from '../../src/survival/fishingCatalog';

/** Select a catch for integration tests without pinning the entire loot table. */
export function fishingRoll(
  catchId: FishingCatchId,
  day = 0,
  bait = false,
  present: ReadonlySet<ItemId> = new Set(),
  multiplier = 1,
): number {
  const entries = eligibleFishingCatches(day, bait, present, multiplier);
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let lower = 0;
  for (const entry of entries) {
    if (entry.catch.id === catchId) return (lower + entry.weight / 2) / total;
    lower += entry.weight;
  }
  throw new Error(`Ineligible test catch: ${catchId}`);
}
