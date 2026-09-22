import type { ItemId } from '../../src/game/ItemState';
import type { FishingSession } from '../../src/survival/FishingSession';
import { SURVIVAL_BALANCE } from '../../src/survival/survivalBalance';
import { eligibleFishingCatches, type FishingCatchId } from '../../src/survival/fishingCatalog';

/** A skilled player counters the visible displacement each frame. */
export function landFishingCatch(attempt: FishingSession): void {
  for (let frame = 0; frame < 250 && attempt.view().state === 'fighting'; frame++) {
    attempt.counterPull(-attempt.view().fishOffset / SURVIVAL_BALANCE.fishing.mousePullPerPixel);
    attempt.advance(1 / 60);
  }
}

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
