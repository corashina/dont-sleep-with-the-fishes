// Importance: 10/10. Protects shared ship geometry ownership and collider transforms.
import { describe, expect, it } from 'vitest';
import {
  BufferGeometry,
  Group,
  MeshStandardMaterial,
} from 'three';
import {
  addBlock,
  toCollisionBox,
  toOrientedCollisionBox,
  type ShipGeometryBuildContext,
} from '../src/world/ShipGeometryPrimitives';
import { createShipMaterials } from '../src/world/ShipMaterials';

function createTestContext(): ShipGeometryBuildContext {
  return {
    root: new Group(),
    geometries: new Set<BufferGeometry>(),
    shellColliders: [],
    materials: createShipMaterials(),
  };
}

describe('ship geometry primitives', () => {
  it('registers shared block geometry without creating a collider', () => {
    const context = createTestContext();
    const material = new MeshStandardMaterial();
    try {
      const block = addBlock(context, context.root, {
        name: 'owned-block',
        size: [2, 4, 6],
        position: [1, 2, 3],
        material,
      });

      expect(context.geometries).toEqual(new Set([block.geometry]));
      expect(context.root.children).toEqual([block]);
      expect(block.position.toArray()).toEqual([1, 2, 3]);
      expect(block.scale.toArray()).toEqual([2, 4, 6]);
      expect(block.castShadow).toBe(true);
      expect(block.receiveShadow).toBe(true);
      expect(context.shellColliders).toEqual([]);
    } finally {
      context.geometries.forEach((geometry) => geometry.dispose());
      material.dispose();
      context.materials.dispose();
    }
  });

  it('shares unit boxes within each parent but never across parents', () => {
    const first = createTestContext();
    const second = createTestContext();
    const material = new MeshStandardMaterial();
    try {
      const firstA = addBlock(first, first.root, {
        name: 'first-a',
        size: [1, 1, 1],
        position: [0, 0, 0],
        material,
      });
      const firstB = addBlock(first, first.root, {
        name: 'first-b',
        size: [2, 2, 2],
        position: [1, 1, 1],
        material,
      });
      const secondA = addBlock(second, second.root, {
        name: 'second-a',
        size: [1, 1, 1],
        position: [0, 0, 0],
        material,
      });
      const secondB = addBlock(second, second.root, {
        name: 'second-b',
        size: [2, 2, 2],
        position: [1, 1, 1],
        material,
      });

      expect(firstA.geometry).toBe(firstB.geometry);
      expect(secondA.geometry).toBe(secondB.geometry);
      expect(firstA.geometry).not.toBe(secondA.geometry);
      expect(first.geometries).toEqual(new Set([firstA.geometry]));
      expect(second.geometries).toEqual(new Set([secondA.geometry]));
    } finally {
      first.geometries.forEach((geometry) => geometry.dispose());
      second.geometries.forEach((geometry) => geometry.dispose());
      material.dispose();
      first.materials.dispose();
      second.materials.dispose();
    }
  });

  it('keeps axis-aligned and oriented collider transforms exact', () => {
    expect(toCollisionBox([1, 2, 3], [2, 4, 6])).toEqual({
      minX: 0,
      maxX: 2,
      minY: 0,
      maxY: 4,
      minZ: 0,
      maxZ: 6,
    });
    const oriented = toOrientedCollisionBox([1, 2, 3], [2, 4, 6], Math.PI / 2);
    expect(oriented).toMatchObject({
      minX: -2,
      maxX: 4,
      minY: 0,
      maxY: 4,
      maxZ: 4,
      orientedFootprint: {
        centerX: 1,
        centerZ: 3,
        halfWidth: 1,
        halfDepth: 3,
        rotationY: Math.PI / 2,
      },
    });
    expect(oriented.minZ).toBeCloseTo(2);
  });
});
