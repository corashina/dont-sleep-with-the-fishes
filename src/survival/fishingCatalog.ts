import {
  ITEM_DEFINITIONS,
  type ItemId,
} from '../game/ItemState';
import type { ItemCondition } from './survivalTypes';

export type FishingCatchId =
  | 'cod' | 'salmon' | 'tuna' | 'crab' | 'squid'
  | 'sardine' | 'bass' | 'redSnapper' | 'clownfish'
  | 'seaweed' | 'boot' | 'plasticBottle'
  | 'bait' | 'wetDuctTape' | 'brokenCompass' | 'tornFishingNet' | 'energyBar';

export type FishingCatchKind = 'fish' | 'junk' | 'utility';
export type FishingCatchSize = 'small' | 'large' | 'junk' | 'utility';
export type FishingModelFamily =
  | 'ordinaryFish' | 'crab' | 'squid' | 'seaweed' | 'boot' | 'bottle';
export type FishingItemCondition = Extract<ItemCondition, 'usable' | 'broken'>;

export interface FishingAppearance {
  readonly color: number;
  readonly accentColor: number;
  readonly length: number;
  readonly height: number;
  readonly width: number;
}

export type FishingCatchReward =
  | { readonly kind: 'food'; readonly amount: 1 | 2 }
  | { readonly kind: 'bait'; readonly amount: 1 }
  | {
      readonly kind: 'item';
      readonly itemId: ItemId;
      readonly condition: FishingItemCondition;
      readonly unique: true;
    }
  | { readonly kind: 'none' };

export type FishingCatchPresentation =
  | {
      readonly kind: 'fishing';
      readonly family: FishingModelFamily;
      readonly appearance: FishingAppearance;
    }
  | {
      readonly kind: 'item';
      readonly itemId: ItemId;
      readonly condition: FishingItemCondition;
    };

export interface FishingCatchDefinition {
  readonly id: FishingCatchId;
  readonly label: string;
  readonly kind: FishingCatchKind;
  readonly baseWeight: number;
  readonly minimumDay: number;
  readonly reward: FishingCatchReward;
  readonly size: FishingCatchSize;
  readonly presentation: FishingCatchPresentation;
}

export interface WeightedFishingCatch {
  readonly catch: FishingCatchDefinition;
  readonly weight: number;
}

const fishing = (family: FishingModelFamily, appearance: FishingAppearance): FishingCatchPresentation => ({
  kind: 'fishing', family, appearance,
});

