import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import {
  buildKenneyShipFurniture,
  KENNEY_SHIP_FURNITURE_PACK,
  KENNEY_SHIP_FURNITURE_RECIPES,
} from '../scripts/kenney-ship-furniture.mjs';

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+XxL7WQAAAABJRU5ErkJggg==',
  'base64',
);

async function writeFixture(path: string): Promise<void> {
  const io = new NodeIO();
  const document = new Document();
  const buffer = document.createBuffer();
  const position = document.createAccessor('position', buffer)
    .setType('VEC3')
    .setArray(new Float32Array([0, 0, 0, 2, 0, 0, 0, 1, 0]));
  const texture = document.createTexture('colormap')
    .setImage(new Uint8Array(PNG_1X1))
    .setMimeType('image/png');
  const material = document.createMaterial('kenney-material').setBaseColorTexture(texture);
  const primitive = document.createPrimitive().setAttribute('POSITION', position).setMaterial(material);
  const mesh = document.createMesh('source-mesh').addPrimitive(primitive);
  const scene = document.createScene('source-scene');
  scene.addChild(document.createNode('source-root').setMesh(mesh));

  const unusedPosition = document.createAccessor('unused-position', buffer)
    .setType('VEC3')
    .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]));
  document.createMesh('unused-mesh')
    .addPrimitive(document.createPrimitive().setAttribute('POSITION', unusedPosition));

  await mkdir(dirname(path), { recursive: true });
  await io.write(path, document);
}

async function writeRepeatedPartFixture(path: string): Promise<void> {
  const io = new NodeIO();
  const document = new Document();
  const buffer = document.createBuffer();
  const position = document.createAccessor('position', buffer)
    .setType('VEC3')
    .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]));
  const material = document.createMaterial('material');
  const firstMesh = document.createMesh('repeated-part').addPrimitive(
    document.createPrimitive().setAttribute('POSITION', position).setMaterial(material),
  );
  document.createMesh('repeated-part').addPrimitive(
    document.createPrimitive().setAttribute('POSITION', position).setMaterial(material),
  );
  const rootNode = document.createNode('source-root')
    .addChild(document.createNode('first').setMesh(firstMesh))
    .addChild(document.createNode('second').setMesh(firstMesh));
  document.createScene('source-scene').addChild(rootNode);
  await mkdir(dirname(path), { recursive: true });
  await io.write(path, document);
}

const expectedRecipes = {
  bedBunk: { entry: 'Models/GLTF format/bedBunk.glb', expectedTriangles: 580 },
  desk: { entry: 'Models/GLTF format/desk.glb', expectedTriangles: 198 },
  chairDesk: { entry: 'Models/GLTF format/chairDesk.glb', expectedTriangles: 588 },
  bookcaseOpen: { entry: 'Models/GLTF format/bookcaseOpen.glb', expectedTriangles: 320 },
  bookcaseClosedDoors: { entry: 'Models/GLTF format/bookcaseClosedDoors.glb', expectedTriangles: 296 },
  table: { entry: 'Models/GLTF format/table.glb', expectedTriangles: 120 },
  sideTableDrawers: { entry: 'Models/GLTF format/sideTableDrawers.glb', expectedTriangles: 238 },
} as const;

describe('Kenney ship furniture catalog', () => {
  it('pins Furniture Kit 1.0 and exactly seven direct recipes', () => {
    expect(Object.isFrozen(KENNEY_SHIP_FURNITURE_PACK)).toBe(true);
    expect(Object.isFrozen(KENNEY_SHIP_FURNITURE_RECIPES)).toBe(true);
    expect(KENNEY_SHIP_FURNITURE_PACK).toEqual({
      version: '1.0',
      pageUrl: 'https://kenney.nl/assets/furniture-kit',
      archiveUrl: 'https://kenney.nl/media/pages/assets/furniture-kit/440e0608a4-1677580847/kenney_furniture-kit.zip',
      sha256: 'E67652D0932CEE41683F74711C03D3E192A2AF9979EF8E6B237711F5482D46B0',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
      requiredEntries: ['License.txt', ...Object.values(expectedRecipes).map(({ entry }) => entry)],
    });
    expect(KENNEY_SHIP_FURNITURE_RECIPES).toEqual(expectedRecipes);
    expect(Object.values(KENNEY_SHIP_FURNITURE_RECIPES)
      .reduce((sum, recipe) => sum + recipe.expectedTriangles, 0)).toBe(2_340);
  });
});

