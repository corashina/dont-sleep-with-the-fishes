import { describe, expect, it, vi } from 'vitest';
import { ITEM_IDS, type ItemId } from '../src/game/ItemState';
import {
  createNightTraderStock,
  eligibleHandymanRewards,
  parseTraderChoiceId,
  selectHandymanReward,
} from '../src/survival/tradeRules';

function ownedExcept(...missing: ItemId[]): ReadonlySet<ItemId> {
  return new Set(ITEM_IDS.filter((id) => !missing.includes(id)));
}

describe('Handyman trade rules', () => {
  it('keeps only missing rewards with the payment catalog weight', () => {
    const owned = new Set<ItemId>(['compass', 'map', 'radio', 'shotgun', 'scubaSet']);

    expect(eligibleHandymanRewards(owned, 'spyglass')).toEqual([
      'cannedFood',
      'baitTin',
      'ductTape',
      'knife',
      'flareGun',
      'flashlight',
      'energyBar',
    ]);
  });

  it('excludes the payment type before it leaves inventory', () => {
    const owned = ownedExcept('compass', 'baitTin', 'ductTape');

    expect(eligibleHandymanRewards(owned, 'compass')).toEqual([
      'baitTin',
      'ductTape',
    ]);
  });

  it('gives each eligible reward an equal interval', () => {
    const owned = ownedExcept('compass', 'baitTin', 'ductTape');

    expect(selectHandymanReward(owned, 'compass', { next: () => 0.499 })).toBe('baitTin');
    expect(selectHandymanReward(owned, 'compass', { next: () => 0.5 })).toBe('ductTape');
  });

  it('returns null without drawing when the pool is empty', () => {
    const next = vi.fn(() => 0);

    expect(selectHandymanReward(new Set(ITEM_IDS), 'anchor', { next })).toBeNull();
    expect(next).not.toHaveBeenCalled();
  });
});

describe('Night Trader stock', () => {
  it('creates stable missing stock with contextual payment choices', () => {
    const owned = new Set<ItemId>(['cannedFood', 'compass']);
    const first = createNightTraderStock(owned, 42, 8);
    const second = createNightTraderStock(owned, 42, 8);

    expect(second).toEqual(first);
    expect(first.consumable).toMatchObject({
      kind: 'consumable',
      price: 1,
      choiceIds: ['food-consumable', 'bait-consumable'],
    });
    expect(first.equipment).toMatchObject({
      kind: 'equipment',
      price: 3,
      choiceIds: ['food-equipment', 'bait-equipment'],
    });
    expect(owned.has(first.consumable!.itemId)).toBe(false);
    expect(owned.has(first.equipment!.itemId)).toBe(false);
    expect(first.consumable!.itemId).not.toBe('carlitos');
    expect(first.equipment!.itemId).not.toBe('carlitos');
    expect(parseTraderChoiceId(first.equipment!.choiceIds[0])).toEqual({
      payment: 'food',
      kind: 'equipment',
    });
  });

  it('omits each stock group when the player owns its full pool', () => {
    const allOwned = new Set(ITEM_IDS);
    const equipmentMissing = ownedExcept('anchor');
    const consumableMissing = ownedExcept('ductTape');

    expect(createNightTraderStock(allOwned, 1, 5)).toEqual({
      consumable: null,
      equipment: null,
    });
    expect(createNightTraderStock(equipmentMissing, 1, 5)).toMatchObject({
      consumable: null,
      equipment: { itemId: 'anchor' },
    });
    expect(createNightTraderStock(consumableMissing, 1, 5)).toMatchObject({
      consumable: { itemId: 'ductTape' },
      equipment: null,
    });
  });

  it('gives missing scuba gear three times the normal equipment weight', () => {
    const owned = ownedExcept('anchor', 'scubaSet');
    let scuba = 0;
    let anchor = 0;

    for (let seed = 0; seed < 4_000; seed += 1) {
      const itemId = createNightTraderStock(owned, seed, 5).equipment?.itemId;
      if (itemId === 'scubaSet') scuba += 1;
      if (itemId === 'anchor') anchor += 1;
    }

    expect(scuba / anchor).toBeGreaterThan(2.5);
    expect(scuba / anchor).toBeLessThan(3.5);
  });
});
