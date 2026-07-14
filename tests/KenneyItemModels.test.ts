import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import {
  buildKenneyItemModels,
  KENNEY_ITEM_RECIPES,
  KENNEY_PACKS,
} from '../scripts/kenney-item-models.mjs';

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+XxL7WQAAAABJRU5ErkJggg==',
  'base64',
);

async function writeFixture(path: string, name: string): Promise<void> {
  const io = new NodeIO();
  const document = new Document();
  const buffer = document.createBuffer();
  const position = document.createAccessor('position', buffer)
    .setType('VEC3')
    .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]));
  const texture = document.createTexture('colormap')
    .setImage(new Uint8Array(PNG_1X1))
    .setMimeType('image/png');
  const material = document.createMaterial('material').setBaseColorTexture(texture);
  const primitive = document.createPrimitive().setAttribute('POSITION', position).setMaterial(material);
  const mesh = document.createMesh(name).addPrimitive(primitive);
  document.createScene(name).addChild(document.createNode(name).setMesh(mesh));
  await mkdir(dirname(path), { recursive: true });
  await io.write(path, document);
}

const expectedTriangles = {
  flareGun: 410,
  ductTape: 192,
  fishingRod: 376,
  baitTin: 154,
  medicalKit: 228,
  waterJug: 96,
  cannedFood: 156,
  flashlight: 340,
  scubaSet: 688,
} as const;

const expectedPacks = {
  'blaster-kit': {
    version: '2.1',
    pageUrl: 'https://kenney.nl/assets/blaster-kit',
    archiveUrl: 'https://kenney.nl/media/pages/assets/blaster-kit/261d80a716-1753959510/kenney_blaster-kit_2.1.zip',
    sha256: '91E3093E95427D59625E7E2CE2D0399B861600160FD0B4ADA7714796B67CEA8C',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    requiredEntries: ['License.txt', 'Models/GLB format/Textures/colormap.png', 'Models/GLB format/blaster-n.glb'],
  },
  'food-kit': {
    version: '2.0',
    pageUrl: 'https://kenney.nl/assets/food-kit',
    archiveUrl: 'https://kenney.nl/media/pages/assets/food-kit/83086fa91c-1719418518/kenney_food-kit.zip',
    sha256: 'CDAD90853682499B94C9FDA2F87678B24BFD8F3264E0ED323F6B6A27FD7C6F6F',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    requiredEntries: ['License.txt', 'Models/GLB format/Textures/colormap.png', 'Models/GLB format/can-small.glb', 'Models/GLB format/can.glb'],
  },
  'survival-kit': {
    version: '2.0',
    pageUrl: 'https://kenney.nl/assets/survival-kit',
    archiveUrl: 'https://kenney.nl/media/pages/assets/survival-kit/4065a8185b-1712149243/kenney_survival-kit.zip',
    sha256: 'C3586341B5932C87EB43D75D915434F47DAED168B17ED36A03E8CA9977C7443E',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    requiredEntries: ['License.txt', 'Models/GLB format/Textures/colormap.png', 'Models/GLB format/bottle-large.glb'],
  },
  'prototype-kit': {
    version: '1.0',
    pageUrl: 'https://kenney.nl/assets/prototype-kit',
    archiveUrl: 'https://kenney.nl/media/pages/assets/prototype-kit/4d3b7073ed-1724832076/kenney_prototype-kit.zip',
    sha256: '213B522FB12BCC9B9AC66C4F7581F7C74623293272212E40A70C39936AD3DA95',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    requiredEntries: [
      'License.txt',
      'Models/GLB format/Textures/colormap.png',
      'Models/GLB format/shape-cylinder-detailed.glb',
      'Models/GLB format/shape-cylinder.glb',
      'Models/GLB format/shape-hollow-cylinder-detailed.glb',
      'Models/GLB format/shape-hollow-cylinder-half-detailed.glb',
      'Models/GLB format/shape-cube-rounded.glb',
      'Models/GLB format/shape-cube-half.glb',
    ],
  },
} as const;