describe('Kenney ship furniture builder', () => {
  let root: string;
  let sourceRoot: string;
  let outputRoot: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'kenney-ship-furniture-'));
    sourceRoot = join(root, 'sources');
    outputRoot = join(root, 'output');
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('directly packages geometry and embedded textures while pruning unused data', async () => {
    const entry = 'Models/GLTF format/direct.glb';
    await writeFixture(join(sourceRoot, ...entry.split('/')));

    await buildKenneyShipFurniture({
      sourceRoot,
      outputRoot,
      recipes: { fixtureFurniture: { entry, expectedTriangles: 1 } },
    });

    expect(await readdir(outputRoot)).toEqual(['fixtureFurniture.glb']);
    const document = await new NodeIO().read(join(outputRoot, 'fixtureFurniture.glb'));
    expect(document.getRoot().listMeshes()).toHaveLength(1);
    expect(document.getRoot().listMaterials()[0]!.getName()).toBe('kenney-material');
    expect(Buffer.from(document.getRoot().listTextures()[0]!.getImage()!)).toEqual(PNG_1X1);
    const scene = document.getRoot().listScenes()[0]!;
    expect(scene.getName()).toBe('fixtureFurniture');
    expect(scene.listChildren()[0]!.getName()).toBe('fixtureFurniture');
    expect(scene.listChildren()[0]!.getScale()).toEqual([1, 1, 1]);
    expect(document.getRoot().listAccessors()[0]!.getArray()).toEqual(
      new Float32Array([0, 0, 0, 2, 0, 0, 0, 1, 0]),
    );
  });

  it('identifies a missing source entry', async () => {
    await expect(buildKenneyShipFurniture({
      sourceRoot,
      outputRoot,
      recipes: {
        missingFurniture: { entry: 'Models/GLTF format/missing.glb', expectedTriangles: 1 },
      },
    })).rejects.toThrow(/missingFurniture/);
  });

  it('retains repeated source mesh parts in the committed triangle total', async () => {
    const entry = 'Models/GLTF format/repeated.glb';
    await writeRepeatedPartFixture(join(sourceRoot, ...entry.split('/')));

    await buildKenneyShipFurniture({
      sourceRoot,
      outputRoot,
      recipes: { repeatedFurniture: { entry, expectedTriangles: 2 } },
    });

    const document = await new NodeIO().read(join(outputRoot, 'repeatedFurniture.glb'));
    expect(document.getRoot().listMeshes()).toHaveLength(1);
    let renderedTriangles = 0;
    document.getRoot().listScenes()[0]!.listChildren()[0]!.traverse((node) => {
      for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
        renderedTriangles += (primitive.getIndices()?.getCount()
          ?? primitive.getAttribute('POSITION')?.getCount()
          ?? 0) / 3;
      }
    });
    expect(renderedTriangles).toBe(2);
  });

  it('rejects a source whose triangle count differs from the pinned recipe', async () => {
    const entry = 'Models/GLTF format/direct.glb';
    await writeFixture(join(sourceRoot, ...entry.split('/')));

    await expect(buildKenneyShipFurniture({
      sourceRoot,
      outputRoot,
      recipes: { wrongCount: { entry, expectedTriangles: 2 } },
    })).rejects.toThrow('wrongCount: expected 2 triangles, received 1');
  });
});
