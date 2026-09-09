import { catchLabel } from '../i18n/itemMessages';
import {
  ITEM_DEFINITIONS,
  ITEM_IDS,
  type ItemId,
} from '../game/ItemState';
import type { ItemCondition } from './survivalTypes';
import { SURVIVAL_BALANCE } from './survivalBalance';

export type FishingCatchId =
  | 'cod' | 'salmon' | 'tuna' | 'crab' | 'squid'
  | 'sardine' | 'bass' | 'redSnapper' | 'clownfish'
  | 'blowfish' | 'fish' | 'goldfish' | 'trout' | 'kingfish' | 'piranha' | 'crayfish' | 'halibut'
  | 'brokenCan' | 'crushedCan' | 'backpack'
  | 'seaweed' | 'boot' | 'plasticBottle' | 'fishBones'
  | 'bait' | 'wetDuctTape' | 'brokenCompass' | 'tornFishingNet' | 'energyBar';

export type FishingCatchKind = 'fish' | 'junk' | 'utility';
export type FishingGear = 'rod' | 'net';
export type FishingCatchSize = 'small' | 'large' | 'junk' | 'utility';
export type FishingModelFamily =
  | 'ordinaryFish' | 'crab' | 'squid' | 'seaweed' | 'boot' | 'bottle' | 'fishBones';
export type FishingItemCondition = Extract<ItemCondition, 'usable' | 'broken'>;

export interface FishingAppearance {
  readonly color: number;
  readonly accentColor: number;
  readonly length: number;
  readonly height: number;
  readonly width: number;
}

export type FishingCatchReward =
  | { readonly kind: 'backpack' }
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
  | { readonly kind: 'model' }
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