const expectedRecipes = {
  flareGun: {
    kind: 'direct', pack: 'blaster-kit', entry: 'Models/GLB format/blaster-n.glb',
    expectedTriangles: 410, scale: [1, 1, 1],
  },
  ductTape: {
    kind: 'direct', pack: 'prototype-kit', entry: 'Models/GLB format/shape-hollow-cylinder-detailed.glb',
    expectedTriangles: 192, scale: [1, 0.35, 1],
  },
  fishingRod: {
    kind: 'composite', expectedTriangles: 376, parts: [
      { name: 'rod', pack: 'prototype-kit', entry: 'Models/GLB format/shape-cylinder-detailed.glb', translation: [0, 0, 0], scale: [0.018, 1.6, 0.018], color: [0.95, 0.25, 0.08, 1], rotation: [0, 0, 0, 1] },
      { name: 'grip', pack: 'prototype-kit', entry: 'Models/GLB format/shape-cylinder-detailed.glb', translation: [0, -0.35, 0], scale: [0.04, 0.35, 0.04], color: [0.12, 0.12, 0.14, 1], rotation: [0, 0, 0, 1] },
      { name: 'reel', pack: 'prototype-kit', entry: 'Models/GLB format/shape-hollow-cylinder-detailed.glb', translation: [0.05, -0.14, 0], scale: [0.08, 0.05, 0.08], color: [0.2, 0.24, 0.3, 1], rotation: [Math.SQRT1_2, 0, 0, Math.SQRT1_2] },
    ],
  },
  baitTin: {
    kind: 'direct', pack: 'food-kit', entry: 'Models/GLB format/can-small.glb',
    expectedTriangles: 154, scale: [1, 1, 1],
  },
  medicalKit: {
    kind: 'composite', expectedTriangles: 228, parts: [
      { name: 'case', pack: 'prototype-kit', entry: 'Models/GLB format/shape-cube-rounded.glb', translation: [0, 0, 0], scale: [1, 0.7, 0.3], color: [0.85, 0.08, 0.06, 1], rotation: [0, 0, 0, 1] },
      { name: 'cross-vertical', pack: 'prototype-kit', entry: 'Models/GLB format/shape-cube-half.glb', translation: [0, 0.15, 0.17], scale: [0.12, 0.8, 0.04], color: [1, 1, 1, 1], rotation: [0, 0, 0, 1] },
      { name: 'cross-horizontal', pack: 'prototype-kit', entry: 'Models/GLB format/shape-cube-half.glb', translation: [0, 0.29, 0.17], scale: [0.4, 0.24, 0.04], color: [1, 1, 1, 1], rotation: [0, 0, 0, 1] },
    ],
  },
  waterJug: {
    kind: 'direct', pack: 'survival-kit', entry: 'Models/GLB format/bottle-large.glb',
    expectedTriangles: 96, scale: [1, 1, 1],
  },
  cannedFood: {
    kind: 'direct', pack: 'food-kit', entry: 'Models/GLB format/can.glb',
    expectedTriangles: 156, scale: [1, 1, 1],
  },
  flashlight: {
    kind: 'composite', expectedTriangles: 340, parts: [
      { name: 'body', pack: 'prototype-kit', entry: 'Models/GLB format/shape-cylinder-detailed.glb', translation: [0, 0, 0], scale: [0.18, 0.9, 0.18], color: [0.12, 0.16, 0.18, 1], rotation: [0, 0, 0, 1] },
      { name: 'head', pack: 'prototype-kit', entry: 'Models/GLB format/shape-cylinder.glb', translation: [0, 0.9, 0], scale: [0.28, 0.25, 0.28], color: [0.95, 0.32, 0.08, 1], rotation: [0, 0, 0, 1] },
      { name: 'lens-ring', pack: 'prototype-kit', entry: 'Models/GLB format/shape-hollow-cylinder-detailed.glb', translation: [0, 1.15, 0], scale: [0.3, 0.1, 0.3], color: [0.9, 0.95, 1, 1], rotation: [0, 0, 0, 1] },
      { name: 'switch', pack: 'prototype-kit', entry: 'Models/GLB format/shape-cube-half.glb', translation: [0, 0.65, 0.17], scale: [0.08, 0.12, 0.06], color: [0.95, 0.32, 0.08, 1], rotation: [0, 0, 0, 1] },
    ],
  },
  scubaSet: {
    kind: 'composite', expectedTriangles: 688, parts: [
      { name: 'tank-left', pack: 'prototype-kit', entry: 'Models/GLB format/shape-cylinder-detailed.glb', translation: [-0.18, 0, 0], scale: [0.24, 1, 0.24], color: [0.95, 0.35, 0.08, 1], rotation: [0, 0, 0, 1] },
      { name: 'tank-right', pack: 'prototype-kit', entry: 'Models/GLB format/shape-cylinder-detailed.glb', translation: [0.18, 0, 0], scale: [0.24, 1, 0.24], color: [0.95, 0.35, 0.08, 1], rotation: [0, 0, 0, 1] },
      { name: 'harness', pack: 'prototype-kit', entry: 'Models/GLB format/shape-cube-rounded.glb', translation: [0, 0.12, 0.15], scale: [0.5, 0.72, 0.16], color: [0.08, 0.12, 0.16, 1], rotation: [0, 0, 0, 1] },
      { name: 'loop-left', pack: 'prototype-kit', entry: 'Models/GLB format/shape-hollow-cylinder-half-detailed.glb', translation: [-0.22, 0.58, 0.13], scale: [0.18, 0.52, 0.16], color: [0.08, 0.12, 0.16, 1], rotation: [0, 0, 0, 1] },
      { name: 'loop-right', pack: 'prototype-kit', entry: 'Models/GLB format/shape-hollow-cylinder-half-detailed.glb', translation: [0.22, 0.58, 0.13], scale: [0.18, 0.52, 0.16], color: [0.08, 0.12, 0.16, 1], rotation: [0, 0, 0, 1] },
      { name: 'regulator', pack: 'prototype-kit', entry: 'Models/GLB format/shape-hollow-cylinder-half-detailed.glb', translation: [0, 1.05, 0.18], scale: [0.14, 0.12, 0.14], color: [0.12, 0.18, 0.22, 1], rotation: [0, 0, 0, 1] },
    ],
  },
} as const;

