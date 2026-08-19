// Importance: 8/10 (scaled from 4/5). Protects fishing reward contracts.
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

  it('boosts fish only after bait weights apply', () => {
    const weighted = new Map(
      eligibleFishingCatches(3, false, new Set(), 1.01).map(({ catch: entry, weight }) => [entry.id, weight]),
    );
    const baited = new Map(
      eligibleFishingCatches(3, true, new Set(), 1.01).map(({ catch: entry, weight }) => [entry.id, weight]),
    );

    expect(weighted.get('cod')).toBeCloseTo(20.2);
    expect(weighted.get('seaweed')).toBe(82);
    expect(baited.get('cod')).toBeCloseTo(40.4);
    expect(baited.get('bait')).toBe(5);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid fish weight multiplier %s',
    (fishWeightMultiplier) => {
      expect(() => eligibleFishingCatches(3, false, new Set(), fishWeightMultiplier)).toThrow(RangeError);
      expect(() => selectFishingCatch(3, false, 0, new Set(), fishWeightMultiplier)).toThrow(RangeError);
    },
  );

  it('filters active unique utilities but not stackable bait', () => {
    const active = new Set(['ductTape', 'compass', 'fishingNet', 'energyBar'] as const);
    const ids = eligibleFishingCatches(3, false, active).map(({ catch: entry }) => entry.id);
    expect(ids).toContain('bait');
    expect(ids).not.toEqual(expect.arrayContaining([
      'wetDuctTape', 'brokenCompass', 'tornFishingNet', 'energyBar',
    ]));
  });

  it('keeps stable exact-weight boundaries', () => {
    expect(selectFishingCatch(3, false, 380 / 422).id).toBe('fishBones');
    expect(selectFishingCatch(3, false, 396 / 422).id).toBe('bait');
    expect(selectFishingCatch(3, false, 401 / 422).id).toBe('wetDuctTape');
    expect(selectFishingCatch(3, false, 406 / 422).id).toBe('brokenCompass');
    expect(selectFishingCatch(3, false, 411 / 422).id).toBe('tornFishingNet');
    expect(selectFishingCatch(3, false, 414 / 422).id).toBe('energyBar');
  });

  it('rejects broken rewards for non-breakable items', () => {
    const invalid = [{
      ...FISHING_CATCHES.find(({ id }) => id === 'energyBar')!,
      reward: { kind: 'item', itemId: 'energyBar', condition: 'broken', unique: true } as const,
      presentation: { kind: 'item', itemId: 'energyBar', condition: 'broken' } as const,
    }];
    expect(() => validateCatalog(invalid)).toThrow(/energyBar.*breakable/i);
  });

  it.each([
    {
      name: 'fish without a food reward',
      sourceId: 'cod',
      patch: { reward: { kind: 'none' } },
      error: /cod.*fish.*food/i,
    },
    {
      name: 'utility with a food reward',
      sourceId: 'energyBar',
      patch: { reward: { kind: 'food', amount: 1 } },
      error: /energyBar.*utility.*reward/i,
    },
    {
      name: 'fish with utility size',
      sourceId: 'cod',
      patch: { size: 'utility' },
      error: /cod.*fish.*size/i,
    },
    {
      name: 'utility with fishing presentation',
      sourceId: 'energyBar',
      patch: {
        presentation: FISHING_CATCHES.find(({ id }) => id === 'cod')!.presentation,
      },
      error: /energyBar.*utility.*presentation/i,
    },
    {
      name: 'mismatched item IDs',
      sourceId: 'energyBar',
      patch: {
        presentation: { kind: 'item', itemId: 'compass', condition: 'usable' },
      },
      error: /energyBar.*item IDs.*match/i,
    },
    {
      name: 'mismatched item conditions',
      sourceId: 'brokenCompass',
      patch: {
        presentation: { kind: 'item', itemId: 'compass', condition: 'usable' },
      },
      error: /brokenCompass.*conditions.*match/i,
    },
    {
      name: 'unknown usable reward item',
      sourceId: 'energyBar',
      patch: {
        reward: {
          kind: 'item', itemId: 'unknownItem', condition: 'usable', unique: true,
        },
      },
      error: /energyBar.*unknown.*reward item.*unknownItem/i,
    },
    {
      name: 'unknown usable presentation item',
      sourceId: 'bait',
      patch: {
        presentation: {
          kind: 'item', itemId: 'unknownItem', condition: 'usable',
        },
      },
      error: /bait.*unknown.*presentation item.*unknownItem/i,
    },
    {
      name: 'item reward explicitly marked non-unique',
      sourceId: 'energyBar',
      patch: {
        reward: {
          kind: 'item', itemId: 'energyBar', condition: 'usable', unique: false,
        },
      },
      error: /energyBar.*item reward.*unique.*true/i,
    },
    {
      name: 'item reward missing the unique marker',
      sourceId: 'energyBar',
      patch: {
        reward: {
          kind: 'item', itemId: 'energyBar', condition: 'usable',
        },
      },
      error: /energyBar.*item reward.*unique.*true/i,
    },
    {
      name: 'bait reward presented as another known item',
      sourceId: 'bait',
      patch: {
        presentation: {
          kind: 'item', itemId: 'energyBar', condition: 'usable',
        },
      },
      error: /bait.*bait.*presentation.*baitTin/i,
    },
    {
      name: 'bait reward presented broken',
      sourceId: 'bait',
      patch: {
        presentation: {
          kind: 'item', itemId: 'baitTin', condition: 'broken',
        },
      },
      error: /bait.*bait.*presentation.*usable/i,
    },
  ])('rejects $name', ({ sourceId, patch, error }) => {
    const source = FISHING_CATCHES.find(({ id }) => id === sourceId)!;
    const invalid = [{ ...source, ...patch }];
    expect(() => validateCatalog(
      invalid as unknown as Parameters<typeof validateCatalog>[0],
    )).toThrow(error);
  });
});
