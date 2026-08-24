// Importance: 10/10. Protects hull geometry values, scene order, and shared ownership.
import { describe, expect, it } from 'vitest';
import { Box3, BufferGeometry, Group, Mesh } from 'three';
import { SHIP_LAYOUT } from '../src/world/shipLayoutData';
import {
  addShipHull,
} from '../src/world/ShipHullGeometry';
import type { ShipGeometryBuildContext } from '../src/world/ShipGeometryPrimitives';
import { createShipMaterials } from '../src/world/ShipMaterials';

function createTestContext(): ShipGeometryBuildContext {
  return {
    root: new Group(),
    geometries: new Set<BufferGeometry>(),
    shellColliders: [],
    materials: createShipMaterials(),
  };
}

const expectedBounds = {
  'main-hull-body': [-8.125, 8.125, -2.62, 1.98, -19.775, 27.5],
  'upper-hull': [-8.145, 8.145, 1.28, 2.15, -19.795, 27.52],
  'waterline-band': [-7.8592, 7.8592, 1.17, 1.31, -19.375, 25.9088],
  'timber-deck': [-7.875, 7.875, 1.9, 2.18, -19.375, 27.1],
  'floor-crewCabin': [-5.75, 5.75, 2.22, 2.22, 4.5, 13.5],
  'floor-wheelhouse': [-5.5, 5.5, 2.22, 2.22, 17, 22],
  'floor-cargoDeck': [-7.875, 7.875, 2.22, 2.22, -19.375, 27.1],
  'floor-storageWorkroom': [-5.75, 5.75, 2.22, 2.22, -17.4, -10.65],
  'floor-lifeboatStation': [4.925, 7.875, 2.22, 2.22, -2, 2],
} as const;

describe('ship hull geometry', () => {
  it('preserves direct child order, bounds, and shared geometry ownership', () => {
    const context = createTestContext();
    try {
      const result = addShipHull(context, SHIP_LAYOUT);
      context.root.updateMatrixWorld(true);

      expect(context.root.children.map(({ name }) => name)).toEqual([
        'main-hull-body',
        'upper-hull',
        'waterline-band',
        'timber-deck',
        'floor-crewCabin',
        'floor-wheelhouse',
        'floor-cargoDeck',
        'floor-storageWorkroom',
        'floor-lifeboatStation',
        'lifeboat-station-footprint-left',
        'lifeboat-station-footprint-right',
      ]);
      expect(context.shellColliders).toEqual([]);
      expect(context.geometries).toHaveLength(11);
      context.root.traverse((object) => {
        if (object instanceof Mesh) expect(context.geometries.has(object.geometry)).toBe(true);
      });
      expect((context.root.getObjectByName('main-hull-body') as Mesh).material)
        .toBe(context.materials.darkHull);
      expect((context.root.getObjectByName('upper-hull') as Mesh).material)
        .toBe(context.materials.upperHull);
      expect((context.root.getObjectByName('waterline-band') as Mesh).material)
        .toBe(context.materials.waterline);
      expect((context.root.getObjectByName('timber-deck') as Mesh).material)
        .toBe(context.materials.timberFloor);
      expect((context.root.getObjectByName('floor-crewCabin') as Mesh).material)
        .toBe(context.materials.crewFloor);
      expect((context.root.getObjectByName('floor-wheelhouse') as Mesh).material)
        .toBe(context.materials.wheelhouseFloor);
      expect((context.root.getObjectByName('floor-cargoDeck') as Mesh).material)
        .toBe(context.materials.cargoFloor);
      expect((context.root.getObjectByName('floor-storageWorkroom') as Mesh).material)
        .toBe(context.materials.storageFloor);
      expect((context.root.getObjectByName('floor-lifeboatStation') as Mesh).material)
        .toBe(context.materials.dropoffArea);
      Object.entries(expectedBounds).forEach(([name, expected]) => {
        const bounds = new Box3().setFromObject(context.root.getObjectByName(name)!);
        bounds.min.toArray().forEach((value, index) => {
          expect(value).toBeCloseTo(expected[index * 2]!);
        });
        bounds.max.toArray().forEach((value, index) => {
          expect(value).toBeCloseTo(expected[index * 2 + 1]!);
        });
      });
      expect(result.waterExclusion).toEqual({
        halfWidth: 7.875,
        halfLength: 27.1,
        taperStart: 21.900000000000002,
        minimumLocalY: -2.6199999999999997,
        heightProfile: {
          lowerHalfWidth: 3.1500000000000004,
          lowerHalfLength: 15.718,
          lowerTaperStart: 12.702,
          upperLocalY: 1.98,
        },
        longitudinalProfile: {
          minZ: -19.375,
          maxZ: 27.1,
          taperStartMinZ: -19.375,
          taperStartMaxZ: 18.6,
          lowerMinZ: -11.469,
          lowerMaxZ: 15.95,
          lowerTaperStartMinZ: -11.469,
          lowerTaperStartMaxZ: 11.02,
        },
      });
    } finally {
      context.geometries.forEach((geometry) => geometry.dispose());
      context.materials.dispose();
    }
  });
});
