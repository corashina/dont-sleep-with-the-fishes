// Importance: 10/10. Protects shared ship geometry ownership and exact primitive transforms.
import { describe, expect, it } from 'vitest';
import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  MeshStandardMaterial,
} from 'three';
import {
  addBlock,
  addCylinder,
  addRotatedBlock,
  addRoundedPrism,
  applyRoofPlanarUvs,
  applyWallPlanarUvs,
  createWallBoxGeometry,
  roundedBowPoint,
  shipPlanShape,
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

function planarGeometry(): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([
    2, 3, 5,
    7, 11, 13,
    17, 19, 23,
  ], 3));
  geometry.setAttribute('normal', new Float32BufferAttribute([
    0, 0, 1,
    1, 0, 0,
    0, 1, 0,
  ], 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(6, 2));
  return geometry;
}

describe('ship geometry primitives', () => {
  it('applies the existing wall and roof planar UV projections', () => {
    const wall = planarGeometry();
    applyWallPlanarUvs(wall, 29, 31);
    const wallUvs = wall.getAttribute('uv');
    expect(Array.from(wallUvs.array)).toEqual([
      31, 34,
      42, 42,
      46, 50,
    ]);

    const roof = planarGeometry();
    applyRoofPlanarUvs(roof, 29, 31);
    const roofUvs = roof.getAttribute('uv');
    expect(Array.from(roofUvs.array)).toEqual([
      31, 3,
      44, 11,
      46, 54,
    ]);
  });

  it('registers every primitive geometry in its build context', () => {
    const context = createTestContext();
    const material = new MeshStandardMaterial();
    try {
      const block = addBlock(context, context.root, {
        name: 'owned-block',
        size: [2, 4, 6],
        position: [1, 2, 3],
        material,
        collider: true,
      });
      const rotatedBlock = addRotatedBlock(context, context.root, {
        name: 'owned-rotated-block',
        size: [3, 5, 7],
        position: [8, 9, 10],
        material,
      }, Math.PI / 3);
      const cylinder = addCylinder(
        context,
        context.root,
        'owned-cylinder',
        0.5,
        2,
        [4, 5, 6],
        material,
      );
      const wall = createWallBoxGeometry(context, 3, 4, 5, 6, 7);
      const prism = addRoundedPrism(
        context,
        'owned-prism',
        8,
        20,
        2,
        1,
        material,
        false,
      );

      expect(context.geometries).toEqual(new Set([
        block.geometry,
        cylinder.geometry,
        wall,
        prism.geometry,
      ]));
      expect(rotatedBlock.geometry).toBe(block.geometry);
      expect(rotatedBlock.rotation.y).toBe(Math.PI / 3);
      expect(context.root.children.map(({ name }) => name)).toEqual([
        'owned-block',
        'owned-rotated-block',
        'owned-cylinder',
        'owned-prism',
      ]);
      expect(context.shellColliders).toEqual([{
        minX: 0,
        maxX: 2,
        minY: 0,
        maxY: 4,
        minZ: 0,
        maxZ: 6,
      }]);
    } finally {
      context.geometries.forEach((geometry) => geometry.dispose());
      material.dispose();
      context.materials.dispose();
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

  it('keeps the authored plan bounds and rounded bow points', () => {
    const points = shipPlanShape(16.25, 55).getPoints(24);
    const xs = points.map(({ x }) => x);
    const zs = points.map(({ y }) => y);
    expect(Math.min(...xs)).toBeCloseTo(-8.125);
    expect(Math.max(...xs)).toBeCloseTo(8.125);
    expect(Math.min(...zs)).toBeCloseTo(-19.775);
    expect(Math.max(...zs)).toBeCloseTo(27.5);
    expect(roundedBowPoint(8.125, 19, 27.5, 0)).toEqual({ x: 8.125, z: 19 });
    expect(roundedBowPoint(8.125, 19, 27.5, 0.5)).toEqual({ x: 0, z: 27.5 });
    expect(roundedBowPoint(8.125, 19, 27.5, 1)).toEqual({ x: -8.125, z: 19 });
  });
});
