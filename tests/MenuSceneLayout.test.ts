import { Euler, Vector3 } from 'three';
import { expect, it } from 'vitest';
import {
  MENU_MODEL_PLACEMENTS,
  MENU_PROTECTED_FOOTPRINTS,
  findClearMenuX,
  findMenuPlacementOverlaps,
} from '../src/menu/MenuSceneLayout';
import { MENU_MODEL_SPECS } from '../src/menu/menuModelManifest';

it('contains every normalized corner after its full placement rotation', () => {
  for (const placement of MENU_MODEL_PLACEMENTS) {
    const spec = MENU_MODEL_SPECS[placement.modelId];
    const { min, max } = spec.generatedMetadata.rawBounds;
    const presentationRotation = new Euler(...spec.rotation);
    const corners: Vector3[] = [];
    const rotatedMin = new Vector3(Infinity, Infinity, Infinity);
    const rotatedMax = new Vector3(-Infinity, -Infinity, -Infinity);
    for (const x of [min[0], max[0]]) {
      for (const y of [min[1], max[1]]) {
        for (const z of [min[2], max[2]]) {
          const corner = new Vector3(x, y, z).applyEuler(presentationRotation);
          corners.push(corner);
          rotatedMin.min(corner);
          rotatedMax.max(corner);
        }
      }
    }
    const rotatedSize = rotatedMax.clone().sub(rotatedMin);
    const sourceLongest = Math.max(rotatedSize.x, rotatedSize.y, rotatedSize.z);
    const scale = spec.targetLongestDimension / sourceLongest;
    const placementRotation = new Euler(...placement.rotation);
    const tolerance = 1e-12;
    for (const corner of corners) {
      corner.multiplyScalar(scale).applyEuler(placementRotation);
      expect(Math.abs(corner.x), placement.id)
        .toBeLessThanOrEqual(placement.halfSize[0] + tolerance);
      expect(Math.abs(corner.z), placement.id)
        .toBeLessThanOrEqual(placement.halfSize[1] + tolerance);
    }
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

it('uses the nearest clear side inside a visible horizontal range', () => {
  const blockers = [
    { id: 'center', position: [0, 0, 100] as const, halfSize: [1, 1] as const },
    { id: 'right', position: [1.5, 0, 100] as const, halfSize: [0.3, 1] as const },
  ];
  expect(findClearMenuX(0.25, 100, 0.2, 0.2, 0.1, blockers, -2, 2))
    .toBeCloseTo(-1.3);
});
