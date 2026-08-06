import { expect, it } from 'vitest';
import {
  MENU_MODEL_PLACEMENTS,
  MENU_PROTECTED_FOOTPRINTS,
  findMenuPlacementOverlaps,
} from '../src/menu/MenuSceneLayout';

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
