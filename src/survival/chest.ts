import { ITEM_DEFINITIONS, ITEM_IDS, type ItemId } from '../game/ItemState';
import type { RandomSource } from './survivalTypes';

export const CHEST_MIMIC_MIN_NIGHTS = 2;
export const CHEST_MIMIC_CHANCE = 0.35;

export type ChestReward =
  | { readonly kind: 'item'; readonly itemId: ItemId }
  | {
      readonly kind: 'resource';
      readonly resource: 'food' | 'bait';
      readonly quantity: number;
    };

interface WeightedChestReward {
  readonly weight: number;
  readonly reward: ChestReward;
}

const DURABLE_REWARDS = ITEM_IDS.filter((id) => (
  ITEM_DEFINITIONS[id].durable && id !== 'carlitos'
));

export function drawChestReward(
  activeItemIds: ReadonlySet<ItemId>,
  random: RandomSource,
): ChestReward {
  const entries: WeightedChestReward[] = DURABLE_REWARDS
    .filter((id) => !activeItemIds.has(id))
    .map((itemId) => ({ weight: 4, reward: { kind: 'item', itemId } }));
  entries.push({
    weight: activeItemIds.has('ductTape') ? 2 : 4,
    reward: { kind: 'item', itemId: 'ductTape' },
  });
  if (!activeItemIds.has('energyBar')) {
    entries.push({ weight: 2, reward: { kind: 'item', itemId: 'energyBar' } });
  }
  if (entries.length === 0) {
    return { kind: 'resource', resource: 'food', quantity: 2 };
  }
  entries.push(
    { weight: 3, reward: { kind: 'resource', resource: 'food', quantity: 2 } },
    { weight: 2, reward: { kind: 'resource', resource: 'bait', quantity: 2 } },
  );

  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  const randomValue = random.next();
  const finiteRoll = Number.isFinite(randomValue) ? randomValue : 0;
  const roll = Math.min(0.999999, Math.max(0, finiteRoll)) * total;
  let boundary = 0;
  for (const entry of entries) {
    boundary += entry.weight;
    if (roll < boundary) return entry.reward;
  }
  return entries[entries.length - 1]!.reward;
}

export function shouldBecomeMimic(
  acquiredDay: number,
  currentDay: number,
  random: RandomSource,
): boolean {
  if (currentDay - acquiredDay < CHEST_MIMIC_MIN_NIGHTS) return false;
  return random.next() < CHEST_MIMIC_CHANCE;
}