const catalogRows: readonly Omit<FishingCatchDefinition, 'label'>[] = [
  { id: 'cod', kind: 'fish', baseWeight: 20, minimumDay: 0, reward: { kind: 'food', amount: 1 }, size: 'small', presentation: fishing('ordinaryFish', { color: 0x8ca6ad, accentColor: 0xe6dfc9, length: 1.05, height: 0.34, width: 0.28 }) },
  { id: 'salmon', kind: 'fish', baseWeight: 24, minimumDay: 0, reward: { kind: 'food', amount: 1 }, size: 'small', presentation: fishing('ordinaryFish', { color: 0xd4775b, accentColor: 0x3f6d83, length: 1.1, height: 0.36, width: 0.3 }) },
  { id: 'tuna', kind: 'fish', baseWeight: 5, minimumDay: 3, reward: { kind: 'food', amount: 2 }, size: 'large', presentation: fishing('ordinaryFish', { color: 0x3e6f87, accentColor: 0xcbd6d5, length: 1.65, height: 0.55, width: 0.48 }) },
  { id: 'crab', kind: 'fish', baseWeight: 14, minimumDay: 2, reward: { kind: 'food', amount: 1 }, size: 'small', presentation: fishing('crab', { color: 0xa74e38, accentColor: 0xe7a45d, length: 0.78, height: 0.42, width: 0.7 }) },
  { id: 'squid', kind: 'fish', baseWeight: 7, minimumDay: 3, reward: { kind: 'food', amount: 2 }, size: 'large', presentation: fishing('squid', { color: 0xb7a6c8, accentColor: 0x604977, length: 1.45, height: 0.62, width: 0.38 }) },
  { id: 'sardine', kind: 'fish', baseWeight: 45, minimumDay: 0, reward: { kind: 'food', amount: 1 }, size: 'small', presentation: fishing('ordinaryFish', { color: 0x7593ae, accentColor: 0xd0d8d4, length: 0.68, height: 0.22, width: 0.18 }) },
  { id: 'bass', kind: 'fish', baseWeight: 30, minimumDay: 0, reward: { kind: 'food', amount: 1 }, size: 'small', presentation: fishing('ordinaryFish', { color: 0x5c7a42, accentColor: 0xd6bb68, length: 0.525, height: 0.18, width: 0.15 }) },
  { id: 'redSnapper', kind: 'fish', baseWeight: 20, minimumDay: 0, reward: { kind: 'food', amount: 1 }, size: 'small', presentation: fishing('ordinaryFish', { color: 0xc95045, accentColor: 0xf0b08a, length: 0.95, height: 0.32, width: 0.27 }) },
  { id: 'clownfish', kind: 'fish', baseWeight: 1, minimumDay: 0, reward: { kind: 'food', amount: 1 }, size: 'small', presentation: fishing('ordinaryFish', { color: 0xe8803d, accentColor: 0xf4f0d3, length: 0.58, height: 0.24, width: 0.18 }) },
  { id: 'seaweed', kind: 'junk', baseWeight: 82, minimumDay: 0, reward: { kind: 'none' }, size: 'junk', presentation: fishing('seaweed', { color: 0x456e4b, accentColor: 0x8daa5d, length: 0.31, height: 0.475, width: 0.11 }) },
  { id: 'boot', kind: 'junk', baseWeight: 72, minimumDay: 0, reward: { kind: 'none' }, size: 'junk', presentation: fishing('boot', { color: 0x5b4637, accentColor: 0x2f2926, length: 0.36, height: 0.38, width: 0.18 }) },
  { id: 'plasticBottle', kind: 'junk', baseWeight: 60, minimumDay: 0, reward: { kind: 'none' }, size: 'junk', presentation: fishing('bottle', { color: 0x507b82, accentColor: 0xc7d7c7, length: 0.15, height: 0.43, width: 0.15 }) },
  { id: 'fishBones', kind: 'junk', baseWeight: 16, minimumDay: 0, reward: { kind: 'none' }, size: 'junk', presentation: fishing('fishBones', { color: 0xd8d0b8, accentColor: 0x756b5f, length: 0.44, height: 0.21, width: 0.09 }) },
  { id: 'bait', kind: 'utility', baseWeight: 5, minimumDay: 0, reward: { kind: 'bait', amount: 1 }, size: 'utility', presentation: { kind: 'item', itemId: 'baitTin', condition: 'usable' } },
  { id: 'wetDuctTape', kind: 'utility', baseWeight: 5, minimumDay: 3, reward: { kind: 'item', itemId: 'ductTape', condition: 'usable', unique: true }, size: 'utility', presentation: { kind: 'item', itemId: 'ductTape', condition: 'usable' } },
  { id: 'brokenCompass', kind: 'utility', baseWeight: 5, minimumDay: 0, reward: { kind: 'item', itemId: 'compass', condition: 'broken', unique: true }, size: 'utility', presentation: { kind: 'item', itemId: 'compass', condition: 'broken' } },
  { id: 'tornFishingNet', kind: 'utility', baseWeight: 3, minimumDay: 0, reward: { kind: 'item', itemId: 'fishingNet', condition: 'broken', unique: true }, size: 'utility', presentation: { kind: 'item', itemId: 'fishingNet', condition: 'broken' } },
  { id: 'energyBar', kind: 'utility', baseWeight: 8, minimumDay: 0, reward: { kind: 'item', itemId: 'energyBar', condition: 'usable', unique: true }, size: 'utility', presentation: { kind: 'item', itemId: 'energyBar', condition: 'usable' } },
  { id: 'blowfish', kind: 'fish', baseWeight: 8, minimumDay: 0, reward: { kind: 'food', amount: 1 }, size: 'small', presentation: { kind: 'model' } },
  { id: 'fish', kind: 'fish', baseWeight: 20, minimumDay: 0, reward: { kind: 'food', amount: 1 }, size: 'small', presentation: { kind: 'model' } },
  { id: 'goldfish', kind: 'fish', baseWeight: 2, minimumDay: 0, reward: { kind: 'food', amount: 1 }, size: 'small', presentation: { kind: 'model' } },
  { id: 'trout', kind: 'fish', baseWeight: 24, minimumDay: 0, reward: { kind: 'food', amount: 1 }, size: 'small', presentation: { kind: 'model' } },
  { id: 'kingfish', kind: 'fish', baseWeight: 5, minimumDay: 3, reward: { kind: 'food', amount: 2 }, size: 'large', presentation: { kind: 'model' } },
  { id: 'piranha', kind: 'fish', baseWeight: 7, minimumDay: 0, reward: { kind: 'food', amount: 1 }, size: 'small', presentation: { kind: 'model' } },
  { id: 'crayfish', kind: 'fish', baseWeight: 14, minimumDay: 2, reward: { kind: 'food', amount: 1 }, size: 'small', presentation: { kind: 'model' } },
  { id: 'halibut', kind: 'fish', baseWeight: 5, minimumDay: 3, reward: { kind: 'food', amount: 2 }, size: 'large', presentation: { kind: 'model' } },
  { id: 'brokenCan', kind: 'junk', baseWeight: 36, minimumDay: 0, reward: { kind: 'none' }, size: 'junk', presentation: { kind: 'model' } },
  { id: 'crushedCan', kind: 'junk', baseWeight: 36, minimumDay: 0, reward: { kind: 'none' }, size: 'junk', presentation: { kind: 'model' } },
  { id: 'backpack', kind: 'utility', baseWeight: 1, minimumDay: 0, reward: { kind: 'backpack' }, size: 'utility', presentation: { kind: 'model' } },
];

