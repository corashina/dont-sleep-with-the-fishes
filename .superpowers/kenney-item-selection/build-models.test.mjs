import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ITEM_IDS } from './catalog.mjs';
import { recipesFromCatalog } from './build-models.mjs';

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
  const recipes = recipesFromCatalog(catalog);
  assert.equal(Object.keys(recipes).length, 27);
  assert.deepEqual(recipes['flareGun--a'], direct('flareGun-a'));
  assert.deepEqual(recipes['flareGun--b'], direct('flareGun-b'));
  assert.equal(recipes['flareGun--current'], undefined);
});
