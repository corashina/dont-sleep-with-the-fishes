import { describe, expect, it, vi } from 'vitest';
import { ITEM_IDS, type ItemId } from '../src/game/ItemState';
import {
  eligibleHandymanRewards,
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
