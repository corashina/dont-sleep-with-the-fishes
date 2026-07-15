import assert from 'node:assert/strict';
import { test } from 'node:test';
import { candidateKey, ITEM_IDS, validateCatalog } from './catalog.mjs';

const fixture = {
  packs: {
    survival: {
      pageUrl: 'https://kenney.nl/assets/survival-kit',
      version: '2.0',
      archiveUrl: 'https://kenney.nl/media/pages/assets/survival-kit/example/kenney_survival-kit.zip',
      sha256: 'A'.repeat(64),
      requiredEntries: [
        'License.txt',
        'Models/GLB format/bottle.glb',
        ...ITEM_IDS.flatMap((itemId) => ['a', 'b', 'c'].map((id) => `Models/GLB format/${itemId}-${id}.glb`)),
      ],
    },
  },
  items: Object.fromEntries(ITEM_IDS.map((itemId) => [itemId, [
    {
      id: 'current', label: 'Keep current', kind: 'current',
      sourceUrl: 'https://kenney.nl/assets/survival-kit', sourceAssetId: 'current',
      modelFile: `${itemId}--current.glb`, triangles: 100, fit: 'Current production model.',
    },
    ...['a', 'b', 'c'].map((id) => ({
      id, label: `Candidate ${id.toUpperCase()}`, kind: 'direct',
      sourceUrl: 'https://kenney.nl/assets/survival-kit',
      sourceAssetId: `survival-kit@2.0:Models/GLB format/${itemId}-${id}.glb`,
      modelFile: `${itemId}--${id}.glb`, triangles: 200, fit: 'Readable silhouette.',
      recipe: { kind: 'direct', pack: 'survival', entry: `Models/GLB format/${itemId}-${id}.glb`, expectedTriangles: 200 },
    })),
  ]])),
};

function compositeRecipe() {
  return {
    kind: 'composite',
    expectedTriangles: 200,
    parts: [{
      name: 'body',
      pack: 'survival',
      entry: 'Models/GLB format/bottle.glb',
      translation: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
      color: [1, 1, 1, 1],
    }],
  };
}

test('accepts nine rows with current plus three official Kenney choices', () => {
  assert.doesNotThrow(() => validateCatalog(fixture));
  assert.equal(candidateKey('flareGun', 'a'), 'flareGun--a');
});

test('rejects candidates above the triangle budget', () => {
  const invalid = structuredClone(fixture);
  invalid.items.flareGun[1].triangles = 3001;
  assert.throws(() => validateCatalog(invalid), /flareGun.*3,000/);
});

test('requires exactly one current choice and unique choice IDs per row', () => {
  const duplicateCurrent = structuredClone(fixture);
  duplicateCurrent.items.flareGun[1] = structuredClone(duplicateCurrent.items.flareGun[0]);
  assert.throws(() => validateCatalog(duplicateCurrent), /flareGun.*exactly one current/);

  const duplicateId = structuredClone(fixture);
  duplicateId.items.flareGun[2].id = 'a';
  assert.throws(() => validateCatalog(duplicateId), /flareGun.*unique choice IDs/);
});

test('requires direct recipes to match the choice and reference an allowlisted pack entry', () => {
  const mismatchedKind = structuredClone(fixture);
  mismatchedKind.items.flareGun[1].recipe.kind = 'composite';
  assert.throws(() => validateCatalog(mismatchedKind), /flareGun\.a.*recipe kind/);

  const unknownPack = structuredClone(fixture);
  unknownPack.items.flareGun[1].recipe.pack = 'unknown';
  assert.throws(() => validateCatalog(unknownPack), /flareGun\.a.*unknown pack/);

  const unapprovedEntry = structuredClone(fixture);
  unapprovedEntry.items.flareGun[1].recipe.entry = 'Models/GLB format/not-approved.glb';
  assert.throws(() => validateCatalog(unapprovedEntry), /flareGun\.a.*approved archive entry/);
});

test('accepts a reproducible composite recipe', () => {
  const catalog = structuredClone(fixture);
  catalog.items.flareGun[1].kind = 'composite';
  catalog.items.flareGun[1].recipe = compositeRecipe();
  assert.doesNotThrow(() => validateCatalog(catalog));
});

test('validates composite recipe provenance, transforms, color, and triangle budget', () => {
  const invalidPartPack = structuredClone(fixture);
  invalidPartPack.items.flareGun[1].kind = 'composite';
  invalidPartPack.items.flareGun[1].recipe = compositeRecipe();
  invalidPartPack.items.flareGun[1].recipe.parts[0].pack = 'unknown';
  assert.throws(() => validateCatalog(invalidPartPack), /flareGun\.a.*parts\.0.*unknown pack/);

  const invalidPartEntry = structuredClone(fixture);
  invalidPartEntry.items.flareGun[1].kind = 'composite';
  invalidPartEntry.items.flareGun[1].recipe = compositeRecipe();
  invalidPartEntry.items.flareGun[1].recipe.parts[0].entry = 'Models/GLB format/not-approved.glb';
  assert.throws(() => validateCatalog(invalidPartEntry), /flareGun\.a.*parts\.0.*approved archive entry/);

  for (const [field, length] of [['translation', 3], ['rotation', 4], ['scale', 3], ['color', 4]]) {
    const invalidVector = structuredClone(fixture);
    invalidVector.items.flareGun[1].kind = 'composite';
    invalidVector.items.flareGun[1].recipe = compositeRecipe();
    invalidVector.items.flareGun[1].recipe.parts[0][field] = Array(length - 1).fill(0);
    assert.throws(() => validateCatalog(invalidVector), new RegExp(`flareGun\\.a.*${field}.*${length}`));
  }

  const invalidTriangles = structuredClone(fixture);
  invalidTriangles.items.flareGun[1].kind = 'composite';
  invalidTriangles.items.flareGun[1].recipe = compositeRecipe();
  invalidTriangles.items.flareGun[1].recipe.expectedTriangles = 3001;
  assert.throws(() => validateCatalog(invalidTriangles), /flareGun\.a.*expectedTriangles.*3,000/);
});
