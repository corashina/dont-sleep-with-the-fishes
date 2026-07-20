import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
// @ts-expect-error This JavaScript audit entry point intentionally has no declaration file.
import { countTriangles } from '../scripts/check-item-models.mjs';
import {
  buildProjectItemModels,

} from '../scripts/project-item-models.mjs';

const PROJECT_IDS = [
  'map', 'spyglass', 'fishingNet', 'umbrella', 'swimRing', 'harpoonGun', 'energyBar',
] as const;


describe('project-authored item model builder', () => {
  let root: string;
  let outputRoot: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'project-item-models-'));
    outputRoot = join(root, 'output');
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('writes self-contained bounded triangle GLBs', async () => {
    await buildProjectItemModels({ outputRoot });
    expect(await readdir(outputRoot)).toEqual(PROJECT_IDS.map((id) => `${id}.glb`).sort());
    for (const id of PROJECT_IDS) {
      const file = join(outputRoot, `${id}.glb`);
      expect(await countTriangles(file), id).toBeGreaterThan(0);
      expect(await countTriangles(file), id).toBeLessThanOrEqual(3_000);
    }
  });

  it('writes finite normals aligned with every triangle winding', async () => {
    await buildProjectItemModels({ outputRoot });
    for (const id of PROJECT_IDS) {
      const document = await new NodeIO().read(join(outputRoot, `${id}.glb`));
      for (const mesh of document.getRoot().listMeshes()) {
        for (const primitive of mesh.listPrimitives()) {
          const position = primitive.getAttribute('POSITION')!;
          const normal = primitive.getAttribute('NORMAL');
          const indices = primitive.getIndices()!;
          expect(normal, `${id}: missing NORMAL`).not.toBeNull();
          expect(normal!.getCount(), `${id}: NORMAL count`).toBe(position.getCount());
          expect([...normal!.getArray()!].every(Number.isFinite), `${id}: finite NORMAL`).toBe(true);
          const first = [0, 0, 0];
          const second = [0, 0, 0];
          const third = [0, 0, 0];
          const actual = [0, 0, 0];
          for (let element = 0; element < indices.getCount(); element += 3) {
            const vertexIndices = [
              indices.getScalar(element),
              indices.getScalar(element + 1),
              indices.getScalar(element + 2),
            ];
            position.getElement(vertexIndices[0]!, first);
            position.getElement(vertexIndices[1]!, second);
            position.getElement(vertexIndices[2]!, third);
            const firstEdge = first.map((value, axis) => second[axis]! - value);
            const secondEdge = first.map((value, axis) => third[axis]! - value);
            const windingNormal = [
              firstEdge[1]! * secondEdge[2]! - firstEdge[2]! * secondEdge[1]!,
              firstEdge[2]! * secondEdge[0]! - firstEdge[0]! * secondEdge[2]!,
              firstEdge[0]! * secondEdge[1]! - firstEdge[1]! * secondEdge[0]!,
            ];
            const windingLength = Math.hypot(...windingNormal);
            for (const vertexIndex of vertexIndices) {
              normal!.getElement(vertexIndex!, actual);
              const alignment = windingNormal.reduce((sum, value, axis) => (
                sum + value * actual[axis]!
              ), 0) / (windingLength * Math.hypot(...actual));
              expect(alignment, `${id}: triangle ${element / 3} NORMAL`).toBeGreaterThan(0.9999);
            }
          }
        }
      }
    }
  });

  it('writes deterministic GLB bytes', async () => {
    const firstRoot = join(root, 'first');
    const secondRoot = join(root, 'second');
    await buildProjectItemModels({ outputRoot: firstRoot });
    await buildProjectItemModels({ outputRoot: secondRoot });
    for (const id of PROJECT_IDS) {
      expect(await readFile(join(firstRoot, `${id}.glb`))).toEqual(
        await readFile(join(secondRoot, `${id}.glb`)),
      );
    }
  });
});

describe('project-authored item model CLI', () => {
  const scriptPath = resolve('scripts', 'project-item-models.mjs');

  it('builds the project models into its single output path', async () => {
    const root = await mkdtemp(join(tmpdir(), 'project-item-models-cli-'));
    try {
      const result = spawnSync(process.execPath, [scriptPath, root], { encoding: 'utf8' });
      expect(result.status, result.stderr).toBe(0);
      expect(await readdir(root)).toEqual(PROJECT_IDS.map((id) => `${id}.glb`).sort());
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });


});