const catalogRows: readonly FishingCatchDefinition[] = [
  { id: 'cod', label: 'Cod', kind: 'fish', baseWeight: 20, minimumDay: 0, reward: { kind: 'food', amount: 1 }, size: 'small', presentation: fishing('ordinaryFish', { color: 0x8ca6ad, accentColor: 0xe6dfc9, length: 1.05, height: 0.34, width: 0.28 }) },
  { id: 'salmon', label: 'Salmon', kind: 'fish', baseWeight: 24, minimumDay: 0, reward: { kind: 'food', amount: 1 }, size: 'small', presentation: fishing('ordinaryFish', { color: 0xd4775b, accentColor: 0x3f6d83, length: 1.1, height: 0.36, width: 0.3 }) },
  { id: 'tuna', label: 'Tuna', kind: 'fish', baseWeight: 5, minimumDay: 3, reward: { kind: 'food', amount: 2 }, size: 'large', presentation: fishing('ordinaryFish', { color: 0x3e6f87, accentColor: 0xcbd6d5, length: 1.65, height: 0.55, width: 0.48 }) },
  { id: 'crab', label: 'Crab', kind: 'fish', baseWeight: 14, minimumDay: 2, reward: { kind: 'food', amount: 1 }, size: 'small', presentation: fishing('crab', { color: 0xa74e38, accentColor: 0xe7a45d, length: 0.78, height: 0.42, width: 0.7 }) },
  { id: 'squid', label: 'Squid', kind: 'fish', baseWeight: 7, minimumDay: 3, reward: { kind: 'food', amount: 2 }, size: 'large', presentation: fishing('squid', { color: 0xb7a6c8, accentColor: 0x604977, length: 1.45, height: 0.62, width: 0.38 }) },
  { id: 'sardine', label: 'Sardine', kind: 'fish', baseWeight: 45, minimumDay: 0, reward: { kind: 'food', amount: 1 }, size: 'small', presentation: fishing('ordinaryFish', { color: 0x7593ae, accentColor: 0xd0d8d4, length: 0.68, height: 0.22, width: 0.18 }) },
  { id: 'bass', label: 'Bass', kind: 'fish', baseWeight: 30, minimumDay: 0, reward: { kind: 'food', amount: 1 }, size: 'small', presentation: fishing('ordinaryFish', { color: 0x5c7a42, accentColor: 0xd6bb68, length: 1.05, height: 0.36, width: 0.3 }) },
  { id: 'redSnapper', label: 'Red Snapper', kind: 'fish', baseWeight: 20, minimumDay: 0, reward: { kind: 'food', amount: 1 }, size: 'small', presentation: fishing('ordinaryFish', { color: 0xc95045, accentColor: 0xf0b08a, length: 0.95, height: 0.32, width: 0.27 }) },
  { id: 'clownfish', label: 'Clownfish', kind: 'fish', baseWeight: 1, minimumDay: 0, reward: { kind: 'food', amount: 1 }, size: 'small', presentation: fishing('ordinaryFish', { color: 0xe8803d, accentColor: 0xf4f0d3, length: 0.58, height: 0.24, width: 0.18 }) },
  { id: 'seaweed', label: 'Seaweed', kind: 'junk', baseWeight: 82, minimumDay: 0, reward: { kind: 'none' }, size: 'junk', presentation: fishing('seaweed', { color: 0x456e4b, accentColor: 0x8daa5d, length: 0.62, height: 0.95, width: 0.22 }) },
  { id: 'boot', label: 'Boot', kind: 'junk', baseWeight: 72, minimumDay: 0, reward: { kind: 'none' }, size: 'junk', presentation: fishing('boot', { color: 0x5b4637, accentColor: 0x2f2926, length: 0.72, height: 0.76, width: 0.36 }) },
  { id: 'plasticBottle', label: 'Plastic Bottle', kind: 'junk', baseWeight: 60, minimumDay: 0, reward: { kind: 'none' }, size: 'junk', presentation: fishing('bottle', { color: 0x507b82, accentColor: 0xc7d7c7, length: 0.3, height: 0.86, width: 0.3 }) },
  { id: 'bait', label: 'Bait', kind: 'utility', baseWeight: 5, minimumDay: 0, reward: { kind: 'bait', amount: 1 }, size: 'utility', presentation: { kind: 'item', itemId: 'baitTin', condition: 'usable' } },
  { id: 'wetDuctTape', label: 'Wet Duct Tape', kind: 'utility', baseWeight: 5, minimumDay: 3, reward: { kind: 'item', itemId: 'ductTape', condition: 'usable', unique: true }, size: 'utility', presentation: { kind: 'item', itemId: 'ductTape', condition: 'usable' } },
  { id: 'brokenCompass', label: 'Broken Compass', kind: 'utility', baseWeight: 5, minimumDay: 0, reward: { kind: 'item', itemId: 'compass', condition: 'broken', unique: true }, size: 'utility', presentation: { kind: 'item', itemId: 'compass', condition: 'broken' } },
  { id: 'tornFishingNet', label: 'Torn Fishing Net', kind: 'utility', baseWeight: 3, minimumDay: 0, reward: { kind: 'item', itemId: 'fishingNet', condition: 'broken', unique: true }, size: 'utility', presentation: { kind: 'item', itemId: 'fishingNet', condition: 'broken' } },
  { id: 'energyBar', label: 'Energy Bar', kind: 'utility', baseWeight: 8, minimumDay: 0, reward: { kind: 'item', itemId: 'energyBar', condition: 'usable', unique: true }, size: 'utility', presentation: { kind: 'item', itemId: 'energyBar', condition: 'usable' } },
];

function isKnownItemId(value: unknown): value is ItemId {
  return typeof value === 'string'
    && Object.prototype.hasOwnProperty.call(ITEM_DEFINITIONS, value);
}

function isFishingItemCondition(value: unknown): value is FishingItemCondition {
  return value === 'usable' || value === 'broken';
}

function validateCatchContract(catchDefinition: FishingCatchDefinition): void {
  const { id, kind, reward, size, presentation } = catchDefinition;
  if (kind === 'fish') {
    if (reward.kind !== 'food') throw new Error(`${id} fish must award food`);
    if (reward.amount !== 1 && reward.amount !== 2) {
      throw new Error(`${id} fish food reward must be one or two`);
    }
    if (size !== 'small' && size !== 'large') {
      throw new Error(`${id} fish size must be small or large`);
    }
    if (presentation.kind !== 'fishing') {
      throw new Error(`${id} fish must use a fishing presentation`);
    }
  } else if (kind === 'junk') {
    if (reward.kind !== 'none') throw new Error(`${id} junk reward must be none`);
    if (size !== 'junk') throw new Error(`${id} junk size must be junk`);
    if (presentation.kind !== 'fishing') {
      throw new Error(`${id} junk must use a fishing presentation`);
    }
  } else if (kind === 'utility') {
    if (reward.kind !== 'bait' && reward.kind !== 'item') {
      throw new Error(`${id} utility reward must be bait or item`);
    }
    if (reward.kind === 'bait' && reward.amount !== 1) {
      throw new Error(`${id} utility bait reward must be one`);
    }
    if (size !== 'utility') throw new Error(`${id} utility size must be utility`);
    if (presentation.kind !== 'item') {
      throw new Error(`${id} utility must use an item presentation`);
    }
  } else {
    throw new Error(`Invalid fishing catch kind: ${id}`);
  }
}

