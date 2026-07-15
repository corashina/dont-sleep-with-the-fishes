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
      requiredEntries: ['License.txt', 'Models/GLB format/bottle.glb'],
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

test('accepts nine rows with current plus three official Kenney choices', () => {
  assert.doesNotThrow(() => validateCatalog(fixture));
  assert.equal(candidateKey('flareGun', 'a'), 'flareGun--a');
});

test('rejects candidates above the triangle budget', () => {
  const invalid = structuredClone(fixture);
  invalid.items.flareGun[1].triangles = 3001;
  assert.throws(() => validateCatalog(invalid), /flareGun.*3,000/);
});
