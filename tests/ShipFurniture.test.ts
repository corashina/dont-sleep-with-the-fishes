import { Euler, Material, Mesh, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { PLAYER_LAYOUT_RADIUS, SHIP_LAYOUT, analyzeShipNavigation } from '../src/world/ShipLayout';
import { createShipFurniture } from '../src/world/ShipFurniture';
import { createShip, isShipSurfaceStandingPointVisible } from '../src/world/Ship';
import { createShipMaterials } from '../src/world/ShipMaterials';
import { SHIP_FURNITURE_MODEL_SPECS } from '../src/world/shipFurnitureManifest';
import { createTestShipFurniture } from './helpers/shipFurniture';

const overlap = (
  left: { minX: number; maxX: number; minZ: number; maxZ: number },
  right: { minX: number; maxX: number; minZ: number; maxZ: number },
): boolean => left.minX < right.maxX && left.maxX > right.minX
  && left.minZ < right.maxZ && left.maxZ > right.minZ;

describe('ship furniture', () => {
  it('builds exactly the 16 layout-owned fixtures with one collider each', () => {
    const materials = createShipMaterials();
    const library = createTestShipFurniture();
    const build = createShipFurniture(materials, library);

    for (const placement of SHIP_LAYOUT.furniture) {
      const root = build.root.children.find(({ userData }) =>
        userData.furnitureId === placement.id && userData.modelId === placement.modelId);
      expect(root, placement.id).toBeDefined();
      const colliders = build.colliders.filter((box) => box.furnitureId === placement.id);
      expect(colliders, placement.id).toHaveLength(1);
      expect(colliders[0]).toMatchObject({
        minY: placement.position[1],
        maxY: placement.position[1] + placement.colliderSize[1],
      });
      if (placement.modelId !== 'cargoCrate' && placement.modelId !== 'cargoRack') {
        expect(root!.getObjectByName(`ship-furniture:${placement.modelId}`)).toBeDefined();
      }
    }

    expect(build.root.children).toHaveLength(16);
    expect(build.colliders).toHaveLength(16);
    const legacyClutter = /anchor-support|mug|dish|hand-tool|machine-part|deck-vent|rope-coil|winch/i;
    const objectNames: string[] = [];
    build.root.traverse(({ name }) => objectNames.push(name));
    expect(objectNames.filter((name) => legacyClutter.test(name))).toEqual([]);

    const rack = build.root.children.find(({ userData }) =>
      userData.furnitureId === 'cargo-rod-rack-forward-port')!;
    expect(rack.getObjectByName('cargo-rack-top')).toBeInstanceOf(Mesh);
    expect(rack.getObjectByName('crate-body')).toBeUndefined();

    build.disposeGeometry();
    materials.dispose();
    library.dispose();
  });

  it('keeps furniture colliders disjoint from furniture, doors, primary lanes, and evacuation', () => {
    const materials = createShipMaterials();
    const library = createTestShipFurniture();
    const build = createShipFurniture(materials, library);
    const colliders = SHIP_LAYOUT.furniture.map((placement) => ({
      id: placement.id,
      box: build.colliders.find((box) => box.furnitureId === placement.id)!,
    }));

    colliders.forEach((left, index) => {
      colliders.slice(index + 1).forEach((right) =>
        expect(overlap(left.box, right.box), `${left.id}:${right.id}`).toBe(false));
      SHIP_LAYOUT.doors.forEach((door) =>
        expect(overlap(left.box, door.approach), `${left.id}:${door.id}`).toBe(false));
      SHIP_LAYOUT.lanes.filter(({ className }) => className === 'primary').forEach((lane) =>
        expect(overlap(left.box, lane.bounds), `${left.id}:${lane.id}`).toBe(false));
      expect(overlap(left.box, SHIP_LAYOUT.evacuationRect), left.id).toBe(false);
    });

    build.disposeGeometry();
    materials.dispose();
    library.dispose();
  });

  it('exposes exactly 27 ordinary owned surfaces and no fallback clutter surfaces', () => {
    const materials = createShipMaterials();
    const library = createTestShipFurniture();
    const build = createShipFurniture(materials, library);
    const owners = new Map(SHIP_LAYOUT.furniture.map((placement) => [placement.id, placement]));

    expect(build.surfaces.filter(({ fallback }) => !fallback)).toHaveLength(27);
    expect(build.surfaces.filter(({ fallback }) => fallback)).toHaveLength(0);
    expect(build.surfaces.map(({ id }) => id)).toEqual(
      SHIP_LAYOUT.furniture.flatMap(({ surfaces }) => surfaces.map(({ id }) => id)),
    );
    expect(new Set(build.surfaces.map(({ id }) => id)).size).toBe(27);

    for (const surface of build.surfaces) {
      const owner = owners.get(surface.furnitureId)!;
      expect(owner, surface.id).toBeDefined();
      expect(surface.furnitureModelId).toBe(owner.modelId);
      expect(surface.furnitureModelId).not.toMatch(/bedBunk|chairDesk/);
      const canonical = owner.modelId === 'cargoCrate' || owner.modelId === 'cargoRack'
        ? owner.colliderSize
        : SHIP_FURNITURE_MODEL_SPECS[owner.modelId].canonicalSize;
      expect(surface.position.y, surface.id)
        .toBeLessThanOrEqual(owner.position[1] + canonical[1] + 1e-6);
      expect(surface.position.y, surface.id).toBeGreaterThan(owner.position[1]);
    }

    const physicalCounts = new Map<string, number>();
    build.surfaces.forEach(({ physicalSlotId }) =>
      physicalCounts.set(physicalSlotId, (physicalCounts.get(physicalSlotId) ?? 0) + 1));
    expect([...physicalCounts.values()].every((count) => count === 1)).toBe(true);

    build.disposeGeometry();
    materials.dispose();
    library.dispose();
  });

  it('keeps every standing point outside inflated colliders, within reach, and connected', () => {
    const materials = createShipMaterials();
    const library = createTestShipFurniture();
    const build = createShipFurniture(materials, library);

    expect(analyzeShipNavigation(SHIP_LAYOUT).unreachableTargetIds).toEqual([]);
    const usableSurfaces = build.surfaces.filter(({ standingPoints }) => standingPoints.length > 0);
    expect(usableSurfaces.length).toBeGreaterThan(0);
    usableSurfaces.forEach((surface) => {
      surface.standingPoints.forEach((point) => {
        expect(new Vector3(point.x, surface.position.y, point.z).distanceTo(surface.position), surface.id)
          .toBeLessThanOrEqual(2.2);
        expect(build.colliders.every((box) =>
          point.x < box.minX - PLAYER_LAYOUT_RADIUS
          || point.x > box.maxX + PLAYER_LAYOUT_RADIUS
          || point.z < box.minZ - PLAYER_LAYOUT_RADIUS
          || point.z > box.maxZ + PLAYER_LAYOUT_RADIUS), surface.id).toBe(true);
      });
    });

    build.disposeGeometry();
    materials.dispose();
    library.dispose();
  });

  it('rejects a shelf slot whose camera-height ray enters its owner above the opening', () => {
    const library = createTestShipFurniture();
    const ship = createShip(library, 1);

    expect(ship.itemSurfaces.map(({ id }) => id)).not.toContain(
      'cabin-bookcase-forward:level-1',
    );
    expect(ship.itemSurfaces.map(({ id }) => id)).toContain(
      'cabin-bookcase-forward:level-2',
    );
    ship.itemSurfaces.forEach((surface) => surface.standingPoints.forEach((point) =>
      expect(isShipSurfaceStandingPointVisible(surface, point, ship.colliders), surface.id)
        .toBe(true)));

    ship.dispose();
    library.dispose();
  });

  it('does not treat arbitrary owner volume as a surface access aperture', () => {
    const surface = {
      id: 'solid-table:inside',
      physicalSlotId: 'solid-table:inside',
      furnitureId: 'solid-table',
      furnitureModelId: 'table' as const,
      categories: ['toolsRepair' as const],
      position: new Vector3(0, 2.5, 0),
      rotation: new Euler(),
      footprint: { width: 0.5, depth: 0.5 },
      clearanceHeight: 2,
      standingPoints: [new Vector3(0, 2.22, -1)],
      fallback: false,
    };
    const owner = {
      minX: -0.5, maxX: 0.5, minY: 2.22, maxY: 4,
      minZ: -0.5, maxZ: 0.5, furnitureId: 'solid-table',
    };

    expect(isShipSurfaceStandingPointVisible(surface, surface.standingPoints[0]!, [owner]))
      .toBe(false);
  });

  it('rejects forged and moved open-shelf surfaces as owner apertures', () => {
    const library = createTestShipFurniture();
    const ship = createShip(library, 1);
    const authored = ship.itemSurfaces.find(({ id }) =>
      id === 'cabin-bookcase-forward:level-2')!;
    const owner = ship.colliders.find((collider) =>
      (collider as typeof collider & { furnitureId?: string }).furnitureId === authored.furnitureId)!;
    const point = authored.standingPoints[0]!;
    const forged = {
      ...authored,
      id: 'cabin-bookcase-forward:forged-opening',
      physicalSlotId: 'cabin-bookcase-forward:forged-opening',
    };
    const moved = {
      ...authored,
      position: authored.position.clone().add(new Vector3(0, 0, -1.2)),
    };

    expect(isShipSurfaceStandingPointVisible(authored, point, [owner])).toBe(true);
    expect(isShipSurfaceStandingPointVisible(forged, point, [owner])).toBe(false);
    expect(isShipSurfaceStandingPointVisible(moved, point, [owner])).toBe(false);

    ship.dispose();
    library.dispose();
  });

  it('never disposes shared library resources', () => {
    const materials = createShipMaterials();
    const library = createTestShipFurniture();
    const libraryGeometries = new Set<Mesh['geometry']>();
    const libraryMaterials = new Set<Material>();
    for (const modelId of Object.keys(SHIP_FURNITURE_MODEL_SPECS)) {
      library.clone(modelId as keyof typeof SHIP_FURNITURE_MODEL_SPECS).traverse((object) => {
        if (!(object instanceof Mesh)) return;
        libraryGeometries.add(object.geometry);
        (Array.isArray(object.material) ? object.material : [object.material])
          .forEach((material) => libraryMaterials.add(material));
      });
    }
    const geometryDisposals = [...libraryGeometries].map((geometry) => vi.spyOn(geometry, 'dispose'));
    const materialDisposals = [...libraryMaterials].map((material) => vi.spyOn(material, 'dispose'));
    const build = createShipFurniture(materials, library);

    build.disposeGeometry();
    build.disposeGeometry();
    geometryDisposals.forEach((dispose) => expect(dispose).not.toHaveBeenCalled());
    materialDisposals.forEach((dispose) => expect(dispose).not.toHaveBeenCalled());
    library.dispose();
    geometryDisposals.forEach((dispose) => expect(dispose).toHaveBeenCalledTimes(1));
    materialDisposals.forEach((dispose) => expect(dispose).toHaveBeenCalledTimes(1));
    materials.dispose();
  });
});
