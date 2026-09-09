import { ITEM_DEFINITIONS, type ItemId } from '../game/ItemState';
import type { DriftingSupplyKind } from './driftingSupplies';
import type { RandomSource, RewardEntry, WeightedEventOutcome } from './survivalTypes';

interface LootPool {
  readonly supplies: readonly [number, number, number];
  readonly common: readonly (readonly [ItemId, number])[];
  readonly valuable: readonly (readonly [ItemId, number])[];
}

export const DRIFTING_LOOT_POOLS: Readonly<Record<DriftingSupplyKind, LootPool>> = {
  barrel: {
    supplies: [30, 20, 50],
    common: [['ductTape', 20], ['energyBar', 25]],
    valuable: [],
  },
  lifeboat: {
    supplies: [25, 15, 60],
    common: [['energyBar', 20]],
    valuable: [['map', 15], ['compass', 15], ['spyglass', 10], ['flashlight', 10],
      ['medicalKit', 10], ['umbrella', 10], ['swimRing', 5]],
  },
  container: {
    supplies: [30, 30, 40],
    common: [],
    valuable: [['fishingNet', 20], ['spyglass', 15], ['flashlight', 15],
      ['scubaSet', 10], ['medicalKit', 10], ['radio', 10],
      ['flareGun', 5], ['shotgun', 5], ['anchor', 5]],
  },
  debris: {
    supplies: [20, 35, 45],
    common: [['ductTape', 15]],
    valuable: [['knife', 20], ['bucket', 15], ['flashlight', 15],
      ['medicalKit', 10], ['anchor', 5]],
  },
};

function drawItem(
  pool: LootPool['valuable'],
  owned: ReadonlySet<ItemId>,
  random: RandomSource,
): ItemId | null {
  const total = pool.reduce((sum, [, weight]) => sum + weight, 0);
  const roll = random.next() * 100;
  if (roll >= total) return null;
  const eligible = pool.filter(([id]) => !ITEM_DEFINITIONS[id].durable || !owned.has(id));
  const eligibleTotal = eligible.reduce((sum, [, weight]) => sum + weight, 0);
  if (eligibleTotal === 0) return null;
  let boundary = 0;
  for (const [id, weight] of eligible) {
    boundary += weight;
    if (roll / total * eligibleTotal < boundary) return id;
  }
  throw new Error('Drifting loot roll is outside the reward pool.');
}

export function drawDriftingLoot(
  kind: DriftingSupplyKind,
  owned: ReadonlySet<ItemId>,
  random: RandomSource,
): readonly RewardEntry[] {
  const pool = DRIFTING_LOOT_POOLS[kind];
  const roll = random.next() * 100;
  const food = roll < pool.supplies[0] || roll >= pool.supplies[0] + pool.supplies[1];
  const bait = roll >= pool.supplies[0];
  const rewards: RewardEntry[] = [];
  if (food) rewards.push({ kind: 'resource', id: 'food', quantity: 1 + Math.floor(random.next() * 3) });
  if (bait) rewards.push({ kind: 'resource', id: 'bait', quantity: 1 + Math.floor(random.next() * 3) });
  const common = drawItem(pool.common, owned, random);
  const valuable = drawItem(pool.valuable, owned, random);
  if (common !== null) rewards.push({ kind: 'item', id: common, quantity: 1 });
  if (valuable !== null) rewards.push({ kind: 'item', id: valuable, quantity: 1 });
  return rewards;
}

export function driftingLootEffects(
  rewards: readonly RewardEntry[],
): WeightedEventOutcome['effects'] {
  return {
    resources: rewards.flatMap((reward) => reward.kind === 'resource'
      ? [{ resource: reward.id, operation: 'add' as const, value: reward.quantity }] : []),
    items: rewards.flatMap((reward) => reward.kind === 'item'
      ? [{ kind: 'gain' as const, itemId: reward.id, quantity: 1 as const, fallbackFood: 1 as const }] : []),
  };
}
