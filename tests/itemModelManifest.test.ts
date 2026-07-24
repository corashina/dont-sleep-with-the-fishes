import { access, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ITEM_IDS, type ItemId } from '../src/game/ItemState';
import { ITEM_MODEL_ASSET_LEDGER, ITEM_MODEL_SPECS } from '../src/world/itemModelManifest';
import {
  LIFEBOAT_EQUIPMENT_IDS,
  LIFEBOAT_EQUIPMENT_MODEL_SPECS,
  type LifeboatEquipmentId,
} from '../src/world/lifeboatEquipmentManifest';

const MODELS_DIR = resolve('src', 'assets', 'models', 'items');
const MODEL_IDS = [...ITEM_IDS, ...LIFEBOAT_EQUIPMENT_IDS];
type RuntimeModelId = ItemId | LifeboatEquipmentId;
const EXPECTED_MODEL_FILES = [
  ...MODEL_IDS.map((id) => `${id}.glb`),
  'item-model-metadata.json',
].sort();
const CC0_URL = 'https://creativecommons.org/publicdomain/zero/1.0/';
const THIRD_PARTY_SOURCES = {
  cannedFood: ['https://kenney.nl/assets/food-kit', 'food-kit@2.0:Models/GLB format/can.glb', 'Kenney'],
  baitTin: ['https://kenney.nl/assets/food-kit', 'food-kit@2.0:Models/GLB format/can-small.glb', 'Kenney'],
  ductTape: ['https://kenney.nl/assets/prototype-kit', 'prototype-kit@1.0:Models/GLB format/shape-hollow-cylinder-detailed.glb', 'Kenney'],
  compass: ['https://quaternius.com/packs/survival.html', 'quaternius-survival-pack@2020-09:OBJ/Compass_Open.obj', 'Quaternius'],
  medicalKit: ['https://kenney.nl/assets/prototype-kit', 'prototype-kit@1.0:composite/medicalKit', 'Kenney'],
  bucket: ['https://kenney.nl/assets/survival-kit', 'survival-kit@2.0:Models/GLB format/bucket.glb', 'Kenney'],
  flareGun: ['https://quaternius.com/packs/survival.html', 'quaternius-survival-pack@2020-09:OBJ/FlareGun.obj', 'Quaternius'],
  bottledPaper: ['https://kenney.nl/assets/survival-kit', 'survival-kit@2.0:composite/bottledPaper', 'Kenney + project'],
  anchor: ['https://quaternius.com/packs/piratekit.html', 'quaternius-pirate-kit@2023-11:OBJ/Prop_Anchor.obj', 'Quaternius'],
  flashlight: ['https://kenney.nl/assets/prototype-kit', 'prototype-kit@1.0:composite/flashlight', 'Kenney'],
  fishingRod: ['https://kenney.nl/assets/prototype-kit', 'prototype-kit@1.0:composite/fishingRod', 'Kenney'],
  scubaSet: ['https://kenney.nl/assets/prototype-kit', 'prototype-kit@1.0:composite/scubaSet', 'Kenney'],
} as const;
const PROJECT_IDS = [
  'map', 'spyglass', 'fishingNet', 'umbrella', 'swimRing', 'harpoonGun', 'energyBar',
] as const;
const TARGET_LONGEST_DIMENSIONS = {
  cannedFood: 0.42, baitTin: 0.48, ductTape: 0.55, compass: 0.48, map: 0.72,
  medicalKit: 0.72, spyglass: 0.72, fishingNet: 0.82, bucket: 0.68, flareGun: 0.68,
  scubaSet: 0.88, anchor: 0.88, bottledPaper: 0.62, umbrella: 0.90, swimRing: 0.70,
  flashlight: 0.72, harpoonGun: 1.00, energyBar: 0.48, fishingRod: 1.80,
} as const satisfies Readonly<Record<RuntimeModelId, number>>;
const EXPECTED_ROTATIONS = {
  cannedFood: [0, 0, 0], baitTin: [0, 0, 0], ductTape: [0, 0, 0],
  compass: [0, 0, 0], map: [0, 0, 0], medicalKit: [0, 0, 0],
  spyglass: [0, 0, 0], fishingNet: [0, 0, 0], bucket: [0, 0, 0],
  flareGun: [Math.PI / 2, 0, 0], scubaSet: [0, 0, Math.PI / 2],
  anchor: [0, 0, 0], bottledPaper: [0, 0, Math.PI / 2],
  umbrella: [0, 0, Math.PI / 2], swimRing: [0, 0, 0],
  flashlight: [0, 0, Math.PI / 2], harpoonGun: [0, 0, 0],
  energyBar: [0, 0, 0], fishingRod: [Math.PI / 2, 0, 0],
} as const satisfies Readonly<Record<RuntimeModelId, readonly [number, number, number]>>;

