import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { Document, Primitive } from '@gltf-transform/core';
import { ITEM_IDS } from './catalog.mjs';
import * as modelAudit from './audit-models.mjs';
import * as modelBuild from './build-models.mjs';

const direct = (suffix) => ({
  kind: 'direct', pack: 'prototype', entry: `Models/GLB format/${suffix}.glb`, expectedTriangles: 100,
});
const catalog = {
  items: Object.fromEntries(ITEM_IDS.map((itemId) => [itemId, [
    { id: 'current', kind: 'current' },
    { id: 'a', kind: 'direct', recipe: direct(`${itemId}-a`) },
    { id: 'b', kind: 'direct', recipe: direct(`${itemId}-b`) },
    { id: 'c', kind: 'direct', recipe: direct(`${itemId}-c`) },
  ]])),
};

test('flattens alternative recipes and excludes current models', () => {
  const recipes = modelBuild.recipesFromCatalog(catalog);
  assert.equal(Object.keys(recipes).length, 27);
  assert.deepEqual(recipes['flareGun--a'], direct('flareGun-a'));
  assert.deepEqual(recipes['flareGun--b'], direct('flareGun-b'));
  assert.equal(recipes['flareGun--current'], undefined);
});

test('rejects an unexpected stale model file in the audited directory', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'kenney-model-audit-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const catalogText = await readFile(new URL('./selection-catalog.json', import.meta.url), 'utf8');
  const selectionCatalog = JSON.parse(catalogText);
  const modelsRoot = join(root, 'models');
  await mkdir(modelsRoot);
  await writeFile(join(root, 'selection-catalog.json'), catalogText);
  for (const choices of Object.values(selectionCatalog.items)) {
    for (const { modelFile } of choices) await writeFile(join(modelsRoot, modelFile), '');
  }
  await writeFile(join(modelsRoot, 'stale.glb'), '');

  await assert.rejects(
    () => modelAudit.auditSelectionModels(root),
    { message: 'unexpected model file: stale.glb' },
  );
});

test('rejects non-TRIANGLES primitives before counting', () => {
  const document = new Document();
  const buffer = document.createBuffer();
  const positions = document.createAccessor()
    .setType('VEC3')
    .setArray(new Float32Array([0, 0, 0, 1, 0, 0]))
    .setBuffer(buffer);
  document.createMesh().addPrimitive(
    document.createPrimitive()
      .setMode(Primitive.Mode.LINES)
      .setAttribute('POSITION', positions),
  );

  assert.throws(
    () => modelAudit.countTriangles(document, 'lines.glb'),
    { message: 'lines.glb: primitive mode 1 is not TRIANGLES' },
  );
});

test('copies current models to candidate-key output filenames', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'kenney-current-models-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const sourceRoot = join(root, 'source');
  const outputRoot = join(root, 'output');
  await mkdir(sourceRoot);
  await mkdir(outputRoot);
  for (const itemId of ITEM_IDS) {
    await writeFile(join(sourceRoot, `${itemId}.glb`), itemId);
  }

  await modelBuild.copyCurrentModels({ sourceRoot, outputRoot });

  assert.deepEqual(
    (await readdir(outputRoot)).sort(),
    ITEM_IDS.map((itemId) => `${itemId}--current.glb`).sort(),
  );
  assert.equal(await readFile(join(outputRoot, 'flareGun--current.glb'), 'utf8'), 'flareGun');
});
