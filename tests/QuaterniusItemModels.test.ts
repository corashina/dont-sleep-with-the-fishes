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
