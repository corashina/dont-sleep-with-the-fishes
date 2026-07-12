import { describe, expect, it } from 'vitest';
import {
  CANONICAL_ITEMS,
  RUNTIME_ITEM_IDS,
  validateCanonicalItems,
} from '../src/canonical/items';
import { PARITY_AUDIT } from '../src/canonical/parityAudit';

describe('wiki item catalog', () => {
  it('includes every practical non-story item', () => {
    expect(RUNTIME_ITEM_IDS).toEqual(expect.arrayContaining([
      'cannedFood', 'baitTin', 'ductTape', 'compass', 'map', 'medicalKit', 'telescope',
      'fishingNet', 'bucket', 'flareGun', 'scubaSet', 'anchor', 'umbrella', 'swimRing',
      'flashlight', 'harpoonGun', 'energyBar', 'repairKit', 'fishingRod', 'chest', 'waterJug',
    ]));
  });

  it('uses approved defaults only for undocumented new ship items', () => {
    for (const id of ['compass', 'map', 'telescope', 'fishingNet', 'bucket', 'anchor', 'umbrella', 'swimRing', 'harpoonGun', 'energyBar', 'chest'] as const) {
      expect(CANONICAL_ITEMS[id].weight).toMatchObject({ value: 1, provenance: 'default' });
      expect(CANONICAL_ITEMS[id].spawnCount).toMatchObject({ value: 1, provenance: 'default' });
    }
    expect(CANONICAL_ITEMS.repairKit.builtIn).toBe(true);
    expect(CANONICAL_ITEMS.repairKit.spawnCount.value).toBe(0);
  });

  it('classifies every reviewed item without silent omissions', () => {
    const itemAudit = PARITY_AUDIT.filter(({ kind }) => kind === 'item');
    expect(itemAudit.map(({ wikiName }) => wikiName)).toEqual(expect.arrayContaining([
      'Food', 'Bait', 'Duct Tape', 'Compass', 'Map', 'Medkit', 'Spyglass', 'Fishing Net',
      'Bucket', 'Flare Gun', 'Scuba Gear', 'Anchor', 'Bottled Paper', 'Umbrella', 'Swim Ring',
      'Flashlight', 'Harpoon Gun', 'Energy Bar', 'Repair Kit', 'Fishing Rod', 'Heart Piece 1',
      'Heart Piece 2', 'Heart Piece 3', 'Heart of the Sea', 'Chest', 'Yellow Flower', 'White Flower',
    ]));
    expect(itemAudit.every(({ reason }) => reason.length > 0)).toBe(true);
  });

  it('has unique IDs, labels, sources, and provenance for every resolved field', () => {
    expect(new Set(RUNTIME_ITEM_IDS).size).toBe(RUNTIME_ITEM_IDS.length);
    for (const id of RUNTIME_ITEM_IDS) {
      const item = CANONICAL_ITEMS[id];
      expect(item.label.value.length).toBeGreaterThan(0);
      for (const field of [item.label, item.weight, item.spawnCount, item.charges, item.durable]) {
        expect(['wiki', 'preserved', 'default']).toContain(field.provenance);
        expect(field.source.length).toBeGreaterThan(0);
      }
    }
  });

  it('validates the checked-in item catalog', () => {
    expect(() => validateCanonicalItems()).not.toThrow();
  });
});
