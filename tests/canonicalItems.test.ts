import { describe, expect, it } from 'vitest';
import {
  CANONICAL_ITEMS,
  RUNTIME_ITEM_IDS,
  runtimeItemDefinition,
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

  it('models each Duct Tape roll as a documented one-time item', () => {
    expect(CANONICAL_ITEMS.ductTape.spawnCount).toMatchObject({ value: 2, provenance: 'preserved' });
    expect(CANONICAL_ITEMS.ductTape.charges).toMatchObject({ value: 1, provenance: 'wiki' });
  });

  it('keeps legacy display labels distinct from wiki item headings', () => {
    expect(CANONICAL_ITEMS.baitTin.label).toMatchObject({ value: 'BAIT TIN', provenance: 'preserved' });
    expect(CANONICAL_ITEMS.cannedFood.label).toMatchObject({ value: 'CANNED FOOD', provenance: 'preserved' });
    expect(CANONICAL_ITEMS.medicalKit.label).toMatchObject({ value: 'MEDICAL KIT', provenance: 'preserved' });
    expect(CANONICAL_ITEMS.scubaSet.label).toMatchObject({ value: 'SCUBA SET', provenance: 'preserved' });
  });

  it('sources the new built-in Repair Kit from documented reusable behavior', () => {
    expect(CANONICAL_ITEMS.repairKit.charges).toMatchObject({ value: null, provenance: 'wiki' });
    expect(CANONICAL_ITEMS.repairKit.durable).toMatchObject({ value: true, provenance: 'wiki' });
    expect(CANONICAL_ITEMS.repairKit.charges.note?.length).toBeGreaterThan(0);
    expect(CANONICAL_ITEMS.repairKit.durable.note?.length).toBeGreaterThan(0);
  });

  it('records authoritative breakable metadata from canonical event and fishing behavior', () => {
    const breakable = [
      'compass', 'map', 'telescope', 'fishingNet', 'bucket', 'scubaSet',
      'anchor', 'umbrella', 'swimRing',
    ] as const;
    for (const id of breakable) {
      expect(CANONICAL_ITEMS[id].breakable).toMatchObject({ value: true, provenance: 'wiki' });
      expect(CANONICAL_ITEMS[id].breakable.note?.length).toBeGreaterThan(0);
      expect(runtimeItemDefinition(id).breakable).toBe(true);
    }
    expect(CANONICAL_ITEMS.fishingRod.breakable.value).toBe(false);
    expect(CANONICAL_ITEMS.repairKit.breakable.value).toBe(false);
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

  it('locks the exact normalized wiki-name, classification, and runtime-ID audit mapping', () => {
    const itemAudit = PARITY_AUDIT.filter(({ kind }) => kind === 'item');
    const normalized = itemAudit.map(({ wikiName, classification, runtimeId }) => [
      wikiName.trim().toLocaleLowerCase('en-US'), classification, runtimeId ?? null,
    ]);
    expect(normalized).toEqual([
      ['food', 'included', 'cannedFood'], ['bait', 'included', 'baitTin'],
      ['duct tape', 'included', 'ductTape'], ['compass', 'included', 'compass'],
      ['map', 'included', 'map'], ['medkit', 'included', 'medicalKit'],
      ['spyglass', 'included', 'telescope'], ['fishing net', 'included', 'fishingNet'],
      ['bucket', 'included', 'bucket'], ['flare gun', 'included', 'flareGun'],
      ['scuba gear', 'included', 'scubaSet'], ['anchor', 'included', 'anchor'],
      ['bottled paper', 'story-excluded', null], ['umbrella', 'included', 'umbrella'],
      ['swim ring', 'included', 'swimRing'], ['flashlight', 'included', 'flashlight'],
      ['harpoon gun', 'included', 'harpoonGun'], ['energy bar', 'included', 'energyBar'],
      ['repair kit', 'included', 'repairKit'], ['fishing rod', 'included', 'fishingRod'],
      ['heart piece 1', 'story-excluded', null], ['heart piece 2', 'story-excluded', null],
      ['heart piece 3', 'story-excluded', null], ['heart of the sea', 'story-excluded', null],
      ['chest', 'included', 'chest'], ['yellow flower', 'story-excluded', null],
      ['white flower', 'unsupported-undocumented', null],
      ['water jug', 'preserved', 'waterJug'],
    ]);
    expect(new Set(normalized.map(([wikiName]) => wikiName)).size).toBe(normalized.length);
    const runtimeIds = normalized.flatMap(([, , runtimeId]) => runtimeId === null ? [] : [runtimeId]);
    expect(new Set(runtimeIds).size).toBe(runtimeIds.length);
  });

  it('has unique IDs, labels, sources, and provenance for every resolved field', () => {
    expect(new Set(RUNTIME_ITEM_IDS).size).toBe(RUNTIME_ITEM_IDS.length);
    for (const id of RUNTIME_ITEM_IDS) {
      const item = CANONICAL_ITEMS[id];
      expect(item.label.value.length).toBeGreaterThan(0);
      for (const field of [item.label, item.weight, item.spawnCount, item.charges, item.durable, item.breakable]) {
        expect(field, `${id} field`).toBeDefined();
        expect(['wiki', 'preserved', 'default']).toContain(field?.provenance);
        expect(field?.source.length).toBeGreaterThan(0);
      }
    }
  });

  it('validates the checked-in item catalog', () => {
    expect(() => validateCanonicalItems()).not.toThrow();
  });

  it('rejects duplicate IDs and missing item records', () => {
    expect(() => validateCanonicalItems(['flareGun', 'flareGun'])).toThrow(/duplicates/i);
    expect(() => validateCanonicalItems(['missing'], CANONICAL_ITEMS)).toThrow(/no catalog record/i);
  });

  it('rejects blank labels and blank sources', () => {
    const base = CANONICAL_ITEMS.flareGun;
    expect(() => validateCanonicalItems(['flareGun'], {
      flareGun: { ...base, label: { ...base.label, value: '   ' } },
    })).toThrow(/label is blank/i);
    expect(() => validateCanonicalItems(['flareGun'], {
      flareGun: { ...base, weight: { ...base.weight, source: '   ' } },
    })).toThrow(/weight has no source/i);
  });

  it('rejects invalid provenance and numeric fields', () => {
    const base = CANONICAL_ITEMS.flareGun;
    expect(() => validateCanonicalItems(['flareGun'], {
      flareGun: {
        ...base,
        weight: { ...base.weight, provenance: 'invented' as never },
      },
    })).toThrow(/invalid provenance/i);
    for (const [field, value] of [
      ['weight', 0], ['spawnCount', -1], ['charges', 0],
    ] as const) {
      expect(() => validateCanonicalItems(['flareGun'], {
        flareGun: { ...base, [field]: { ...base[field], value } },
      })).toThrow(new RegExp(`${field} is invalid`, 'i'));
    }
  });

  it('rejects ship spawns for built-in items', () => {
    const base = CANONICAL_ITEMS.repairKit;
    expect(() => validateCanonicalItems(['repairKit'], {
      repairKit: { ...base, spawnCount: { ...base.spawnCount, value: 1 } },
    })).toThrow(/built in.*ship spawns/i);
  });
});
