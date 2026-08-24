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

  it('shares unit boxes within each root but never across roots', () => {
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

  it('keeps the authored plan bounds and rounded bow points', () => {
    const points = shipPlanShape(16.25, 55).getPoints(24);
    const xs = points.map(({ x }) => x);
    const zs = points.map(({ y }) => y);
    expect(Math.min(...xs)).toBe(-8.125);
    expect(Math.max(...xs)).toBe(8.125);
    expect(Math.min(...zs)).toBe(-19.775);
    expect(Math.max(...zs)).toBe(27.5);
    expect(roundedBowPoint(8.125, 19, 27.5, 0)).toEqual({ x: 8.125, z: 19 });
    expect(roundedBowPoint(8.125, 19, 27.5, 0.125)).toEqual({
      x: 7.4267578125,
      z: 21.69078125,
    });
    expect(roundedBowPoint(8.125, 19, 27.5, 0.25)).toEqual({
      x: 5.5859375,
      z: 24.46125,
    });
    expect(roundedBowPoint(8.125, 19, 27.5, 0.375)).toEqual({
      x: 2.9833984375,
      z: 26.62609375,
    });
    expect(roundedBowPoint(8.125, 19, 27.5, 0.5)).toEqual({ x: 0, z: 27.5 });
    expect(roundedBowPoint(8.125, 19, 27.5, 0.625)).toEqual({
      x: -2.9833984375,
      z: 26.62609375,
    });
    expect(roundedBowPoint(8.125, 19, 27.5, 0.75)).toEqual({
      x: -5.5859375,
      z: 24.46125,
    });
    expect(roundedBowPoint(8.125, 19, 27.5, 0.875)).toEqual({
      x: -7.4267578125,
      z: 21.69078125,
    });
    expect(roundedBowPoint(8.125, 19, 27.5, 1)).toEqual({ x: -8.125, z: 19 });
  });

  it('preserves tapered prism vertices, UVs, and collider output', () => {
    const context = createTestContext();
    const material = new MeshStandardMaterial();
    try {
      const prism = addRoundedPrism(
        context,
        'tapered-prism',
        16.25,
        55,
        4.6,
        1.98,
        material,
        true,
        {
          widthScale: 0.1,
          lengthScale: 0.58,
          chine: {
            depthFraction: 0.5,
            widthScale: 0.7,
            lengthScale: 0.78,
          },
        },
      );
      const positions = prism.geometry.getAttribute('position');
      const uvs = prism.geometry.getAttribute('uv');
      const sampleIndexes = [0, 1, 2, 50, 100, 150, 200, 250, 300, 939, 940, 941];

      expect(positions.count).toBe(942);
      expect(uvs.count).toBe(942);
      expect(sampleIndexes.map((index) => [
        index,
        positions.getX(index),
        positions.getY(index),
        positions.getZ(index),
      ])).toEqual([
        [0, -7.775000095367432, -1.2108694911211622e-15, -19.774999618530273],
        [1, -8.125, -1.1894381811270891e-15, -19.424999237060547],
        [2, -8.125, 1.16341447025124e-15, 19],
        [50, -1.5155029296875, 1.6696372525515498e-15, 27.26724624633789],
        [100, 0.5075186491012573, 1.6822411028066938e-15, 27.473081588745117],
        [150, -5.955923557281494, 1.4709878035088007e-15, 24.023054122924805],
        [200, -0.15155033767223358, -4.599999904632568, 15.815003395080566],
        [250, 0.25023290514945984, -4.599999904632568, 15.59034252166748],
        [300, -0.5955924987792969, -4.599999904632568, 13.933371543884277],
        [939, -5.442500114440918, -2.299999952316284, -15.42449951171875],
        [940, -0.7775002121925354, -4.599999904632568, -11.469499588012695],
        [941, -0.8125001788139343, -4.599999904632568, -11.266499519348145],
      ]);
      expect(sampleIndexes.map((index) => [index, uvs.getX(index), uvs.getY(index)]))
        .toEqual([
          [0, -7.775000095367432, -19.774999618530273],
          [1, -8.125, -19.424999237060547],
          [2, -8.125, 19],
          [50, -1.5155029296875, 27.26724624633789],
          [100, 0.5075186491012573, 27.473081588745117],
          [150, -5.955923557281494, 24.023054122924805],
          [200, -1.5155029296875, 27.26724624633789],
          [250, 2.502328395843506, 26.879899978637695],
          [300, -5.955923557281494, 24.023054122924805],
          [939, -19.774999618530273, -1.2999999523162842],
          [940, -19.774999618530273, -3.5999999046325684],
          [941, -19.424999237060547, -3.5999999046325684],
        ]);

      const layerBounds = (y: number): readonly number[] => {
        const values = Array.from({ length: positions.count }, (_, index) => index)
          .filter((index) => positions.getY(index) === y);
        const x = values.map((index) => positions.getX(index));
        const z = values.map((index) => positions.getZ(index));
        return [Math.min(...x), Math.max(...x), Math.min(...z), Math.max(...z)];
      };
      expect(layerBounds(-2.299999952316284)).toEqual([
        -5.6875,
        5.6875,
        -15.42449951171875,
        21.450000762939453,
      ]);
      expect(layerBounds(-4.599999904632568)).toEqual([
        -0.8125001788139343,
        0.8125001788139343,
        -11.469499588012695,
        15.949999809265137,
      ]);
      expect(context.shellColliders).toEqual([{
        minX: -8.125,
        maxX: 8.125,
        minY: -2.6199999999999997,
        maxY: 1.98,
        minZ: -27.5,
        maxZ: 27.5,
      }]);
    } finally {
      context.geometries.forEach((geometry) => geometry.dispose());
      material.dispose();
      context.materials.dispose();
    }
  });
});
