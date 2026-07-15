import { access, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ITEM_IDS, type ItemId } from '../src/game/ItemState';
import { ITEM_MODEL_ASSET_LEDGER, ITEM_MODEL_SPECS } from '../src/world/itemModelManifest';

const MODELS_DIR = resolve('src', 'assets', 'models', 'items');
const EXPECTED_MODEL_FILES = [
  ...ITEM_IDS.map((id) => `${id}.glb`),
  'item-model-metadata.json',
].sort();
const CC0_URL = 'https://creativecommons.org/publicdomain/zero/1.0/';
const THIRD_PARTY_SOURCES = {
  cannedFood: ['https://kenney.nl/assets/food-kit', 'food-kit@2.0:Models/GLB format/can.glb', 'Kenney'],
  baitTin: ['https://kenney.nl/assets/food-kit', 'food-kit@2.0:Models/GLB format/can-small.glb', 'Kenney'],
  ductTape: ['https://kenney.nl/assets/prototype-kit', 'prototype-kit@1.0:Models/GLB format/shape-hollow-cylinder-detailed.glb', 'Kenney'],
  medicalKit: ['https://kenney.nl/assets/prototype-kit', 'prototype-kit@1.0:composite/medicalKit', 'Kenney'],
  bucket: ['https://kenney.nl/assets/survival-kit', 'survival-kit@2.0:Models/GLB format/bucket.glb', 'Kenney'],
  bottledPaper: ['https://kenney.nl/assets/survival-kit', 'survival-kit@2.0:composite/bottledPaper', 'Kenney + project'],
  flashlight: ['https://kenney.nl/assets/prototype-kit', 'prototype-kit@1.0:composite/flashlight', 'Kenney'],
  fishingRod: ['https://kenney.nl/assets/prototype-kit', 'prototype-kit@1.0:composite/fishingRod', 'Kenney'],
  scubaSet: ['https://kenney.nl/assets/prototype-kit', 'prototype-kit@1.0:composite/scubaSet', 'Kenney'],
} as const;
const PROJECT_IDS = [
  'compass', 'map', 'spyglass', 'fishingNet', 'flareGun',
  'anchor', 'umbrella', 'swimRing', 'harpoonGun', 'energyBar',
] as const;
const TARGET_LONGEST_DIMENSIONS = {
  cannedFood: 0.42, baitTin: 0.48, ductTape: 0.55, compass: 0.48, map: 0.72,
  medicalKit: 0.72, spyglass: 0.72, fishingNet: 0.82, bucket: 0.68, flareGun: 0.68,
  scubaSet: 0.88, anchor: 0.88, bottledPaper: 0.62, umbrella: 0.90, swimRing: 0.70,
  flashlight: 0.72, harpoonGun: 1.00, energyBar: 0.48, fishingRod: 1.80,
} as const satisfies Readonly<Record<ItemId, number>>;

function ledgerRows(): readonly (readonly string[])[] {
  return ITEM_MODEL_ASSET_LEDGER.split(/\r?\n/)
    .filter((line) => line.trim().startsWith('|') && line.trim().endsWith('|'))
    .map((line) => line.trim().slice(1, -1).split('|').map((cell) => cell.trim()));
}

describe('item model manifest', () => {
  it('publishes exactly one local GLB per runtime item plus generated metadata', async () => {
    expect((await readdir(MODELS_DIR)).sort()).toEqual(EXPECTED_MODEL_FILES);
    expect(Object.keys(ITEM_MODEL_SPECS).sort()).toEqual([...ITEM_IDS].sort());
    for (const id of ITEM_IDS) {
      const spec = ITEM_MODEL_SPECS[id];
      expect(spec.url).toMatch(/\.glb$/);
      expect(spec.maxTriangles).toBe(3_000);
      expect(spec.targetLongestDimension).toBe(TARGET_LONGEST_DIMENSIONS[id]);
      expect(spec.generatedMetadata.triangles).toBeGreaterThan(0);
      expect(spec.generatedMetadata.rawBounds.min).toHaveLength(3);
      expect(spec.generatedMetadata.rawBounds.max).toHaveLength(3);
      await expect(access(fileURLToPath(
        new URL(`../src/assets/models/items/${id}.glb`, import.meta.url),
      ))).resolves.toBeUndefined();
    }
  });

  it('distinguishes the exact Kenney-derived and project-authored provenance sets', () => {
    for (const [id, [sourceUrl, sourceAssetId, creator]] of Object.entries(THIRD_PARTY_SOURCES)) {
      expect(ITEM_MODEL_SPECS[id as ItemId].provenance).toEqual({
        kind: 'thirdParty', sourceUrl, sourceAssetId, creator, licenseUrl: CC0_URL,
      });
    }
    for (const id of PROJECT_IDS) {
      expect(ITEM_MODEL_SPECS[id].provenance).toEqual({
        kind: 'project', recipeId: `project-item-models@1:${id}`, creator: 'Project team',
      });
    }
    expect(ITEM_MODEL_SPECS.flareGun.provenance).toEqual({
      kind: 'project', recipeId: 'project-item-models@1:flareGun', creator: 'Project team',
    });
    expect(ITEM_MODEL_SPECS.bucket.provenance).toMatchObject({
      kind: 'thirdParty',
      sourceUrl: 'https://kenney.nl/assets/survival-kit',
      sourceAssetId: 'survival-kit@2.0:Models/GLB format/bucket.glb',
    });
    expect(ITEM_MODEL_SPECS.bottledPaper.provenance).toMatchObject({
      kind: 'thirdParty', sourceUrl: 'https://kenney.nl/assets/survival-kit',
    });
  });

  it('embeds exactly one matching ledger row for each third-party model and none for project models', () => {
    const rows = ledgerRows();
    for (const [id, [sourceUrl, sourceAssetId, creator]] of Object.entries(THIRD_PARTY_SOURCES)) {
      const matches = rows.filter((row) => row[0] === id);
      expect(matches).toHaveLength(1);
      const row = matches[0]!;
      expect(row).toHaveLength(10);
      expect(row[1]).toBe(`\`${id}.glb\``);
      expect(row[3]).toBe(sourceUrl);
      expect(row[4]).toBe(`\`${sourceAssetId}\``);
      expect(row[2]!.slice(row[2]!.lastIndexOf(' / ') + 3)).toBe(creator);
      expect(/^\[[^\]]+\]\(([^)]+)\)$/.exec(row[5]!)?.[1]).toBe(CC0_URL);
    }
    for (const id of PROJECT_IDS) expect(rows.filter((row) => row[0] === id)).toHaveLength(0);
  });

  it('contains no retired model or source identities', async () => {
    const sources = await Promise.all([
      'scripts/kenney-item-models.mjs',
      'scripts/fetch-item-models.ps1',
      'scripts/check-item-models.mjs',
      'src/world/itemModelManifest.ts',
      'THIRD_PARTY_ASSETS.md',
    ].map((path) => readFile(resolve(path), 'utf8')));
    const combined = sources.join('\n');
    expect(combined).not.toMatch(/poly\.pizza|blaster-n|blaster-kit|waterJug/);
    expect(EXPECTED_MODEL_FILES.join('\n')).not.toMatch(/blaster-n|blaster-kit|waterJug/);
  });
});
