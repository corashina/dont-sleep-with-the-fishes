import { Box3, BufferGeometry, CylinderGeometry, Mesh, TorusGeometry } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createShipDeckDetails } from '../src/world/ShipDeckDetails';
import {
  SHIP_DECK_DETAIL_COUNTS,
  SHIP_LAYOUT,
  type ShipDeckDetailSpec,
} from '../src/world/ShipLayout';
import { createShipMaterials } from '../src/world/ShipMaterials';

describe('ship deck details', () => {
  it('builds the exact authored detail catalog with authored transforms and colliders', () => {
    const materials = createShipMaterials();
    const build = createShipDeckDetails(materials, SHIP_LAYOUT.details);

    expect(build.root.name).toBe('ship-deck-details');
    expect(build.root.children).toHaveLength(12);
    expect(Object.fromEntries(Object.keys(SHIP_DECK_DETAIL_COUNTS).map((kind) => [
      kind,
      build.root.children.filter((child) => child.userData.detailKind === kind).length,
    ]))).toEqual(SHIP_DECK_DETAIL_COUNTS);
    SHIP_LAYOUT.details.forEach((spec, index) => {
      const detail = build.root.children[index]!;
      expect(detail.name).toBe(`detail:${spec.id}`);
      expect(detail.position.toArray()).toEqual(spec.position);
      expect(detail.rotation.y).toBe(spec.rotationY);
      expect(detail.scale.toArray()).toEqual(spec.scale);
      expect(detail.userData.detailKind).toBe(spec.kind);
      expect(detail.children.length).toBeGreaterThan(0);
    });
    expect(build.colliders).toHaveLength(
      SHIP_LAYOUT.details.filter(({ colliderSize }) => colliderSize !== undefined).length,
    );
    expect(build.colliders).toHaveLength(8);

    build.disposeGeometry();
    materials.dispose();
  });

  it('constructs the specified primitive parts with shared ship materials', () => {
    const materials = createShipMaterials();
    const build = createShipDeckDetails(materials, SHIP_LAYOUT.details);
    const detail = (id: string) => build.root.getObjectByName(`detail:${id}`)!;
    const mesh = (name: string) => build.root.getObjectByName(name) as Mesh;

    expect(detail('barrel-1').children).toHaveLength(3);
    expect(mesh('barrel-body').geometry).toBeInstanceOf(CylinderGeometry);
    expect(mesh('barrel-body').material).toBe(materials.crewFloor);
    expect(mesh('barrel-band-lower').material).toBe(materials.darkMetal);
    expect(mesh('rope-coil').geometry).toBeInstanceOf(TorusGeometry);
    expect(mesh('rope-coil').material).toBe(materials.rope);
    expect(build.root.getObjectByName('life-ring')).toBeUndefined();
    expect(detail('spareTimber-1').children).toHaveLength(3);
    expect(mesh('spare-timber-1').material).toBe(materials.crewFloor);
    expect(build.root.getObjectByName('toolbox-body')).toBeUndefined();
    expect(build.root.getObjectByName('bollard-post')).toBeUndefined();
    expect(build.root.getObjectByName('cleat-centre')).toBeUndefined();
    expect(build.root.getObjectByName('lamp-lens')).toBeUndefined();
    expect(build.root.getObjectByName('vent-body')).toBeUndefined();
    expect(build.root.getObjectByName('covered-hatch')).toBeUndefined();
    expect(build.root.getObjectByName('folded-canvas-1')).toBeUndefined();
    expect(build.colliders).toHaveLength(8);

    const barrelBodies = build.root.children
      .filter(({ userData }) => userData.detailKind === 'barrel')
      .map((root) => root.getObjectByName('barrel-body') as Mesh);
    expect(new Set(barrelBodies.map(({ geometry }) => geometry))).toHaveLength(1);
    expect(new Set(barrelBodies.map(({ material }) => material))).toHaveLength(1);

    build.disposeGeometry();
    materials.dispose();
  });

  it('declares conservative visual footprints that cover the generated meshes', () => {
    const materials = createShipMaterials();
    const build = createShipDeckDetails(materials, SHIP_LAYOUT.details);

    SHIP_LAYOUT.details.forEach((spec, index) => {
      const detail = build.root.children[index]!;
      const visualSize = (spec as ShipDeckDetailSpec & {
        readonly visualSize?: readonly [number, number];
      }).visualSize;
      expect(visualSize, spec.id).toBeDefined();
      if (!visualSize) return;

      const cosine = Math.abs(Math.cos(spec.rotationY));
      const sine = Math.abs(Math.sin(spec.rotationY));
      const localWidth = visualSize[0] * spec.scale[0];
      const localDepth = visualSize[1] * spec.scale[2];
      const width = localWidth * cosine + localDepth * sine;
      const depth = localWidth * sine + localDepth * cosine;
      const declared = {
        minX: spec.position[0] - width / 2,
        maxX: spec.position[0] + width / 2,
        minZ: spec.position[2] - depth / 2,
        maxZ: spec.position[2] + depth / 2,
      };
      const measured = new Box3().setFromObject(detail);

      expect(measured.min.x, `${spec.id} minX`).toBeGreaterThanOrEqual(declared.minX - 1e-6);
      expect(measured.max.x, `${spec.id} maxX`).toBeLessThanOrEqual(declared.maxX + 1e-6);
      expect(measured.min.z, `${spec.id} minZ`).toBeGreaterThanOrEqual(declared.minZ - 1e-6);
      expect(measured.max.z, `${spec.id} maxZ`).toBeLessThanOrEqual(declared.maxZ + 1e-6);
    });

    build.disposeGeometry();
    materials.dispose();
  });

  it('transforms collider size by rotation and non-uniform scale from deck height', () => {
    const materials = createShipMaterials();
    const spec: ShipDeckDetailSpec = {
      id: 'scaled-barrel',
      kind: 'barrel',
      position: [4, 2.22, -3],
      rotationY: Math.PI / 2,
      scale: [2, 3, 4],
      colliderSize: [1, 2, 3],
      visualSize: [1, 3],
    };
    const build = createShipDeckDetails(materials, [spec]);

    expect(build.colliders).toEqual([{
      minX: -2,
      maxX: 10,
      minY: 2.22,
      maxY: 8.22,
      minZ: -4,
      maxZ: -2,
    }]);

    build.disposeGeometry();
    materials.dispose();
  });

  it('disposes generated geometries once and keeps shared materials alive', () => {
    const materials = createShipMaterials();
    const materialDisposals = materials.ownedMaterialsForTest()
      .map((material) => vi.spyOn(material, 'dispose'));
    const build = createShipDeckDetails(materials, SHIP_LAYOUT.details);
    const geometries = new Set<BufferGeometry>();
    build.root.traverse((object) => {
      if (object instanceof Mesh) geometries.add(object.geometry);
    });
    const geometryDisposals = [...geometries].map((geometry) => vi.spyOn(geometry, 'dispose'));

    build.disposeGeometry();
    build.disposeGeometry();

    geometryDisposals.forEach((dispose) => expect(dispose).toHaveBeenCalledTimes(1));
    materialDisposals.forEach((dispose) => expect(dispose).not.toHaveBeenCalled());
    materials.dispose();
  });
});
