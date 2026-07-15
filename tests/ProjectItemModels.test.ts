import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { NodeIO, type Node } from '@gltf-transform/core';
// @ts-expect-error This JavaScript audit entry point intentionally has no declaration file.
import { countTriangles } from '../scripts/check-item-models.mjs';
import {
  buildProjectItemModels,
  PROJECT_ITEM_IDS,
  PROJECT_ITEM_RECIPES,
} from '../scripts/project-item-models.mjs';

const PROJECT_IDS = [
  'compass', 'map', 'spyglass', 'fishingNet', 'flareGun',
  'anchor', 'umbrella', 'swimRing', 'harpoonGun', 'energyBar',
] as const;

const RED_ORANGE = [0.78, 0.18, 0.08, 1];
const DARK = [0.10, 0.12, 0.14, 1];

function nodeBounds(node: Node): { min: number[]; max: number[] } {
  const mesh = node.getMesh();
  if (!mesh) throw new Error(`${node.getName()}: missing mesh`);
  const matrix = node.getWorldMatrix();
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const primitive of mesh.listPrimitives()) {
    const position = primitive.getAttribute('POSITION');
    if (!position) throw new Error(`${node.getName()}: missing positions`);
    const point = [0, 0, 0];
    for (let index = 0; index < position.getCount(); index += 1) {
      position.getElement(index, point);
      const world = [
        matrix[0] * point[0]! + matrix[4] * point[1]! + matrix[8] * point[2]! + matrix[12],
        matrix[1] * point[0]! + matrix[5] * point[1]! + matrix[9] * point[2]! + matrix[13],
        matrix[2] * point[0]! + matrix[6] * point[1]! + matrix[10] * point[2]! + matrix[14],
      ];
      for (let axis = 0; axis < 3; axis += 1) {
        min[axis] = Math.min(min[axis]!, world[axis]!);
        max[axis] = Math.max(max[axis]!, world[axis]!);
      }
    }
  }
  return { min, max };
}

function overlap(firstMin: number, firstMax: number, secondMin: number, secondMax: number): number {
  return Math.max(0, Math.min(firstMax, secondMax) - Math.max(firstMin, secondMin));
}

describe('project-authored item model catalog', () => {
  it('defines the exact project-authored model set', () => {
    expect(PROJECT_ITEM_IDS).toEqual(PROJECT_IDS);
    expect(Object.keys(PROJECT_ITEM_RECIPES)).toEqual(PROJECT_IDS);
    expect(PROJECT_ITEM_RECIPES.flareGun.parts.map(({ name }) => name)).toEqual([
      'barrel', 'muzzle', 'hinge', 'grip', 'trigger-guard', 'trigger',
    ]);
  });
});

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

  it('builds a compact signal pistol with the approved parts and colors', async () => {
    await buildProjectItemModels({
      outputRoot,
      recipes: { flareGun: PROJECT_ITEM_RECIPES.flareGun },
    });
    const document = await new NodeIO().read(join(outputRoot, 'flareGun.glb'));
    const nodes = document.getRoot().listScenes()[0]!.listChildren();
    expect(nodes.map((node) => node.getName())).toEqual([
      'barrel', 'muzzle', 'hinge', 'grip', 'trigger-guard', 'trigger',
    ]);
    const materials = Object.fromEntries(document.getRoot().listMaterials().map((material) => [
      material.getName(), material.getBaseColorFactor(),
    ]));
    expect(materials['barrel-material']).toEqual(RED_ORANGE);
    expect(materials['muzzle-material']).toEqual(RED_ORANGE);
    expect(materials['grip-material']).toEqual(DARK);

    const bounds = nodes.map(nodeBounds);
    const modelMin = [0, 1, 2].map((axis) => Math.min(...bounds.map(({ min }) => min[axis]!)));
    const modelMax = [0, 1, 2].map((axis) => Math.max(...bounds.map(({ max }) => max[axis]!)));
    const longestAxis = Math.max(...modelMax.map((maximum, axis) => maximum - modelMin[axis]!));
    const grip = bounds[nodes.findIndex((node) => node.getName() === 'grip')]!;
    const gripHeight = grip.max[1]! - grip.min[1]!;
    expect(gripHeight).toBeGreaterThan(0);
    expect(longestAxis).toBeLessThanOrEqual(gripHeight * 4);
  });

  it('hides the unused umbrella handle half inside its grip to leave an open crook', async () => {
    await buildProjectItemModels({
      outputRoot,
      recipes: { umbrella: PROJECT_ITEM_RECIPES.umbrella },
    });
    const document = await new NodeIO().read(join(outputRoot, 'umbrella.glb'));
    const nodes = Object.fromEntries(document.getRoot().listScenes()[0]!.listChildren().map((node) => [
      node.getName(), node,
    ]));
    const handle = nodeBounds(nodes.handle!);
    const grip = nodeBounds(nodes.grip!);
    const projectedHandleArea = (handle.max[0]! - handle.min[0]!)
      * (handle.max[1]! - handle.min[1]!);
    const projectedOverlapArea = overlap(handle.min[0]!, handle.max[0]!, grip.min[0]!, grip.max[0]!)
      * overlap(handle.min[1]!, handle.max[1]!, grip.min[1]!, grip.max[1]!);

    expect(projectedOverlapArea / projectedHandleArea).toBeGreaterThanOrEqual(0.5);
    expect(handle.max[0]! - grip.max[0]!).toBeGreaterThan(0.05);
    expect(grip.min[2]!).toBeLessThanOrEqual(handle.min[2]!);
    expect(grip.max[2]!).toBeGreaterThanOrEqual(handle.max[2]!);
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

  it('requires exactly one output path', () => {
    const result = spawnSync(process.execPath, [scriptPath], { encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('<outputRoot>');
  });
});