export function validateCatalog(catches: readonly FishingCatchDefinition[]): void {
  const ids = new Set<FishingCatchId>();
  for (const catchDefinition of catches) {
    if (ids.has(catchDefinition.id)) throw new Error(`Duplicate fishing catch id: ${catchDefinition.id}`);
    ids.add(catchDefinition.id);
    if (!Number.isFinite(catchDefinition.baseWeight) || catchDefinition.baseWeight <= 0) throw new Error(`Invalid fishing catch weight: ${catchDefinition.id}`);
    if (!Number.isInteger(catchDefinition.minimumDay) || catchDefinition.minimumDay < 0) throw new Error(`Invalid fishing minimum day: ${catchDefinition.id}`);
    validateCatchContract(catchDefinition);
    if (catchDefinition.presentation.kind === 'fishing') {
      const { length, height, width } = catchDefinition.presentation.appearance;
      if (![length, height, width].every((dimension) => Number.isFinite(dimension) && dimension > 0)) throw new Error(`Invalid fishing catch dimensions: ${catchDefinition.id}`);
    } else {
      if (!isKnownItemId(catchDefinition.presentation.itemId)) {
        throw new Error(
          `${catchDefinition.id} references unknown presentation item ${String(catchDefinition.presentation.itemId)}`,
        );
      }
      if (!isFishingItemCondition(catchDefinition.presentation.condition)) {
        throw new Error(`${catchDefinition.id} has an invalid presentation item condition`);
      }
    }
    if (catchDefinition.reward.kind === 'item') {
      const { itemId, condition } = catchDefinition.reward;
      if (!isKnownItemId(itemId)) {
        throw new Error(
          `${catchDefinition.id} references unknown reward item ${String(itemId)}`,
        );
      }
      if (!isFishingItemCondition(condition)) {
        throw new Error(`${catchDefinition.id} has an invalid reward item condition`);
      }
      if (catchDefinition.presentation.kind !== 'item') {
        throw new Error(`${catchDefinition.id} item reward requires an item presentation`);
      }
      if (itemId !== catchDefinition.presentation.itemId) {
        throw new Error(`${catchDefinition.id} reward and presentation item IDs must match`);
      }
      if (condition !== catchDefinition.presentation.condition) {
        throw new Error(`${catchDefinition.id} reward and presentation conditions must match`);
      }
      if (condition === 'broken' && !ITEM_DEFINITIONS[itemId].breakable) {
        throw new Error(
          `${itemId} fishing reward must reference a breakable item`,
        );
      }
    }
  }
}

validateCatalog(catalogRows);

export const FISHING_CATCHES: readonly FishingCatchDefinition[] = Object.freeze(catalogRows.map((catchDefinition) => Object.freeze({
  ...catchDefinition,
  reward: Object.freeze({ ...catchDefinition.reward }),
  presentation: Object.freeze(catchDefinition.presentation.kind === 'fishing'
    ? { ...catchDefinition.presentation, appearance: Object.freeze({ ...catchDefinition.presentation.appearance }) }
    : { ...catchDefinition.presentation }),
})));

export function fishingCatchFood(catchDefinition: FishingCatchDefinition): 0 | 1 | 2 {
  return catchDefinition.reward.kind === 'food' ? catchDefinition.reward.amount : 0;
}

function isBlockedUniqueReward(
  catchDefinition: FishingCatchDefinition,
  activeItemIds: ReadonlySet<ItemId>,
): boolean {
  return catchDefinition.reward.kind === 'item'
    && catchDefinition.reward.unique
    && activeItemIds.has(catchDefinition.reward.itemId);
}

function baitWeight(catchDefinition: FishingCatchDefinition, capturedBait: boolean): number {
  if (!capturedBait || catchDefinition.kind !== 'fish') return catchDefinition.baseWeight;
  return catchDefinition.size === 'small' ? catchDefinition.baseWeight * 2 : catchDefinition.baseWeight * 3;
}

export function eligibleFishingCatches(
  day: number,
  capturedBait: boolean,
  activeItemIds: ReadonlySet<ItemId> = new Set(),
): readonly WeightedFishingCatch[] {
  return FISHING_CATCHES
    .filter((catchDefinition) => catchDefinition.minimumDay <= day)
    .filter((catchDefinition) => !isBlockedUniqueReward(catchDefinition, activeItemIds))
    .map((catchDefinition) => Object.freeze({ catch: catchDefinition, weight: baitWeight(catchDefinition, capturedBait) }));
}

export function selectFishingCatch(
  day: number,
  capturedBait: boolean,
  roll: number,
  activeItemIds: ReadonlySet<ItemId> = new Set(),
): FishingCatchDefinition {
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw new RangeError('Fishing roll must be finite and in [0, 1).');
  const eligible = eligibleFishingCatches(day, capturedBait, activeItemIds);
  const totalWeight = eligible.reduce((sum, entry) => sum + entry.weight, 0);
  let threshold = roll * totalWeight;
  for (const entry of eligible) {
    threshold -= entry.weight;
    if (threshold < 0) return entry.catch;
  }
  throw new Error('No eligible fishing catches.');
}

export function isFishCatch(value: FishingCatchDefinition): boolean {
  return value.kind === 'fish';
}
