import { expect, it } from 'vitest';
import {
  MENU_MODEL_PLACEMENTS,
  MENU_PROTECTED_FOOTPRINTS,
  findMenuPlacementOverlaps,
} from '../src/menu/MenuSceneLayout';
import { MENU_MODEL_SPECS } from '../src/menu/menuModelManifest';

it('contains each model under any ground rotation', () => {
  for (const placement of MENU_MODEL_PLACEMENTS) {
    const spec = MENU_MODEL_SPECS[placement.modelId];
    const { min, max } = spec.generatedMetadata.rawBounds;
    const rawSize = [
      max[0] - min[0],
      max[1] - min[1],
      max[2] - min[2],
    ] as const;
    const scale = spec.targetLongestDimension / Math.max(...rawSize);
    const radius = 0.5 * Math.hypot(...rawSize) * scale;
    expect(placement.halfSize[0], placement.id).toBeGreaterThanOrEqual(radius);
    expect(placement.halfSize[1], placement.id).toBeGreaterThanOrEqual(radius);
  }
});

it('keeps every static model outside other model footprints', () => {
  expect(findMenuPlacementOverlaps([
    ...MENU_PROTECTED_FOOTPRINTS,
    ...MENU_MODEL_PLACEMENTS,
  ])).toEqual([]);
});

it('fills both sides and every depth layer', () => {
  const xs = MENU_MODEL_PLACEMENTS.map(({ position }) => position[0]);
  const zs = MENU_MODEL_PLACEMENTS.map(({ position }) => position[2]);
  expect(Math.min(...xs)).toBeLessThan(-25);
  expect(Math.max(...xs)).toBeGreaterThan(25);
  expect(Math.min(...zs)).toBeLessThan(-35);
  expect(zs.some((z) => z > -8)).toBe(true);
  expect(zs.some((z) => z <= -8 && z > -20)).toBe(true);
  expect(zs.some((z) => z <= -20)).toBe(true);
});