function runtimeModelSpec(id: RuntimeModelId) {
  return id === 'fishingRod'
    ? LIFEBOAT_EQUIPMENT_MODEL_SPECS[id]
    : ITEM_MODEL_SPECS[id];
}

function runtimeLedgerRows(): readonly (readonly string[])[] {
  const heading = '## Runtime model asset ledger';
  const start = ITEM_MODEL_ASSET_LEDGER.indexOf(heading);
  const nextHeading = ITEM_MODEL_ASSET_LEDGER.indexOf('\n## ', start + heading.length);
  const runtimeLedger = ITEM_MODEL_ASSET_LEDGER.slice(start, nextHeading === -1 ? undefined : nextHeading);
  return runtimeLedger.split(/\r?\n/)
    .filter((line) => line.trim().startsWith('|') && line.trim().endsWith('|'))
    .map((line) => line.trim().slice(1, -1).split('|').map((cell) => cell.trim()));
}

describe('item model manifest', () => {
  it('separates collectible item models from fixed lifeboat equipment', () => {
    expect(Object.keys(ITEM_MODEL_SPECS).sort()).toEqual([...ITEM_IDS].sort());
    expect(ITEM_IDS).not.toContain('fishingRod');
    expect(LIFEBOAT_EQUIPMENT_IDS).toEqual(['fishingRod']);
    expect(Object.keys(LIFEBOAT_EQUIPMENT_MODEL_SPECS)).toEqual(['fishingRod']);
    expect(LIFEBOAT_EQUIPMENT_MODEL_SPECS.fishingRod.url).toMatch(/fishingRod\.glb$/);
    expect(LIFEBOAT_EQUIPMENT_MODEL_SPECS.fishingRod.generatedMetadata.triangles).toBe(376);
  });

  it('authors a natural resting rotation for every runtime item', () => {
    for (const id of MODEL_IDS) {
      expect(runtimeModelSpec(id).rotation, id).toEqual(EXPECTED_ROTATIONS[id]);
    }
  });

  it('publishes exactly one local GLB per runtime model plus generated metadata', async () => {
    expect((await readdir(MODELS_DIR)).sort()).toEqual(EXPECTED_MODEL_FILES);
    expect(Object.keys(ITEM_MODEL_SPECS).sort()).toEqual([...ITEM_IDS].sort());
    expect(Object.keys(LIFEBOAT_EQUIPMENT_MODEL_SPECS)).toEqual(['fishingRod']);
    for (const id of MODEL_IDS) {
      const spec = runtimeModelSpec(id);
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

  it('distinguishes the exact third-party and project-authored provenance sets', () => {
    for (const [id, [sourceUrl, sourceAssetId, creator]] of Object.entries(THIRD_PARTY_SOURCES)) {
      expect(runtimeModelSpec(id as RuntimeModelId).provenance).toEqual({
        kind: 'thirdParty', sourceUrl, sourceAssetId, creator, licenseUrl: CC0_URL,
      });
    }
    for (const id of PROJECT_IDS) {
      expect(ITEM_MODEL_SPECS[id].provenance).toEqual({
        kind: 'project', recipeId: `project-item-models@2:${id}`, creator: 'Project team',
      });
    }
    expect(ITEM_MODEL_SPECS.flareGun.provenance).toMatchObject({
      kind: 'thirdParty',
      sourceUrl: 'https://quaternius.com/packs/survival.html',
      sourceAssetId: 'quaternius-survival-pack@2020-09:OBJ/FlareGun.obj',
      creator: 'Quaternius',
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
    const rows = runtimeLedgerRows();
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
