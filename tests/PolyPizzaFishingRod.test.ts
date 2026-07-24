import { describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import {
  buildPolyPizzaFishingRod,
  POLY_PIZZA_FISHING_ROD,
} from '../scripts/poly-pizza-fishing-rod.mjs';

describe('Poly Pizza fishing rod', () => {
  it('pins the exact attributed source and deterministic reduction settings', () => {
    expect(Object.isFrozen(POLY_PIZZA_FISHING_ROD)).toBe(true);
    expect(POLY_PIZZA_FISHING_ROD).toEqual({
      pageUrl: 'https://poly.pizza/m/9gXWYDqB6vt',
      downloadUrl: 'https://static.poly.pizza/b50b26a5-173d-4833-af8f-1f30f97d3e59.glb',
      sourceAssetId: 'poly-pizza:b50b26a5-173d-4833-af8f-1f30f97d3e59',
      creator: 'Justin Randall',
      licenseUrl: 'https://creativecommons.org/licenses/by/3.0/',
      sha256: 'B51A2E1A642E0DF431B2C8992EB251F88F83B294282F7591319433A76EA396A7',
      sourceTriangles: 14_860,
      simplifyRatio: 0.16,
      simplifyError: 0.012,
    });
  });

  it('publishes the six-material rod silhouette within the item triangle budget', async () => {
    const document = await new NodeIO().read(resolve(
      'src',
      'assets',
      'models',
      'items',
      'fishingRod.glb',
    ));
    const triangles = document.getRoot().listMeshes().reduce((modelTotal, mesh) => (
      modelTotal + mesh.listPrimitives().reduce((meshTotal, primitive) => (
        meshTotal + (
          primitive.getIndices()?.getCount()
          ?? primitive.getAttribute('POSITION')?.getCount()
          ?? 0
        ) / 3
      ), 0)
    ), 0);

    expect(document.getRoot().listScenes()[0]?.getName()).toBe('fishingRod');
    expect(document.getRoot().listMaterials()).toHaveLength(6);
    expect(document.getRoot().listTextures()).toHaveLength(0);
    expect(triangles).toBe(2_964);
  });

  it('rejects source bytes that do not match the pinned model', async () => {
    const root = await mkdtemp(join(tmpdir(), 'poly-pizza-fishing-rod-'));
    const sourcePath = join(root, 'source.glb');
    try {
      await writeFile(sourcePath, new Uint8Array([1, 2, 3, 4]));
      await expect(buildPolyPizzaFishingRod({
        sourcePath,
        outputPath: join(root, 'output.glb'),
      })).rejects.toThrow(/source SHA-256/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
