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
  PROJECT_ITEM_RECIPES,
  PROJECT_ITEM_RECIPE_VERSION,
} from '../scripts/project-item-models.mjs';
import type {
  TorusArcAuthoredPart,
  TubePathAuthoredPart,
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

  it('publishes the v2 nautical map and an asymmetric gathered net bundle', () => {
    expect(PROJECT_ITEM_RECIPE_VERSION).toBe(2);
    const netParts = PROJECT_ITEM_RECIPES.fishingNet.parts;
    const netPaths = netParts.filter(
      (netPart): netPart is TubePathAuthoredPart => netPart.shape === 'tubePath',
    );
    expect(netParts.some(({ name }) => /handle|hoop|frame/i.test(name))).toBe(false);
    expect(netParts.some(({ name }) => /^edge-(north|east|south|west)$/.test(name))).toBe(false);
    expect(netParts.every(({ color }) =>
      color === undefined || color[0] < 0.25,
    )).toBe(true);

    const foldCenters: number[] = [];
    for (const layer of [1, 2, 3]) {
      const layerPaths = netPaths.filter(({ name }) => name.startsWith(`fold-${layer}-`));
      expect(layerPaths.filter(({ name }) => name.includes('-warp-')).length).toBeGreaterThanOrEqual(3);
      expect(layerPaths.filter(({ name }) => name.includes('-weft-')).length).toBeGreaterThanOrEqual(3);
      foldCenters.push(layerPaths
        .flatMap(({ points }) => points)
        .reduce((sum, point) => sum + point[0], 0)
        / layerPaths.flatMap(({ points }) => points).length);
    }
    expect(new Set(foldCenters.map((center) => center.toFixed(2))).size).toBe(3);

    const gatherPaths = netPaths.filter(({ name }) => name.startsWith('gather-'));
    expect(gatherPaths).toHaveLength(2);
    expect(gatherPaths.every(({ points }) => points.length >= 5)).toBe(true);
    const looseCoil = netPaths.find(({ name }) => name === 'loose-edge-coil');
    expect(looseCoil?.points.length).toBeGreaterThanOrEqual(8);
    expect(looseCoil?.points.at(0)).not.toEqual(looseCoil?.points.at(-1));

    const mapNames = PROJECT_ITEM_RECIPES.map.parts.map(({ name }) => name);
    expect(mapNames).toEqual(expect.arrayContaining([
      'chart-sheet', 'landmass-west', 'landmass-east', 'route',
      'compass-north', 'compass-east', 'compass-south', 'compass-west',
    ]));
    expect(PROJECT_ITEM_RECIPES.map.parts.filter(({ name }) =>
      name.startsWith('grid-'),
    ).length).toBeGreaterThanOrEqual(8);
  });

  it('authors a closed purple umbrella and narrow fitted ring bands', () => {
    const umbrella = PROJECT_ITEM_RECIPES.umbrella.parts;
    expect(umbrella.some(({ name }) => name === 'canopy')).toBe(false);
    expect(umbrella.filter(({ name }) => name.startsWith('fabric-fold-'))).toHaveLength(8);
    expect(umbrella.map(({ name }) => name)).toEqual(expect.arrayContaining([
      'fastening-strap', 'shaft', 'metal-tip', 'curved-handle',
    ]));

    const arcs = PROJECT_ITEM_RECIPES.swimRing.parts.filter(
      (part): part is TorusArcAuthoredPart => part.shape === 'torusArc',
    );
    const whiteLength = arcs.filter(({ role }) => role === 'white-band')
      .reduce((sum, { arcLength }) => sum + arcLength, 0);
    expect(whiteLength / (Math.PI * 2)).toBeCloseTo(0.16, 5);
    expect(arcs.filter(({ role }) => role === 'white-band')).toHaveLength(4);
    expect(arcs.filter(({ role }) => role === 'orange-body')).toHaveLength(4);
  });

  it('authors the harpoon gun as a modern speargun', () => {
    const names = PROJECT_ITEM_RECIPES.harpoonGun.parts.map(({ name }) => name);
    expect(names).toEqual(expect.arrayContaining([
      'barrel', 'rail', 'grip', 'trigger', 'trigger-guard',
      'spear-shaft', 'spear-head', 'rubber-band-left',
      'rubber-band-right', 'line-spool', 'spool-line',
    ]));
    expect(names).not.toContain('stock');
    expect(PROJECT_ITEM_RECIPES.harpoonGun.parts.filter(({ shape }) =>
      shape === 'tubePath',
    ).length).toBeGreaterThanOrEqual(3);
  });

  it('writes a detailed but bounded speargun GLB', async () => {
    await buildProjectItemModels({ outputRoot });
    const triangles = await countTriangles(join(outputRoot, 'harpoonGun.glb'), 'harpoonGun');
    expect(triangles).toBeGreaterThanOrEqual(300);
    expect(triangles).toBeLessThanOrEqual(1_500);
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

  it('writes finite normals facing every triangle winding', async () => {
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
              expect(alignment, `${id}: triangle ${element / 3} NORMAL`).toBeGreaterThan(0);
            }
          }
        }
      }
    }
  });

  it('shares one indexed tube ring per authored path point', async () => {
    await buildProjectItemModels({ outputRoot });
    const document = await new NodeIO().read(join(outputRoot, 'map.glb'));
    const routeNode = document.getRoot().listNodes().find((node) => node.getName() === 'route');
    const position = routeNode!.getMesh()!.listPrimitives()[0]!.getAttribute('POSITION')!;
    const route = PROJECT_ITEM_RECIPES.map.parts.find(
      (part): part is TubePathAuthoredPart => part.name === 'route',
    );
    expect(route).toBeDefined();
    expect(position.getCount()).toBe(route!.points.length * route!.radialSegments!);
  });

  it('builds a bounded partial torus through the torusArc dispatch', async () => {
    const recipes = {
      torusArcFixture: {
        parts: [{
          name: 'half-ring',
          shape: 'torusArc',
          size: [0.60, 0.10, 0.60],
          translation: [0, 0, 0],
          rotation: [0, 0, 0, 1],
          color: [0.1, 0.1, 0.1, 1],
          arcStart: 0,
          arcLength: Math.PI,
          segments: 8,
        }],
      },
    };
    await buildProjectItemModels({ outputRoot, recipes });
    const file = join(outputRoot, 'torusArcFixture.glb');
    expect(await countTriangles(file)).toBe(128);
    const document = await new NodeIO().read(file);
    const position = document.getRoot().listMeshes()[0]!.listPrimitives()[0]!
      .getAttribute('POSITION')!;
    const zCoordinates = [...position.getArray()!].filter((_, index) => index % 3 === 2);
    expect(Math.min(...zCoordinates)).toBeGreaterThanOrEqual(-1e-6);
    expect(Math.max(...zCoordinates)).toBeGreaterThan(0.25);
  });

  it('rejects malformed tube paths and polygons', async () => {
    const color = [0.1, 0.1, 0.1, 1];
    const invalidCases = [
      {
        id: 'shortTube',
        part: {
          name: 'short-tube', shape: 'tubePath', points: [[0, 0, 0]],
          radius: 0.1, radialSegments: 6, translation: [0, 0, 0],
          rotation: [0, 0, 0, 1], color,
        },
        message: 'shortTube: tubePath requires at least two points',
      },
      {
        id: 'shortPolygon',
        part: {
          name: 'short-polygon', shape: 'polygon', points: [[0, 0], [1, 0]],
          height: 0.1, translation: [0, 0, 0], rotation: [0, 0, 0, 1], color,
        },
        message: 'shortPolygon: polygon requires at least three points',
      },
      {
        id: 'zeroAreaPolygon',
        part: {
          name: 'zero-area-polygon', shape: 'polygon',
          points: [[0, 0], [1, 0], [2, 0]], height: 0.1,
          translation: [0, 0, 0], rotation: [0, 0, 0, 1], color,
        },
        message: 'zeroAreaPolygon: polygon requires a finite non-zero area',
      },
    ];
    for (const { id, part: invalidPart, message } of invalidCases) {
      await expect(buildProjectItemModels({
        outputRoot,
        recipes: { [id]: { parts: [invalidPart] } },
      })).rejects.toThrow(message);
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