function isKnownItemId(value: unknown): value is ItemId {
  return typeof value === 'string'
    && Object.prototype.hasOwnProperty.call(ITEM_DEFINITIONS, value);
}

function isFishingItemCondition(value: unknown): value is FishingItemCondition {
  return value === 'usable' || value === 'broken';
}

function validateFishContract(catchDefinition: FishingCatchDefinition): void {
  const { id, reward, size, presentation } = catchDefinition;
  if (reward.kind !== 'food') throw new Error(`${id} fish must award food`);
  if (reward.amount !== 1 && reward.amount !== 2) {
    throw new Error(`${id} fish food reward must be one or two`);
  }
  if (size !== 'small' && size !== 'large') {
    throw new Error(`${id} fish size must be small or large`);
  }
  if (presentation.kind === 'item') {
    throw new Error(`${id} fish must use a fishing presentation`);
  }
}

function validateJunkContract(catchDefinition: FishingCatchDefinition): void {
  const { id, reward, size, presentation } = catchDefinition;
  if (reward.kind !== 'none') throw new Error(`${id} junk reward must be none`);
  if (size !== 'junk') throw new Error(`${id} junk size must be junk`);
  if (presentation.kind === 'item') {
    throw new Error(`${id} junk must use a fishing presentation`);
  }
}

function validateUtilityContract(catchDefinition: FishingCatchDefinition): void {
  const { id, reward, size, presentation } = catchDefinition;
  if (reward.kind !== 'bait' && reward.kind !== 'item') {
    throw new Error(`${id} utility reward must be bait or item`);
  }
  if (reward.kind === 'bait' && reward.amount !== 1) {
    throw new Error(`${id} utility bait reward must be one`);
  }
  if (reward.kind === 'item' && reward.unique !== true) {
    throw new Error(`${id} item reward unique must be true`);
  }
  if (size !== 'utility') throw new Error(`${id} utility size must be utility`);
  if (presentation.kind !== 'item') {
    throw new Error(`${id} utility must use an item presentation`);
  }
}

function validateBackpackContract({ reward, size, presentation }: FishingCatchDefinition): void {
  if (reward.kind !== 'backpack' || size !== 'utility' || presentation.kind !== 'model') {
    throw new Error('Backpack must use a model and a backpack reward.');
  }
}

function validateCatchContract(catchDefinition: FishingCatchDefinition): void {
  if (catchDefinition.id === 'backpack') return validateBackpackContract(catchDefinition);
  if (catchDefinition.kind === 'fish') return validateFishContract(catchDefinition);
  if (catchDefinition.kind === 'junk') return validateJunkContract(catchDefinition);
  if (catchDefinition.kind === 'utility') return validateUtilityContract(catchDefinition);
  throw new Error(`Invalid fishing catch kind: ${catchDefinition.id}`);
}