describe('Kenney item model catalog', () => {
  it('pins four official CC0 packs and nine deterministic recipes', () => {
    expect(Object.isFrozen(KENNEY_PACKS)).toBe(true);
    expect(Object.isFrozen(KENNEY_ITEM_RECIPES)).toBe(true);
    expect(KENNEY_PACKS).toEqual(expectedPacks);
    expect(KENNEY_ITEM_RECIPES).toEqual(expectedRecipes);
    expect(Object.keys(KENNEY_PACKS).sort()).toEqual([
      'blaster-kit', 'food-kit', 'prototype-kit', 'survival-kit',
    ]);
    expect(Object.keys(KENNEY_ITEM_RECIPES).sort()).toEqual(
      Object.keys(expectedTriangles).sort(),
    );
    expect(KENNEY_PACKS['blaster-kit']!.sha256).toBe(
      '91E3093E95427D59625E7E2CE2D0399B861600160FD0B4ADA7714796B67CEA8C',
    );
    expect(KENNEY_PACKS['food-kit']!.sha256).toBe(
      'CDAD90853682499B94C9FDA2F87678B24BFD8F3264E0ED323F6B6A27FD7C6F6F',
    );
    expect(KENNEY_PACKS['survival-kit']!.sha256).toBe(
      'C3586341B5932C87EB43D75D915434F47DAED168B17ED36A03E8CA9977C7443E',
    );
    expect(KENNEY_PACKS['prototype-kit']!.sha256).toBe(
      '213B522FB12BCC9B9AC66C4F7581F7C74623293272212E40A70C39936AD3DA95',
    );
    for (const [id, recipe] of Object.entries(KENNEY_ITEM_RECIPES)) {
      expect(recipe.expectedTriangles).toBe(
        expectedTriangles[id as keyof typeof expectedTriangles],
      );
    }
    expect(Object.values(expectedTriangles).reduce((sum, value) => sum + value, 0)).toBe(2_640);
  });
});

