import { BufferAttribute, Mesh } from 'three';
import { describe, expect, it } from 'vitest';
import {
  createLifeboat,
  lifeboatHullHalfWidthAt,
  LIFEBOAT_FLOOR_SURFACE_Y,
} from '../src/world/Lifeboat';
import { createTestLifeboatAssets } from './helpers/lifeboatAssets';

describe('Lifeboat', () => {
  it('fills the tapered floor with boards that stay inside the hull', () => {
    const assets = createTestLifeboatAssets();
    const { root } = createLifeboat(assets);
    const floorboards = root.getObjectByName('lifeboat-floorboards')!;
    const boards = floorboards.children as Mesh[];

    expect(boards).toHaveLength(13);

    for (const board of boards) {
      board.geometry.computeBoundingBox();
      expect(board.geometry.boundingBox!.max.y + board.position.y)
        .toBeCloseTo(LIFEBOAT_FLOOR_SURFACE_Y);

      const positions = board.geometry.getAttribute('position') as BufferAttribute;
      for (let index = 0; index < positions.count; index += 1) {
        const x = positions.getX(index);
        const z = positions.getZ(index);
        const hullHalfWidth = lifeboatHullHalfWidthAt(
          Math.max(-3, Math.min(3, z)),
        );
        expect(hullHalfWidth).not.toBeNull();
        expect(Math.abs(x)).toBeLessThanOrEqual(hullHalfWidth! - 0.059);
      }
    }

    for (const x of [-1.33, 1.33]) {
      expect(boards.some((board) => {
        const bounds = board.geometry.boundingBox!;
        return x >= bounds.min.x
          && x <= bounds.max.x
          && -1.15 >= bounds.min.z
          && -1.15 <= bounds.max.z;
      })).toBe(true);
    }

    root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      object.geometry.dispose();
      if (Array.isArray(object.material)) {
        object.material.forEach((material) => material.dispose());
      } else {
        object.material.dispose();
      }
    });
    assets.dispose();
  });
});