function validatePresentation(catchDefinition: FishingCatchDefinition): void {
  const { id, presentation, reward } = catchDefinition;
  if (presentation.kind === 'model') return;
  if (presentation.kind === 'fishing') {
    const { length, height, width } = presentation.appearance;
    if (![length, height, width].every((dimension) => Number.isFinite(dimension) && dimension > 0)) {
      throw new Error(`Invalid fishing catch dimensions: ${id}`);
    }
    return;
  }
  if (!isKnownItemId(presentation.itemId)) {
    throw new Error(`${id} references unknown presentation item ${String(presentation.itemId)}`);
  }
  if (!isFishingItemCondition(presentation.condition)) {
    throw new Error(`${id} has an invalid presentation item condition`);
  }
  if (reward.kind === 'bait'
    && (presentation.itemId !== 'baitTin' || presentation.condition !== 'usable')) {
    throw new Error(`${id} bait presentation must be usable baitTin`);
  }
}

function validateItemReward(catchDefinition: FishingCatchDefinition): void {
  const { id, reward, presentation } = catchDefinition;
  if (reward.kind !== 'item') return;
  const { itemId, condition } = reward;
  if (!isKnownItemId(itemId)) {
    throw new Error(`${id} references unknown reward item ${String(itemId)}`);
  }
  if (!isFishingItemCondition(condition)) {
    throw new Error(`${id} has an invalid reward item condition`);
  }
  if (presentation.kind !== 'item') {
    throw new Error(`${id} item reward requires an item presentation`);
  }
  if (itemId !== presentation.itemId) {
    throw new Error(`${id} reward and presentation item IDs must match`);
  }
  if (condition !== presentation.condition) {
    throw new Error(`${id} reward and presentation conditions must match`);
  }
  if (condition === 'broken' && !ITEM_DEFINITIONS[itemId].breakable) {
    throw new Error(`${itemId} fishing reward must reference a breakable item`);
  }
}

function validateCatalogRow(catchDefinition: FishingCatchDefinition): void {
  if (!Number.isFinite(catchDefinition.baseWeight) || catchDefinition.baseWeight <= 0) {
    throw new Error(`Invalid fishing catch weight: ${catchDefinition.id}`);
  }
  if (!Number.isInteger(catchDefinition.minimumDay) || catchDefinition.minimumDay < 0) {
    throw new Error(`Invalid fishing minimum day: ${catchDefinition.id}`);
  }
  validateCatchContract(catchDefinition);
  validatePresentation(catchDefinition);
  validateItemReward(catchDefinition);
}

export function validateCatalog(catches: readonly FishingCatchDefinition[]): void {
  const ids = new Set<FishingCatchId>();
  for (const catchDefinition of catches) {
    if (ids.has(catchDefinition.id)) throw new Error(`Duplicate fishing catch id: ${catchDefinition.id}`);
    ids.add(catchDefinition.id);
    validateCatalogRow(catchDefinition);
  }
}



export const FISHING_CATCHES: readonly FishingCatchDefinition[] = Object.freeze(catalogRows.map((catchDefinition) => Object.freeze({
  ...catchDefinition,
  get label() { return catchLabel(catchDefinition.id); },
  reward: Object.freeze({ ...catchDefinition.reward }),
  presentation: Object.freeze(catchDefinition.presentation.kind === 'fishing'
    ? { ...catchDefinition.presentation, appearance: Object.freeze({ ...catchDefinition.presentation.appearance }) }
    : { ...catchDefinition.presentation }),
})));

validateCatalog(FISHING_CATCHES);

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

function catchWeight(
  catchDefinition: FishingCatchDefinition,
  capturedBait: boolean,
  fishWeightMultiplier: number,
  gear: FishingGear,
): number {
  const baited = baitWeight(catchDefinition, capturedBait);
  let weight = catchDefinition.kind === 'fish' ? baited * fishWeightMultiplier : baited;
  if (gear === 'net') {
    if (catchDefinition.kind === 'junk') weight *= SURVIVAL_BALANCE.netFishing.junkWeight;
    if (catchDefinition.size === 'large') weight *= SURVIVAL_BALANCE.netFishing.largeFishWeight;
    if (catchDefinition.reward.kind === 'bait'
      || (catchDefinition.reward.kind === 'item' && catchDefinition.reward.condition === 'usable')) {
      weight *= SURVIVAL_BALANCE.netFishing.usableItemWeight;
    }
  }
  return weight;
}

