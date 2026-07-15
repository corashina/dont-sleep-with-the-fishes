import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  candidateMetadata,
  initialPreviewStates,
  initialSelections,
  isChoiceSelectable,
  readySelectionSummary,
  reconcileSelections,
  selectionEvent,
  selectChoice,
  setPreviewState,
  selectionSummary,
  validatedKenneySourceUrl,
} from './board-state.mjs';

const previewCatalog = {
  items: {
    harpoon: [
      { id: 'current', label: 'Current harpoon', sourceAssetId: 'pack@1.0:current.glb' },
      { id: 'a', label: 'Harpoon A', sourceAssetId: 'pack@1.0:a.glb' },
      { id: 'b', label: 'Harpoon B', sourceAssetId: 'pack@1.0:b.glb' },
    ],
  },
};

test('defaults each row to current and changes one row at a time', () => {
  const state = initialSelections(['flareGun', 'ductTape']);
  assert.deepEqual(state, { flareGun: 'current', ductTape: 'current' });
  assert.deepEqual(selectChoice(state, 'flareGun', 'b'), { flareGun: 'b', ductTape: 'current' });
  assert.deepEqual(state, { flareGun: 'current', ductTape: 'current' });
});

test('rejects selection changes for unknown rows', () => {
  assert.throws(
    () => selectChoice({ flareGun: 'current' }, 'ductTape', 'a'),
    /Unknown item: ductTape/,
  );
});

test('summarizes every selected row with complete choice identity', () => {
  const catalog = {
    items: {
      flareGun: [
        { id: 'current', label: 'Current flare gun', sourceAssetId: 'pack:flare-current' },
        { id: 'b', label: 'Blue flare gun', sourceAssetId: 'pack:flare-b' },
      ],
      ductTape: [
        { id: 'current', label: 'Current tape', sourceAssetId: 'pack:tape-current' },
      ],
    },
  };

  assert.deepEqual(selectionSummary({ flareGun: 'b', ductTape: 'current' }, catalog), {
    flareGun: { candidateId: 'b', label: 'Blue flare gun', sourceAssetId: 'pack:flare-b' },
    ductTape: { candidateId: 'current', label: 'Current tape', sourceAssetId: 'pack:tape-current' },
  });
});

test('rejects unknown choices while producing a summary', () => {
  const catalog = {
    items: {
      flareGun: [{ id: 'current', label: 'Current flare gun', sourceAssetId: 'pack:flare-current' }],
    },
  };

  assert.throws(
    () => selectionSummary({ flareGun: 'missing' }, catalog),
    /Unknown choice: flareGun:missing/,
  );
});

test('preview choices stay disabled until their preview is ready', () => {
  const previews = initialPreviewStates(previewCatalog);

  assert.equal(isChoiceSelectable(previews, 'harpoon', 'current'), false);

  const ready = setPreviewState(previews, 'harpoon', 'current', 'ready');

  assert.equal(isChoiceSelectable(ready, 'harpoon', 'current'), true);
  assert.equal(isChoiceSelectable(previews, 'harpoon', 'current'), false);
});

test('readySelectionSummary does not emit pending or failed choices', () => {
  const selections = initialSelections(['harpoon']);
  const pending = initialPreviewStates(previewCatalog);
  const failed = setPreviewState(pending, 'harpoon', 'current', 'failed');

  assert.equal(readySelectionSummary(selections, previewCatalog, pending), null);
  assert.equal(readySelectionSummary(selections, previewCatalog, failed), null);
});

test('reconcileSelections falls back from a failed current choice to the first successful choice', () => {
  const selections = initialSelections(['harpoon']);
  let previews = initialPreviewStates(previewCatalog);
  previews = setPreviewState(previews, 'harpoon', 'current', 'failed');
  previews = setPreviewState(previews, 'harpoon', 'a', 'ready');
  previews = setPreviewState(previews, 'harpoon', 'b', 'ready');

  assert.deepEqual(reconcileSelections(selections, previewCatalog, previews), { harpoon: 'a' });
});

test('reconcileSelections rejects rows without a successful preview', () => {
  const selections = initialSelections(['harpoon']);
  let previews = initialPreviewStates(previewCatalog);
  previews = setPreviewState(previews, 'harpoon', 'current', 'failed');
  previews = setPreviewState(previews, 'harpoon', 'a', 'failed');
  previews = setPreviewState(previews, 'harpoon', 'b', 'failed');

  assert.throws(
    () => reconcileSelections(selections, previewCatalog, previews),
    /No successful choice for item: harpoon/,
  );
});

test('validatedKenneySourceUrl accepts only HTTPS Kenney asset pages', () => {
  assert.equal(
    validatedKenneySourceUrl('https://kenney.nl/assets/blaster-kit'),
    'https://kenney.nl/assets/blaster-kit',
  );
  assert.equal(
    validatedKenneySourceUrl('https://www.kenney.nl/assets/blaster-kit'),
    'https://www.kenney.nl/assets/blaster-kit',
  );
});

test('validatedKenneySourceUrl rejects off-domain and attribute-like URLs', () => {
  for (const url of [
    'https://evil.example/assets/blaster-kit',
    'https://kenney.nl.evil.example/assets/blaster-kit',
    'https://kenney.nl/not-assets/blaster-kit',
    'http://kenney.nl/assets/blaster-kit',
    'https://kenney.nl/assets/blaster-kit\" onmouseover=\"alert(1)',
    "https://kenney.nl/assets/blaster-kit' onclick='alert(1)",
  ]) {
    assert.throws(() => validatedKenneySourceUrl(url), /Invalid Kenney asset URL/);
  }
});

test('candidateMetadata derives pack versions and direct/composite status from sourceAssetId', () => {
  assert.deepEqual(candidateMetadata('blaster-kit@1.0:Models/GLB/weapon.glb'), {
    packs: [{ name: 'blaster-kit', version: '1.0' }],
    status: 'direct',
  });
  assert.deepEqual(candidateMetadata('blaster-kit@1.0+space-kit@2.0:composite/weapon.glb'), {
    packs: [
      { name: 'blaster-kit', version: '1.0' },
      { name: 'space-kit', version: '2.0' },
    ],
    status: 'composite',
  });
});

test('selectionEvent uses the companion-persisted choice envelope', () => {
  const selections = {
    harpoon: {
      candidateId: 'a',
      label: 'Harpoon A',
      sourceAssetId: 'pack@1.0:a.glb',
    },
  };

  assert.deepEqual(selectionEvent(selections), {
    type: 'choice',
    choice: 'selection-summary',
    selections,
  });
});
