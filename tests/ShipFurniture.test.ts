import { Material, Mesh } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createItemInstances } from '../src/game/ItemState';
import type { CollisionBox } from '../src/player/collisions';
import { createShipFurniture } from '../src/world/ShipFurniture';
import {
  assignShipItems,
  validateShipItemAnchors,
  type ShipSurface,
} from '../src/world/ShipItemPlacement';
import { createShipMaterials } from '../src/world/ShipMaterials';

interface FurnitureCollider extends CollisionBox {
  furnitureFamily: string;
}

interface AnchorSupportMetadata {
  surfaceGroupId: string;
  surface: ShipSurface;
  centerX: number;
  centerZ: number;
  topY: number;
  width: number;
  depth: number;
}

const familyGroups = (root: ReturnType<typeof createShipFurniture>['root'], family: string) =>
  root.children.filter((object) => object.userData.furnitureFamily === family);

describe('ship furniture', () => {
  it('builds every required furniture count inside its approved room band', () => {
    const materials = createShipMaterials();
    const build = createShipFurniture(materials);
    const inBand = (family: string, minZ: number, maxZ: number) =>
      familyGroups(build.root, family).filter(({ position }) => position.z >= minZ && position.z <= maxZ);

    expect(inBand('bunk', 5.2, 10.8)).toHaveLength(2);
    expect(inBand('desk', 5.2, 10.8)).toHaveLength(3);
    expect(inBand('chair', 5.2, 10.8)).toHaveLength(2);
    expect(inBand('wall-shelf', 5.2, 10.8)).toHaveLength(2);
    expect(inBand('locker', 5.2, 10.8)).toHaveLength(2);
    expect(inBand('desk', 11.2, 15.2)).toHaveLength(2);
    expect(inBand('locker', 11.2, 15.2)).toHaveLength(3);
    expect(inBand('wall-shelf', -11.4, -7)).toHaveLength(2);
    expect(inBand('workbench', -11.4, -7)).toHaveLength(2);
    expect(inBand('locker', -11.4, -7)).toHaveLength(3);
    expect(inBand('equipment-rack', -11.4, -7)).toHaveLength(2);
    expect(inBand('cargo-crate', -6, 3)).toHaveLength(6);
    ['bunk', 'desk', 'chair', 'wall-shelf', 'locker', 'workbench', 'equipment-rack', 'cargo-crate']
      .forEach((name) => expect(build.root.getObjectByName(name)).toBeDefined());
    build.disposeGeometry();
    materials.dispose();
  });

  it('authors a regular surplus and preserves the four exact emergency anchors', () => {
    const materials = createShipMaterials();
    const build = createShipFurniture(materials);
    const emergency = build.anchors.filter((anchor) => anchor.emergency);
    expect(build.anchors.filter((anchor) => !anchor.emergency).length).toBeGreaterThanOrEqual(24);
    expect(() => validateShipItemAnchors(build.anchors)).not.toThrow();
    expect(emergency).toHaveLength(4);
    expect(emergency.map((anchor) => ({
      id: anchor.id,
      categories: anchor.categories,
      position: anchor.position.toArray(),
      surface: anchor.surface,
    }))).toEqual([
      { id: 'emergency-food', categories: ['foodWater'], position: [-3.8, 3.05, 8.8], surface: 'shelf' },
      { id: 'emergency-medical', categories: ['medicalEmergency'], position: [3.7, 3.35, 12.4], surface: 'cabinet' },
      { id: 'emergency-tools', categories: ['toolsRepair'], position: [-3.5, 3.08, -9.4], surface: 'workbench' },
      { id: 'emergency-gear', categories: ['fishingDiving'], position: [3.8, 2.42, -8.4], surface: 'rack' },
    ]);
    emergency.forEach((anchor) => {
      expect(anchor.footprint).toEqual({ width: 2.1, depth: 1.2 });
      expect(anchor.clearanceHeight).toBe(1.3);
    });
    expect(new Set(emergency.map(({ surfaceGroupId }) => surfaceGroupId)).size).toBe(4);
    expect(assignShipItems(createItemInstances(), build.anchors, () => 0.4).size).toBe(14);
    build.disposeGeometry();
    materials.dispose();
  });

  it('adds exact non-interactive decoration counts', () => {
    const materials = createShipMaterials();
    const build = createShipFurniture(materials);
    const decorations = new Map<string, Mesh[]>();
    const prefixes = ['chart-', 'mug-or-dish-', 'rope-coil-', 'hand-tool-', 'machine-part-'];
    prefixes.forEach((prefix) => decorations.set(prefix, []));
    build.root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      prefixes.forEach((prefix) => {
        if (object.name.startsWith(prefix)) decorations.get(prefix)!.push(object);
      });
    });
    expect([...decorations.values()].map((meshes) => meshes.length)).toEqual([4, 6, 2, 6, 4]);
    decorations.forEach((meshes) => meshes.forEach(({ userData }) => {
      expect(userData.itemType).toBeUndefined();
      expect(userData.instanceId).toBeUndefined();
    }));
    build.disposeGeometry();
    materials.dispose();
  });

  it('blocks every broad furniture and deck-equipment family at player eye height', () => {
    const materials = createShipMaterials();
    const build = createShipFurniture(materials);
    const colliders = build.colliders as FurnitureCollider[];
    const requiredCounts: Readonly<Record<string, number>> = {
      bunk: 2,
      desk: 5,
      'wall-shelf': 4,
      locker: 8,
      workbench: 2,
      'equipment-rack': 2,
      'cargo-crate': 6,
      'machinery-block': 1,
      'deck-vent': 2,
      'winch-drum': 2,
    };
    Object.entries(requiredCounts).forEach(([family, count]) => {
      const familyColliders = colliders.filter(({ furnitureFamily }) => furnitureFamily === family);
      expect(familyColliders, family).toHaveLength(count);
      familyColliders.forEach(({ maxY }) => expect(maxY, family).toBeGreaterThanOrEqual(4.2));
    });
    ['deck-vent', 'winch-drum'].forEach((family) => {
      [1, 2].map((index) => build.root.getObjectByName(`${family}-${index}`)!).forEach((mesh) =>
        expect(colliders.some((box) =>
        box.furnitureFamily === family
        && mesh.position.x >= box.minX && mesh.position.x <= box.maxX
        && mesh.position.z >= box.minZ && mesh.position.z <= box.maxZ)).toBe(true));
    });
    expect(colliders.some(({ furnitureFamily }) => furnitureFamily === 'chair')).toBe(false);
    build.disposeGeometry();
    materials.dispose();
  });

  it('places every anchor on a matching physical support with an honest footprint', () => {
    const materials = createShipMaterials();
    const build = createShipFurniture(materials);
    const supports = new Map<string, { mesh: Mesh; metadata: AnchorSupportMetadata }>();
    build.root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const support = object.userData.anchorSupport as AnchorSupportMetadata | undefined;
      if (support) supports.set(support.surfaceGroupId, { mesh: object, metadata: support });
    });
    expect(supports.size).toBe(build.anchors.length);
    build.anchors.forEach((anchor) => {
      const match = supports.get(anchor.surfaceGroupId);
      expect(match, anchor.id).toBeDefined();
      const { mesh, metadata } = match!;
      expect(metadata.surface).toBe(anchor.surface);
      expect(mesh.position.x).toBeCloseTo(metadata.centerX, 6);
      expect(mesh.position.z).toBeCloseTo(metadata.centerZ, 6);
      expect(mesh.position.y + mesh.scale.y / 2).toBeCloseTo(metadata.topY, 6);
      expect(mesh.scale.x).toBeCloseTo(metadata.width, 6);
      expect(mesh.scale.z).toBeCloseTo(metadata.depth, 6);
      expect(metadata.topY).toBeCloseTo(anchor.position.y, 6);
      expect(Math.abs(anchor.position.x - metadata.centerX) + anchor.footprint.width / 2)
        .toBeLessThanOrEqual(metadata.width / 2 + 1e-6);
      expect(Math.abs(anchor.position.z - metadata.centerZ) + anchor.footprint.depth / 2)
        .toBeLessThanOrEqual(metadata.depth / 2 + 1e-6);
    });
    const rodSupports = build.anchors.filter(({ id }) => id.includes('rod'));
    const scubaSupports = build.anchors.filter(({ id }) => id.includes('scuba'));
    expect(rodSupports.every(({ footprint }) => footprint.width >= 1.85)).toBe(true);
    expect(scubaSupports.every(({ footprint }) => footprint.width >= 1.05 && footprint.depth >= 0.72)).toBe(true);
    build.disposeGeometry();
    materials.dispose();
  });

  it('samples the full loop and keeps every route zone clear by 0.35 units', () => {
    const materials = createShipMaterials();
    const build = createShipFurniture(materials);
    const points = build.routeClearancePoints;
    const hasBothSidesInBand = (minZ: number, maxZ: number) =>
      points.some(({ x, z }) => x < 0 && z >= minZ && z <= maxZ)
      && points.some(({ x, z }) => x > 0 && z >= minZ && z <= maxZ);
    expect(points.length).toBeGreaterThanOrEqual(12);
    expect(hasBothSidesInBand(5.2, 10.8)).toBe(true);
    expect(hasBothSidesInBand(11.2, 15.2)).toBe(true);
    expect(hasBothSidesInBand(-6, 3)).toBe(true);
    expect(hasBothSidesInBand(-11.4, -7)).toBe(true);
    expect(points.some(({ x, z }) => x > 5 && Math.abs(z + 6.5) < 0.01)).toBe(true);
    points.forEach((point) => expect(build.colliders.every((box) =>
      point.x < box.minX - 0.35 || point.x > box.maxX + 0.35
      || point.z < box.minZ - 0.35 || point.z > box.maxZ + 0.35)).toBe(true));
    build.disposeGeometry();
    materials.dispose();
  });

  it('disposes each shared geometry once while leaving materials caller-owned', () => {
    const materials = createShipMaterials();
    const materialDisposals = materials.ownedMaterialsForTest().map((material) =>
      vi.spyOn(material as Material, 'dispose'));
    const build = createShipFurniture(materials);
    const geometries = new Set<Mesh['geometry']>();
    build.root.traverse((object) => {
      if (object instanceof Mesh) geometries.add(object.geometry);
    });
    const geometryDisposals = [...geometries].map((geometry) => vi.spyOn(geometry, 'dispose'));
    build.disposeGeometry();
    build.disposeGeometry();
    geometryDisposals.forEach((dispose) => expect(dispose).toHaveBeenCalledTimes(1));
    materialDisposals.forEach((dispose) => expect(dispose).not.toHaveBeenCalled());
    materials.dispose();
    materialDisposals.forEach((dispose) => expect(dispose).toHaveBeenCalledTimes(1));
  });
});
