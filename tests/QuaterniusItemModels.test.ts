import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
// @ts-expect-error This JavaScript audit entry point intentionally has no declaration file.
import { countTriangles } from '../scripts/check-item-models.mjs';
import {
  buildQuaterniusItemModels,

} from '../scripts/quaternius-item-models.mjs';


const fixtureMtl = `
newmtl red
Kd 1 0 0
d 1
newmtl blue
Kd 0 0 1
d 1
`;

const fixtureObj = `
o fixture
v 0 0 0
v 1 0 0
v 1 1 0
v 0 1 0
vn 0 0 1
usemtl red
f 1//1 2//1 3//1 4//1
usemtl blue
f 1//1 3//1 4//1
`;

const fixtureRecipes = {
  fixture: { pack: 'fixture-pack', obj: 'fixture.obj', mtl: 'fixture.mtl', expectedTriangles: 3 },
} as const;

const overriddenFixtureRecipes = {
  fixture: {
    ...fixtureRecipes.fixture,
    materialOverrides: {
      red: {
        baseColorFactor: [0.1329, 0.1714, 0.2051, 1],
        metallicFactor: 0.85,
        roughnessFactor: 0.42,
      },
    },
  },
} as const;

async function readGlbJson(path: string): Promise<{
  materials?: {
    name?: string;
    pbrMetallicRoughness?: {
      baseColorFactor?: number[];
      metallicFactor?: number;
      roughnessFactor?: number;
    };
  }[];
}> {
  const glb = await readFile(path);
  const jsonChunkLength = glb.readUInt32LE(12);
  expect(glb.toString('ascii', 16, 20)).toBe('JSON');
  return JSON.parse(glb.toString('utf8', 20, 20 + jsonChunkLength));
}