describe('Kenney item model builder', () => {
  let root: string;
  let sourceRoot: string;
  let outputRoot: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'kenney-item-models-'));
    sourceRoot = join(root, 'sources');
    outputRoot = join(root, 'output');
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('packages a requested direct model with its embedded texture', async () => {
    const entry = 'Models/GLB format/direct.glb';
    await writeFixture(join(sourceRoot, 'fixture-pack', ...entry.split('/')), 'source');

    await buildKenneyItemModels({
      sourceRoot,
      outputRoot,
      recipes: {
        directItem: {
          kind: 'direct',
          pack: 'fixture-pack',
          entry,
          expectedTriangles: 1,
          scale: [2, 3, 4],
        },
      },
    });

    expect(await readdir(outputRoot)).toEqual(['directItem.glb']);
    const document = await new NodeIO().read(join(outputRoot, 'directItem.glb'));
    expect(document.getRoot().listTextures()).toHaveLength(1);
    const texture = document.getRoot().listTextures()[0]!;
    const image = texture.getImage();
    expect(image).not.toBeNull();
    expect(Buffer.from(image!)).toEqual(PNG_1X1);
    const scene = document.getRoot().listScenes()[0]!;
    expect(scene.getName()).toBe('directItem');
    expect(scene.listChildren()[0]!.getScale()).toEqual([2, 3, 4]);
  });

  it('assembles two transformed parts into one composite model', async () => {
    const entry = 'Models/GLB format/part.glb';
    await writeFixture(join(sourceRoot, 'fixture-pack', ...entry.split('/')), 'part');

    await buildKenneyItemModels({
      sourceRoot,
      outputRoot,
      recipes: {
        compositeItem: {
          kind: 'composite',
          expectedTriangles: 2,
          parts: [
            {
              name: 'first',
              pack: 'fixture-pack',
              entry,
              translation: [1, 2, 3],
              rotation: [0, 0, 0, 1],
              scale: [2, 3, 4],
              color: [1, 0, 0, 1],
            },
            {
              name: 'second',
              pack: 'fixture-pack',
              entry,
              translation: [-1, -2, -3],
              rotation: [0, 0, 1, 0],
              scale: [0.5, 0.75, 1],
              color: [0, 0, 1, 1],
            },
          ],
        },
      },
    });

    expect(await readdir(outputRoot)).toEqual(['compositeItem.glb']);
    const document = await new NodeIO().read(join(outputRoot, 'compositeItem.glb'));
    const nodes = document.getRoot().listScenes()[0]!.listChildren();
    expect(nodes).toHaveLength(2);
    expect(nodes[0]!.getName()).toBe('compositeItem:first');
    expect(nodes[0]!.getTranslation()).toEqual([1, 2, 3]);
    expect(nodes[0]!.getRotation()).toEqual([0, 0, 0, 1]);
    expect(nodes[0]!.getScale()).toEqual([2, 3, 4]);
    expect(nodes[1]!.getName()).toBe('compositeItem:second');
    expect(nodes[1]!.getTranslation()).toEqual([-1, -2, -3]);
    expect(nodes[1]!.getRotation()).toEqual([0, 0, 1, 0]);
    expect(nodes[1]!.getScale()).toEqual([0.5, 0.75, 1]);
    expect(Object.fromEntries(document.getRoot().listMaterials().map((material) => [
      material.getName(), material.getBaseColorFactor(),
    ]))).toEqual({
      'first-material': [1, 0, 0, 1],
      'second-material': [0, 0, 1, 1],
    });
  });

  it('retains identical same-colored parts in the serialized triangle total', async () => {
    const entry = 'Models/GLB format/repeated.glb';
    await writeFixture(join(sourceRoot, 'fixture-pack', ...entry.split('/')), 'repeated');

    await buildKenneyItemModels({
      sourceRoot,
      outputRoot,
      recipes: {
        repeatedItem: {
          kind: 'composite',
          expectedTriangles: 2,
          parts: [
            {
              name: 'first',
              pack: 'fixture-pack',
              entry,
              translation: [-1, 0, 0],
              rotation: [0, 0, 0, 1],
              scale: [1, 1, 1],
              color: [1, 0, 0, 1],
            },
            {
              name: 'second',
              pack: 'fixture-pack',
              entry,
              translation: [1, 0, 0],
              rotation: [0, 0, 0, 1],
              scale: [1, 1, 1],
              color: [1, 0, 0, 1],
            },
          ],
        },
      },
    });

    const document = await new NodeIO().read(join(outputRoot, 'repeatedItem.glb'));
    expect(document.getRoot().listMeshes()).toHaveLength(2);
    expect(document.getRoot().listMeshes().reduce((total, mesh) => (
      total + mesh.listPrimitives().reduce((meshTotal, primitive) => (
        meshTotal + (primitive.getIndices()?.getCount()
          ?? primitive.getAttribute('POSITION')?.getCount()
          ?? 0) / 3
      ), 0)
    ), 0)).toBe(2);
  });

  it('identifies the item when a source entry is missing', async () => {
    await expect(buildKenneyItemModels({
      sourceRoot,
      outputRoot,
      recipes: {
        missingItem: {
          kind: 'direct',
          pack: 'fixture-pack',
          entry: 'Models/GLB format/missing.glb',
          expectedTriangles: 1,
          scale: [1, 1, 1],
        },
      },
    })).rejects.toThrow(/missingItem/);
  });
});

describe('Kenney item model CLI', () => {
  const scriptPath = resolve('scripts', 'kenney-item-models.mjs');

  it('prints the pinned pack descriptors as JSON', () => {
    const result = spawnSync(process.execPath, [scriptPath, '--packs'], { encoding: 'utf8' });

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(KENNEY_PACKS);
  });

  it('requires exactly two positional paths for a build', () => {
    const result = spawnSync(process.execPath, [scriptPath], { encoding: 'utf8' });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('<sourceRoot> <outputRoot>');
  });
});
