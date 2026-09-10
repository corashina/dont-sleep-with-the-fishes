import {
  ITEM_DEFINITIONS,
  ITEM_IDS,
  type ItemId,
} from '../game/ItemState';
import { drawMissingItem, missingItemRewards } from './itemRewards';
import { mulberry32 } from './random';
import type { RandomSource } from './survivalTypes';

export type TraderOfferKind = 'consumable' | 'equipment';
export type TraderPaymentResource = 'food' | 'bait';
export type TraderChoiceId = `${TraderPaymentResource}-${TraderOfferKind}`;

export interface TraderOffer {
  readonly itemId: ItemId;
  readonly kind: TraderOfferKind;
  readonly price: 1 | 3;
  readonly choiceIds: readonly [TraderChoiceId, TraderChoiceId];
}

export interface NightTraderStock {
  readonly consumable: TraderOffer | null;
  readonly equipment: TraderOffer | null;
}

export interface TraderChoice {
  readonly payment: TraderPaymentResource;
  readonly kind: TraderOfferKind;
}

export const HANDYMAN_ITEM_IDS: readonly ItemId[] = Object.freeze(
  ITEM_IDS.filter((id) => id !== 'carlitos'),
);

const TRADER_CONSUMABLE_ITEM_IDS: readonly ItemId[] = Object.freeze(
  HANDYMAN_ITEM_IDS.filter((itemId) => ITEM_DEFINITIONS[itemId].charges !== null),
);

const TRADER_EQUIPMENT_ITEM_IDS: readonly ItemId[] = Object.freeze(
  HANDYMAN_ITEM_IDS.filter((itemId) => ITEM_DEFINITIONS[itemId].durable),
);

const CONSUMABLE_CHOICE_IDS = Object.freeze([
  'food-consumable',
  'bait-consumable',
]) as readonly [TraderChoiceId, TraderChoiceId];

const EQUIPMENT_CHOICE_IDS = Object.freeze([
  'food-equipment',
  'bait-equipment',
]) as readonly [TraderChoiceId, TraderChoiceId];

export function eligibleHandymanRewards(
  owned: ReadonlySet<ItemId>,
  payment: ItemId,
): readonly ItemId[] {
  return missingItemRewards(owned, handymanRewardPool(payment));
}

export function selectHandymanReward(
  owned: ReadonlySet<ItemId>,
  payment: ItemId,
  random: RandomSource,
): ItemId | null {
  return drawMissingItem(owned, handymanRewardPool(payment), random);
}

export function traderChoiceId(
  payment: TraderPaymentResource,
  kind: TraderOfferKind,
): TraderChoiceId {
  return `${payment}-${kind}`;
}

export function parseTraderChoiceId(choiceId: string): TraderChoice | null {
  switch (choiceId) {
    case 'food-consumable': return { payment: 'food', kind: 'consumable' };
    case 'bait-consumable': return { payment: 'bait', kind: 'consumable' };
    case 'food-equipment': return { payment: 'food', kind: 'equipment' };
    case 'bait-equipment': return { payment: 'bait', kind: 'equipment' };
    default: return null;
  }
}

export function createNightTraderStock(
  owned: ReadonlySet<ItemId>,
  seed: number,
  day: number,
): NightTraderStock {
  const random = mulberry32(mixEncounterSeed(seed, day));
  const consumable = drawMissingItem(
    owned,
    TRADER_CONSUMABLE_ITEM_IDS,
    random,
  );
  const equipment = drawMissingItem(
    owned,
    TRADER_EQUIPMENT_ITEM_IDS,
    random,
    (itemId) => itemId === 'scubaSet' ? 3 : 1,
  );
  return Object.freeze({
    consumable: consumable === null ? null : traderOffer(consumable, 'consumable'),
    equipment: equipment === null ? null : traderOffer(equipment, 'equipment'),
  });
}

function handymanRewardPool(payment: ItemId): readonly ItemId[] {
  const paymentWeight = ITEM_DEFINITIONS[payment].weight;
  return HANDYMAN_ITEM_IDS.filter((candidate) => (
    candidate !== payment
    && ITEM_DEFINITIONS[candidate].weight === paymentWeight
  ));
}

function traderOffer(itemId: ItemId, kind: TraderOfferKind): TraderOffer {
  return Object.freeze(kind === 'consumable'
    ? { itemId, kind, price: 1, choiceIds: CONSUMABLE_CHOICE_IDS }
    : { itemId, kind, price: 3, choiceIds: EQUIPMENT_CHOICE_IDS });
}

function mixEncounterSeed(seed: number, day: number): number {
  let mixed = (seed >>> 0) ^ Math.imul(Math.max(0, Math.floor(day)), 0x9E3779B1);
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x85EBCA6B);
  mixed = Math.imul(mixed ^ (mixed >>> 13), 0xC2B2AE35);
  return (mixed ^ (mixed >>> 16)) >>> 0;
}
