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

const EXPECTED_IDS = [
  ...ITEM_IDS,
  'fishingRod',
  'lantern',
  'ceilingLight',
];

describe('Poly Pizza item models', () => {
  it('pins the complete runtime item and practical-light set', () => {
    expect(POLY_PIZZA_MODEL_IDS).toEqual(EXPECTED_IDS);

    for (const [id, source] of Object.entries(POLY_PIZZA_MODEL_SOURCES)) {
      expect(source.id).toBe(id);
      expect(source.pageUrl).toMatch(/^https:\/\/poly\.pizza\/m\//);
      expect(source.downloadUrl).toMatch(/^https:\/\/static\.poly\.pizza\/.+\.glb$/);
      expect(source.sourceAssetId).toBe(`poly-pizza:${source.resourceId}`);
      expect(source.sha256).toMatch(/^[A-F0-9]{64}$/);
      expect(source.sourceTriangles).toBeGreaterThan(0);
      expect(['CC0 1.0', 'CC-BY 3.0']).toContain(source.license);
    }
  });

  it('prioritizes Poly by Google where suitable and pins the requested lights', () => {
    const googleModels = Object.values(POLY_PIZZA_MODEL_SOURCES)
      .filter((source) => source.creator === 'Poly by Google');
    expect(googleModels.length).toBeGreaterThanOrEqual(10);
    expect(POLY_PIZZA_MODEL_SOURCES.lantern).toMatchObject({
      creator: 'Kay Lousberg',
      publicId: 'CtHBJ1ufeW',
    });
    expect(POLY_PIZZA_MODEL_SOURCES.ceilingLight).toMatchObject({
      creator: 'Quaternius',
      publicId: 'JT44JUXU2d',
    });
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
