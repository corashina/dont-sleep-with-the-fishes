import { describe, expect, it } from 'vitest';
import {
  FISHING_CATCHES,
  eligibleFishingCatches,
  fishingCatchFood,
  selectFishingCatch,
  validateCatalog,
} from '../src/survival/fishingCatalog';

describe('fishing utility catalog', () => {
  it('encodes the exact utility catch contracts', () => {
    expect(FISHING_CATCHES.filter(({ kind }) => kind === 'utility')).toMatchObject([
      {
        id: 'bait', label: 'Bait', baseWeight: 5, minimumDay: 0,
        reward: { kind: 'bait', amount: 1 },
        presentation: { kind: 'item', itemId: 'baitTin', condition: 'usable' },
      },
      {
        id: 'wetDuctTape', label: 'Wet Duct Tape', baseWeight: 5, minimumDay: 3,
        reward: { kind: 'item', itemId: 'ductTape', condition: 'usable', unique: true },
      },
      {
        id: 'brokenCompass', label: 'Broken Compass', baseWeight: 5, minimumDay: 0,
        reward: { kind: 'item', itemId: 'compass', condition: 'broken', unique: true },
      },
      {
        id: 'tornFishingNet', label: 'Torn Fishing Net', baseWeight: 3, minimumDay: 0,
        reward: { kind: 'item', itemId: 'fishingNet', condition: 'broken', unique: true },
      },
      {
        id: 'energyBar', label: 'Energy Bar', baseWeight: 8, minimumDay: 0,
        reward: { kind: 'item', itemId: 'energyBar', condition: 'usable', unique: true },
      },
    ]);
  });

  it('does not boost utilities with bait or report them as food', () => {
    const plain = new Map(eligibleFishingCatches(3, false).map(({ catch: entry, weight }) => [entry.id, weight]));
    const baited = new Map(eligibleFishingCatches(3, true).map(({ catch: entry, weight }) => [entry.id, weight]));
    for (const id of ['bait', 'wetDuctTape', 'brokenCompass', 'tornFishingNet', 'energyBar'] as const) {
      expect(baited.get(id)).toBe(plain.get(id));
      expect(fishingCatchFood(FISHING_CATCHES.find((entry) => entry.id === id)!)).toBe(0);
    }
  });

  it('filters active unique utilities but not stackable bait', () => {
    const active = new Set(['ductTape', 'compass', 'fishingNet', 'energyBar'] as const);
    const ids = eligibleFishingCatches(3, false, active).map(({ catch: entry }) => entry.id);
    expect(ids).toContain('bait');
    expect(ids).not.toEqual(expect.arrayContaining([
      'wetDuctTape', 'brokenCompass', 'tornFishingNet', 'energyBar',
    ]));
  });

  it('keeps stable exact-weight boundaries', () => {
    expect(selectFishingCatch(3, false, 380 / 406).id).toBe('bait');
    expect(selectFishingCatch(3, false, 385 / 406).id).toBe('wetDuctTape');
    expect(selectFishingCatch(3, false, 390 / 406).id).toBe('brokenCompass');
    expect(selectFishingCatch(3, false, 395 / 406).id).toBe('tornFishingNet');
    expect(selectFishingCatch(3, false, 398 / 406).id).toBe('energyBar');
  });

  it('rejects broken rewards for non-breakable items', () => {
    const invalid = [{
      ...FISHING_CATCHES.find(({ id }) => id === 'energyBar')!,
      reward: { kind: 'item', itemId: 'energyBar', condition: 'broken', unique: true },
    }];
    expect(() => validateCatalog(invalid)).toThrow(/energyBar.*breakable/i);
  });
});
