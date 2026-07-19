import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
// @ts-expect-error This JavaScript audit entry point intentionally has no declaration file.
import { countTriangles } from '../scripts/check-item-models.mjs';
import {
  buildQuaterniusItemModels,
  QUATERNIUS_ITEM_RECIPES,
  QUATERNIUS_PACKS,
} from '../scripts/quaternius-item-models.mjs';

const expectedPacks = {
  survival: {
    version: '2020-09',
    pageUrl: 'https://quaternius.com/packs/survival.html',
    sha256: 'DB7E41CE2B2F872480E3C24236FDB5CE64AD05071C436B6C47BC455CD3540EB5',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    requiredEntries: ['Compass_Open.obj', 'Compass_Open.mtl', 'FlareGun.obj', 'FlareGun.mtl'],
  },
  pirate: {
    version: '2023-11',
    pageUrl: 'https://quaternius.com/packs/piratekit.html',
    sha256: 'ED201326D2F80CFAC4E3CDC7DB34152078AE35F98D77AA14ED7416A931276D36',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    requiredEntries: ['Prop_Anchor.obj', 'Prop_Anchor.mtl'],
  },
} as const;

const expectedRecipes = {
  compass: { pack: 'survival', obj: 'Compass_Open.obj', mtl: 'Compass_Open.mtl', expectedTriangles: 656 },
  flareGun: { pack: 'survival', obj: 'FlareGun.obj', mtl: 'FlareGun.mtl', expectedTriangles: 540 },
  anchor: { pack: 'pirate', obj: 'Prop_Anchor.obj', mtl: 'Prop_Anchor.mtl', expectedTriangles: 544 },
} as const;

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

describe('Quaternius item model catalog', () => {
  it('pins the two approved CC0 packs and exact three-item recipe table', () => {
    expect(Object.isFrozen(QUATERNIUS_PACKS)).toBe(true);
    expect(Object.isFrozen(QUATERNIUS_ITEM_RECIPES)).toBe(true);
    expect(QUATERNIUS_PACKS).toEqual(expectedPacks);
    expect(QUATERNIUS_ITEM_RECIPES).toEqual(expectedRecipes);
  });
});

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

  it('triangulates faces, retains selected MTL colors, and transfers normals', async () => {
    await writeFixture();

    await buildQuaterniusItemModels({ sourceRoot, outputRoot, recipes: fixtureRecipes });

    const document = await new NodeIO().read(join(outputRoot, 'fixture.glb'));
    expect(await countTriangles(join(outputRoot, 'fixture.glb'))).toBe(3);
    expect(document.getRoot().listMaterials().map((material) => material.getBaseColorFactor()))
      .toEqual([[1, 0, 0, 1], [0, 0, 1, 1]]);
    for (const primitive of document.getRoot().listMeshes()[0]!.listPrimitives()) {
      expect(Array.from(primitive.getAttribute('NORMAL')!.getArray()!))
        .toEqual(Array(primitive.getAttribute('NORMAL')!.getCount()).fill([0, 0, 1]).flat());
    }
  });

  it.each([
    ['a face with fewer than three vertices', fixtureObj.replace('f 1//1 3//1 4//1', 'f 1//1 3//1')],
    ['a zero position index', fixtureObj.replace('f 1//1 3//1 4//1', 'f 0//1 3//1 4//1')],
    ['an out-of-range position index', fixtureObj.replace('f 1//1 3//1 4//1', 'f 5//1 3//1 4//1')],
    ['an unknown usemtl material', fixtureObj.replace('usemtl blue', 'usemtl missing')],
    ['a missing normal index', fixtureObj.replace('f 1//1 3//1 4//1', 'f 1 3 4')],
    ['a malformed texture-coordinate index', fixtureObj.replace('f 1//1 3//1 4//1', 'f 1/not-an-index/1 3/1/1 4/1/1')],
    ['an out-of-range texture-coordinate index', fixtureObj.replace('f 1//1 3//1 4//1', 'f 1/1/1 3/1/1 4/1/1')],
  ])('rejects %s with its item ID and source filename', async (_name, obj) => {
    await writeFixture(obj);

    await expect(buildQuaterniusItemModels({ sourceRoot, outputRoot, recipes: fixtureRecipes }))
      .rejects.toThrow(/fixture.*fixture\.obj/i);
  });

  it.each([
    ['a negative Kd component', fixtureMtl.replace('Kd 1 0 0', 'Kd -0.1 0 0')],
    ['a d component above one', fixtureMtl.replace('d 1', 'd 1.1')],
  ])('rejects %s with its item ID and MTL filename', async (_name, mtl) => {
    await writeFixture(fixtureObj, mtl);

    await expect(buildQuaterniusItemModels({ sourceRoot, outputRoot, recipes: fixtureRecipes }))
      .rejects.toThrow(/fixture.*fixture\.mtl/i);
  });

  it('builds the approved three sources with stable triangle counts', async () => {
    await buildQuaterniusItemModels({
      sourceRoot: resolve('third_party/quaternius-items'),
      outputRoot,
    });

    await expect(countTriangles(join(outputRoot, 'compass.glb'))).resolves.toBe(656);
    await expect(countTriangles(join(outputRoot, 'flareGun.glb'))).resolves.toBe(540);
    await expect(countTriangles(join(outputRoot, 'anchor.glb'))).resolves.toBe(544);
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
