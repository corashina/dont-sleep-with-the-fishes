import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ITEM_IDS, type ItemId } from '../src/game/ItemState';
import { ITEM_MODEL_ASSET_LEDGER, ITEM_MODEL_SPECS } from '../src/world/itemModelManifest';

const EXPECTED_SOURCES: Readonly<Record<ItemId, readonly [string, string]>> = {
  flareGun: ['https://kenney.nl/assets/blaster-kit', 'blaster-kit@2.1:Models/GLB format/blaster-n.glb'],
  ductTape: ['https://kenney.nl/assets/prototype-kit', 'prototype-kit@1.0:Models/GLB format/shape-hollow-cylinder-detailed.glb'],
  fishingRod: ['https://kenney.nl/assets/prototype-kit', 'prototype-kit@1.0:composite/fishingRod'],
  baitTin: ['https://kenney.nl/assets/food-kit', 'food-kit@2.0:Models/GLB format/can-small.glb'],
  medicalKit: ['https://kenney.nl/assets/prototype-kit', 'prototype-kit@1.0:composite/medicalKit'],
  waterJug: ['https://kenney.nl/assets/survival-kit', 'survival-kit@2.0:Models/GLB format/bottle.glb'],
  cannedFood: ['https://kenney.nl/assets/food-kit', 'food-kit@2.0:Models/GLB format/can.glb'],
  flashlight: ['https://kenney.nl/assets/prototype-kit', 'prototype-kit@1.0:composite/flashlight'],
  scubaSet: ['https://kenney.nl/assets/prototype-kit', 'prototype-kit@1.0:composite/scubaSet'],
};

const CC0_URL = 'https://creativecommons.org/publicdomain/zero/1.0/';

function ledgerRows(): readonly (readonly string[])[] {
  return ITEM_MODEL_ASSET_LEDGER.split(/\r?\n/)
    .filter((line) => line.trim().startsWith('|') && line.trim().endsWith('|'))
    .map((line) => line.trim().slice(1, -1).split('|').map((cell) => cell.trim()));
}

describe('item model manifest', () => {
  it('exhaustively maps every item to its approved local model and provenance', async () => {
    expect(Object.keys(ITEM_MODEL_SPECS).sort()).toEqual([...ITEM_IDS].sort());

    for (const id of ITEM_IDS) {
      const spec = ITEM_MODEL_SPECS[id];
      expect(spec.url).toMatch(/\.glb$/);
      expect(spec.maxTriangles).toBe(3_000);
      expect(spec.sourceUrl).toBe(EXPECTED_SOURCES[id][0]);
      expect(spec.sourceAssetId).toBe(EXPECTED_SOURCES[id][1]);
      expect(spec.creator).toBe('Kenney');
      expect(spec.licenseUrl).toBe(CC0_URL);
      await expect(access(fileURLToPath(
        new URL(`../src/assets/models/items/${id}.glb`, import.meta.url),
      ))).resolves.toBeUndefined();
    }
  });

  it('embeds matching asset-ledger provenance for every model', () => {
    const rows = ledgerRows();
    for (const id of ITEM_IDS) {
      const spec = ITEM_MODEL_SPECS[id];
      const matches = rows.filter((row) => row[0] === id);
      expect(matches).toHaveLength(1);
      const row = matches[0]!;
      expect(row).toHaveLength(10);
      expect(row[0]).toBe(id);
      expect(row[1]).toBe(`\`${id}.glb\``);
      expect(row[3]).toBe(spec.sourceUrl);
      expect(row[4]).toBe(`\`${spec.sourceAssetId}\``);
      expect(row[2]!.slice(row[2]!.lastIndexOf(' / ') + 3)).toBe(spec.creator);
      expect(/^\[[^\]]+\]\(([^)]+)\)$/.exec(row[5]!)?.[1]).toBe(spec.licenseUrl);
    }
  });

  it('contains no legacy Poly Pizza provenance', async () => {
    const manifestSource = await readFile(resolve('src', 'world', 'itemModelManifest.ts'), 'utf8');
    expect(manifestSource).not.toContain('poly.pizza');
    expect(ITEM_MODEL_ASSET_LEDGER).not.toContain('poly.pizza');
  });

  it('uses the browser-measured presentation transforms', () => {
    expect(ITEM_MODEL_SPECS.flareGun.offset).toEqual([0, 0.07, 0]);
    expect(ITEM_MODEL_SPECS.ductTape.targetLongestDimension).toBe(0.55);
    expect(ITEM_MODEL_SPECS.ductTape.offset).toEqual([0, 0, 0]);
    expect(ITEM_MODEL_SPECS.fishingRod.rotation).toEqual([Math.PI / 2, 0, 0]);
    expect(ITEM_MODEL_SPECS.fishingRod.offset).toEqual([0, 0, 0]);
    expect(ITEM_MODEL_SPECS.baitTin.offset).toEqual([0, 0.12, 0]);
    expect(ITEM_MODEL_SPECS.medicalKit.offset).toEqual([0, 0.07, 0]);
    expect(ITEM_MODEL_SPECS.waterJug.offset).toEqual([0, 0.22, 0]);
    expect(ITEM_MODEL_SPECS.cannedFood.offset).toEqual([0, 0.04, 0]);
    expect(ITEM_MODEL_SPECS.flashlight.offset).toEqual([0, 0.19, 0]);
    expect(ITEM_MODEL_SPECS.scubaSet.offset).toEqual([0, 0.25, 0]);
  });
});
