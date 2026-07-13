import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ITEM_IDS, type ItemId } from '../src/game/ItemState';
import { ITEM_MODEL_ASSET_LEDGER, ITEM_MODEL_SPECS } from '../src/world/itemModelManifest';

const EXPECTED_PUBLIC_IDS: Readonly<Record<ItemId, string>> = {
  flareGun: '44H9OBUqTC',
  ductTape: 'fu49rGO7Ukc',
  fishingRod: 'lDlWQjn9Zg',
  baitTin: 'IuoYedcdXQ',
  medicalKit: 'Hp80p6148W',
  waterJug: 'KpxDpidn1Z',
  cannedFood: 'YnowJvWqxE',
  flashlight: 'WGsvr4KOZd',
  scubaSet: '7igrHLjaQlW',
};

const EXPECTED_RESOURCE_IDS: Readonly<Record<ItemId, string>> = {
  flareGun: '9ec52cda-c918-43f0-b7af-354e7fe96c37',
  ductTape: '06934616-1393-451d-bdf6-2101a5e32703',
  fishingRod: 'c15761f7-4aef-4bf4-9565-50a68a981f34',
  baitTin: 'f6b52ca9-61b1-42d5-a42f-d8748a41eb45',
  medicalKit: '41249676-0965-40df-8dd7-eee79dd9e6cf',
  waterJug: '3ebef9a3-c2df-49ee-abe1-df38b5777bcd',
  cannedFood: 'e16e13cf-fbc4-48c8-9927-ae34920a498e',
  flashlight: '035c4897-22f3-4e9c-b29f-ebafe2b566da',
  scubaSet: 'efda7497-db5e-47e9-b317-8e8baeb1c616',
};

describe('item model manifest', () => {
  it('exhaustively maps every item to its approved local model and provenance', async () => {
    expect(Object.keys(ITEM_MODEL_SPECS).sort()).toEqual([...ITEM_IDS].sort());

    for (const id of ITEM_IDS) {
      const spec = ITEM_MODEL_SPECS[id];
      expect(spec.url).toMatch(/\.glb$/);
      expect(spec.maxTriangles).toBe(id === 'ductTape' ? 21_000 : 3_000);
      expect(spec.sourceUrl).toBe(`https://poly.pizza/m/${EXPECTED_PUBLIC_IDS[id]}`);
      expect(spec.resourceId).toBe(EXPECTED_RESOURCE_IDS[id]);
      expect(spec.creator.length).toBeGreaterThan(0);
      expect(spec.licenseUrl).toMatch(/^https:\/\/creativecommons\.org\//);
      await expect(access(fileURLToPath(
        new URL(`../src/assets/models/items/${id}.glb`, import.meta.url),
      ))).resolves.toBeUndefined();
    }
  });

  it('embeds matching asset-ledger provenance for every model', () => {
    for (const id of ITEM_IDS) {
      const spec = ITEM_MODEL_SPECS[id];
      expect(ITEM_MODEL_ASSET_LEDGER).toContain(id);
      expect(ITEM_MODEL_ASSET_LEDGER).toContain(spec.sourceUrl);
      expect(ITEM_MODEL_ASSET_LEDGER).toContain(spec.resourceId);
      expect(ITEM_MODEL_ASSET_LEDGER).toContain(spec.creator);
      expect(ITEM_MODEL_ASSET_LEDGER).toContain(spec.licenseUrl);
    }
  });
});