const BACKPACK_ITEM_IDS = ITEM_IDS.filter((id) => ITEM_DEFINITIONS[id].weight === 1);

function missingBackpackItems(activeItemIds: ReadonlySet<ItemId>): readonly ItemId[] {
  return BACKPACK_ITEM_IDS.filter((id) => !activeItemIds.has(id));
}

function resolveBackpackCatch(
  definition: FishingCatchDefinition,
  activeItemIds: ReadonlySet<ItemId>,
  roll: number,
): FishingCatchDefinition {
  const candidates = missingBackpackItems(activeItemIds);
  const itemId = candidates[Math.min(candidates.length - 1, Math.floor(roll * candidates.length))]!;
  return Object.freeze({
    ...definition,
    get label() { return catchLabel('backpack'); },
    reward: Object.freeze({ kind: 'item', itemId, condition: 'usable', unique: true }),
  });
}

function validateFishWeightMultiplier(fishWeightMultiplier: number): void {
  if (!Number.isFinite(fishWeightMultiplier) || fishWeightMultiplier <= 0) {
    throw new RangeError('Fish weight multiplier must be finite and greater than zero.');
  }
}

export function eligibleFishingCatches(
  day: number,
  capturedBait: boolean,
  activeItemIds: ReadonlySet<ItemId> = new Set(),
  fishWeightMultiplier: number = 1,
  gear: FishingGear = 'rod',
): readonly WeightedFishingCatch[] {
  validateFishWeightMultiplier(fishWeightMultiplier);
  const entries: WeightedFishingCatch[] = FISHING_CATCHES
    .filter((catchDefinition) => catchDefinition.reward.kind !== 'backpack')
    .filter((catchDefinition) => catchDefinition.minimumDay <= day)
    .filter((catchDefinition) => !isBlockedUniqueReward(catchDefinition, activeItemIds))
    .map((catchDefinition) => Object.freeze({
      catch: catchDefinition,
      weight: catchWeight(catchDefinition, capturedBait, fishWeightMultiplier, gear),
    }));
  if (missingBackpackItems(activeItemIds).length > 0) {
    const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
    const chance = gear === 'net' ? SURVIVAL_BALANCE.netFishing.backpackChance : SURVIVAL_BALANCE.fishing.backpackChance;
    entries.push(Object.freeze({
      catch: FISHING_CATCHES.find(({ id }) => id === 'backpack')!,
      weight: total * chance / (1 - chance),
    }));
  }
  return entries;
}

export function selectFishingCatch(
  day: number,
  capturedBait: boolean,
  roll: number,
  activeItemIds: ReadonlySet<ItemId> = new Set(),
  fishWeightMultiplier: number = 1,
  gear: FishingGear = 'rod',
): FishingCatchDefinition {
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw new RangeError('Fishing roll must be finite and in [0, 1).');
  const eligible = eligibleFishingCatches(day, capturedBait, activeItemIds, fishWeightMultiplier, gear);
  const backpack = eligible.find((entry) => entry.catch.id === 'backpack');
  const backpackChance = gear === 'net' ? SURVIVAL_BALANCE.netFishing.backpackChance : SURVIVAL_BALANCE.fishing.backpackChance;
  const backpackStart = 1 - backpackChance;
  if (backpack && roll >= backpackStart) {
    return resolveBackpackCatch(backpack.catch, activeItemIds, (roll - backpackStart) / backpackChance);
  }
  const totalWeight = eligible.reduce((sum, entry) => sum + entry.weight, 0);
  let threshold = roll * totalWeight;
  for (const entry of eligible) {
    threshold -= entry.weight;
    if (threshold < 0) return entry.catch;
  }
  throw new Error('No eligible fishing catches.');
}
