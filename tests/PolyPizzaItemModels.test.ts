import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ITEM_IDS } from '../src/game/ItemState';
import {
  buildPolyPizzaModel,
  POLY_PIZZA_MODEL_IDS,
  POLY_PIZZA_MODEL_SOURCES,
} from '../scripts/poly-pizza-models.mjs';
import { ITEM_MODEL_SPECS } from '../src/world/itemModelManifest';

const EXPECTED_IDS = [
  ...ITEM_IDS.filter((id) => id !== 'captainWhiskers'),
  'fishingRod',
  'lantern',
  'ceilingLight',
];

describe('Poly Pizza item models', () => {
  it('pins the complete runtime item and practical-light set', () => {
    expect(POLY_PIZZA_MODEL_IDS).toEqual(EXPECTED_IDS);

    for (const [id, source] of Object.entries(POLY_PIZZA_MODEL_SOURCES)) {
      expect(source.id).toBe(id);
      for (const pinnedSource of [source, ...(source.components ?? [])]) {
        expect(pinnedSource.pageUrl).toMatch(/^https:\/\/poly\.pizza\/m\//);
        expect(pinnedSource.downloadUrl).toMatch(/^https:\/\/static\.poly\.pizza\/.+\.glb$/);
        expect(pinnedSource.sourceAssetId).toBe(`poly-pizza:${pinnedSource.resourceId}`);
        expect(pinnedSource.sha256).toMatch(/^[A-F0-9]{64}$/);
        expect(pinnedSource.sourceTriangles).toBeGreaterThan(0);
        expect(pinnedSource.downloadedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(['CC0 1.0', 'CC-BY 3.0']).toContain(pinnedSource.license);
      }
    }
  });

  it('prioritizes Poly by Google where suitable and pins the requested lights', () => {
    const googleModels = Object.values(POLY_PIZZA_MODEL_SOURCES)
      .filter((source) => source.creator === 'Poly by Google');
    expect(googleModels.length).toBeGreaterThanOrEqual(8);
    expect(POLY_PIZZA_MODEL_SOURCES.lantern).toMatchObject({
      creator: 'Kay Lousberg',
      publicId: 'CtHBJ1ufeW',
    });
    expect(POLY_PIZZA_MODEL_SOURCES.ceilingLight).toMatchObject({
      creator: 'Quaternius',
      publicId: 'JT44JUXU2d',
    });
    expect(POLY_PIZZA_MODEL_SOURCES.baitTin).toMatchObject({
      creator: 'Kay Lousberg',
      publicId: 'ubNPKDn2yH',
      nodeName: 'jar_D_small',
    });
  });

  it('pins the functionally selected survival item models', () => {
    expect(POLY_PIZZA_MODEL_SOURCES.cannedFood!.publicId).toBe('onPuYPx0q7');
    expect(POLY_PIZZA_MODEL_SOURCES.fishingNet!.publicId).toBe('6xRmXaU-L7e');
    expect(POLY_PIZZA_MODEL_SOURCES.fishingNet!.maxTriangles).toBe(9_000);
    expect(POLY_PIZZA_MODEL_SOURCES.fishingNet!.simplifyRatio).toBeUndefined();
    expect(POLY_PIZZA_MODEL_SOURCES.scubaSet!).toMatchObject({
      publicId: '4GhtCNARi8c',
      components: [{
        publicId: '4YCjSY3U6H',
        translation: [0.00025044, 0.185, -0.06384998],
        rotation: [1, 0, 0, 0],
        scale: [0.16, 0.16, 0.16],
      }],
    });
    expect(POLY_PIZZA_MODEL_SOURCES.ductTape!.publicId).toBe('dLlslRdbHfs');
    expect(POLY_PIZZA_MODEL_SOURCES.umbrella!.publicId).toBe('ez4MoDQFgXz');
    expect(POLY_PIZZA_MODEL_SOURCES.swimRing!.removeNodeNames).toEqual(['Rectangle_sweep']);
    expect(POLY_PIZZA_MODEL_SOURCES.flashlight!.publicId).toBe('8t1DZLLvofk');
    expect(POLY_PIZZA_MODEL_SOURCES.harpoonGun!.publicId).toBe('neEjwx9bBJ');
    expect(POLY_PIZZA_MODEL_SOURCES.bottledPaper!.publicId).toBe('arIYNl9gMyr');
  });

  it('presents the scuba gear upright with its base at the placement origin', () => {
    expect(ITEM_MODEL_SPECS.scubaSet.rotation).toEqual([0, 0, 0]);
    expect(ITEM_MODEL_SPECS.scubaSet.normalizedBounds.min[1]).toBeCloseTo(0);
  });

  it('rejects source bytes that do not match a pinned model', async () => {
    const root = await mkdtemp(join(tmpdir(), 'poly-pizza-item-model-'));
    const sourcePath = join(root, 'source.glb');
    try {
      await writeFile(sourcePath, new Uint8Array([1, 2, 3, 4]));
      await expect(buildPolyPizzaModel({
        id: 'lantern',
        sourcePath,
        outputPath: join(root, 'output.glb'),
      })).rejects.toThrow(/source SHA-256/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
