import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initialSelections, selectChoice, selectionSummary } from './board-state.mjs';

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