describe('Quaternius item model builder', () => {
  let root: string;
  let sourceRoot: string;
  let outputRoot: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'quaternius-item-models-'));
    sourceRoot = join(root, 'sources');
    outputRoot = join(root, 'output');
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function writeFixture(obj = fixtureObj, mtl = fixtureMtl): Promise<void> {
    const directory = join(sourceRoot, 'fixture-pack');
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'fixture.obj'), obj, 'utf8');
    await writeFile(join(directory, 'fixture.mtl'), mtl, 'utf8');
  }

  it('triangulates faces, applies named PBR overrides, and preserves other MTL materials', async () => {
    await writeFixture();

    await buildQuaterniusItemModels({ sourceRoot, outputRoot, recipes: overriddenFixtureRecipes });

    const document = await new NodeIO().read(join(outputRoot, 'fixture.glb'));
    expect(await countTriangles(join(outputRoot, 'fixture.glb'))).toBe(3);
    const [red, blue] = document.getRoot().listMaterials();
    expect(red?.getBaseColorFactor()).toEqual([0.1329, 0.1714, 0.2051, 1]);
    expect(red?.getMetallicFactor()).toBe(0.85);
    expect(red?.getRoughnessFactor()).toBe(0.42);
    expect(blue?.getBaseColorFactor()).toEqual([0, 0, 1, 1]);
    expect(blue?.getMetallicFactor()).toBe(1);
    expect(blue?.getRoughnessFactor()).toBe(1);
    for (const primitive of document.getRoot().listMeshes()[0]!.listPrimitives()) {
      expect(Array.from(primitive.getAttribute('NORMAL')!.getArray()!))
        .toEqual(Array(primitive.getAttribute('NORMAL')!.getCount()).fill([0, 0, 1]).flat());
    }

    const json = await readGlbJson(join(outputRoot, 'fixture.glb'));
    const redJson = json.materials?.find(({ name }) => name === 'red')?.pbrMetallicRoughness;
    const blueJson = json.materials?.find(({ name }) => name === 'blue')?.pbrMetallicRoughness;
    expect(redJson).toMatchObject({
      baseColorFactor: [0.1329, 0.1714, 0.2051, 1],
      metallicFactor: 0.85,
      roughnessFactor: 0.42,
    });
    expect(blueJson).toEqual({
      baseColorFactor: [0, 0, 1, 1],
    });
  });

  it('rejects material override keys missing from the parsed MTL', async () => {
    await writeFixture();

    await expect(buildQuaterniusItemModels({
      sourceRoot,
      outputRoot,
      recipes: {
        fixture: {
          ...fixtureRecipes.fixture,
          materialOverrides: {
            missing: {
              baseColorFactor: [1, 1, 1, 1],
              metallicFactor: 0,
              roughnessFactor: 1,
            },
          },
        },
      },
    })).rejects.toThrow(/fixture.*missing/i);
  });

  it.each([
    ['baseColorFactor length', { baseColorFactor: [0, 0, 0], metallicFactor: 0, roughnessFactor: 1 }],
    ['baseColorFactor finite', { baseColorFactor: [0, 0, Number.NaN, 1], metallicFactor: 0, roughnessFactor: 1 }],
    ['baseColorFactor range', { baseColorFactor: [0, 0, 1.1, 1], metallicFactor: 0, roughnessFactor: 1 }],
    ['metallicFactor finite', { baseColorFactor: [0, 0, 0, 1], metallicFactor: Number.NaN, roughnessFactor: 1 }],
    ['metallicFactor range', { baseColorFactor: [0, 0, 0, 1], metallicFactor: -0.1, roughnessFactor: 1 }],
    ['roughnessFactor finite', { baseColorFactor: [0, 0, 0, 1], metallicFactor: 0, roughnessFactor: Infinity }],
    ['roughnessFactor range', { baseColorFactor: [0, 0, 0, 1], metallicFactor: 0, roughnessFactor: 1.1 }],
  ])('rejects invalid reusable %s overrides', async (_label, override) => {
    await writeFixture();

    await expect(buildQuaterniusItemModels({
      sourceRoot,
      outputRoot,
      recipes: {
        fixture: {
          ...fixtureRecipes.fixture,
          materialOverrides: { red: override as never },
        },
      },
    })).rejects.toThrow(/fixture.*red.*factor/i);
  });

  it('regenerates legacy non-overridden Quaternius models byte-for-byte', async () => {
    await buildQuaterniusItemModels({
      sourceRoot: resolve('third_party/quaternius-items'),
      outputRoot,
    });

    for (const id of ['compass', 'flareGun']) {
      expect(await readFile(join(outputRoot, `${id}.glb`)))
        .toEqual(await readFile(resolve('src/assets/models/items', `${id}.glb`)));
    }
  });


  it('builds the approved three sources with stable triangle counts', async () => {
    await buildQuaterniusItemModels({
      sourceRoot: resolve('third_party/quaternius-items'),
      outputRoot,
    });

    await expect(countTriangles(join(outputRoot, 'compass.glb'))).resolves.toBe(656);
    await expect(countTriangles(join(outputRoot, 'flareGun.glb'))).resolves.toBe(540);
    await expect(countTriangles(join(outputRoot, 'anchor.glb'))).resolves.toBe(544);
    const anchor = await new NodeIO().read(join(outputRoot, 'anchor.glb'));
    const [steel] = anchor.getRoot().listMaterials();
    expect(anchor.getRoot().listMaterials()).toHaveLength(1);
    expect(steel?.getBaseColorFactor()).toEqual([0.1329, 0.1714, 0.2051, 1]);
    expect(steel?.getMetallicFactor()).toBe(0.85);
    expect(steel?.getRoughnessFactor()).toBe(0.42);
  });

  it('writes deterministic self-contained GLB bytes', async () => {
    const firstRoot = join(root, 'first');
    const secondRoot = join(root, 'second');
    const source = resolve('third_party/quaternius-items');

    await buildQuaterniusItemModels({ sourceRoot: source, outputRoot: firstRoot });
    await buildQuaterniusItemModels({ sourceRoot: source, outputRoot: secondRoot });

    for (const id of ['compass', 'flareGun', 'anchor']) {
      expect(await readFile(join(firstRoot, `${id}.glb`)))
        .toEqual(await readFile(join(secondRoot, `${id}.glb`)));
    }
  });
});
