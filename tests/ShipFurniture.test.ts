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

  it('keeps furniture colliders disjoint from furniture, doors, primary lanes, and evacuation', () => {
    const materials = createShipMaterials();
    const library = createTestShipFurniture();
    const build = createShipFurniture(materials, library);
    expect(build.surfaces).toHaveLength(32);
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

  it('applies non-uniform local scale to rotated colliders and authored surfaces', () => {
    const materials = createShipMaterials();
    const library = createTestShipFurniture();
    const fixture = {
      id: 'scaled-table',
      modelId: 'table' as const,
      zoneId: 'cargoDeck' as const,
      position: [0, 2.22, 0] as const,
      rotationY: 1.5707963267948966 as const,
      colliderSize: [2, 1, 3] as const,
      scale: [4, 2, 5] as const,
      surfaces: [{
        id: 'scaled-table:top',
        physicalSlotId: 'scaled-table:top',
        categories: ['workshop' as const],
        localPosition: [0, 1, 0] as const,
        localRotation: [0, 0, 0] as const,
        footprint: { width: 0.5, depth: 0.25 },
        clearanceHeight: 0.4,
        standingPoints: [[0, 0, -1] as const],
        fallback: false,
      }],
    };
    const build = createShipFurniture(materials, library, {
      ...SHIP_LAYOUT,
      furniture: [fixture],
    });

    expect(build.colliders[0]!.minX).toBeCloseTo(-7.5);
    expect(build.colliders[0]!.maxX).toBeCloseTo(7.5);
    expect(build.colliders[0]!.minY).toBeCloseTo(2.22);
    expect(build.colliders[0]!.maxY).toBeCloseTo(4.22);
    expect(build.colliders[0]!.minZ).toBeCloseTo(-4);
    expect(build.colliders[0]!.maxZ).toBeCloseTo(4);
    expect(build.surfaces[0]).toMatchObject({
      footprint: { width: 1.25, depth: 2 },
      clearanceHeight: 0.8,
    });

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

  it('keeps the restored lowest cabin shelf within its owner aperture sightline', () => {
    const library = createTestShipFurniture();
    const ship = createShip(library, 1);
    const lowestShelf = ship.itemSurfaces.find(({ id }) =>
      id === 'cabin-bookcase-forward:level-1')!;

    expect(lowestShelf).toBeDefined();
    expect(lowestShelf.standingPoints).toHaveLength(1);
    expect(lowestShelf.standingPoints[0]!.z).toBeCloseTo(10.9);
    expect(isShipSurfaceStandingPointVisible(
      lowestShelf,
      lowestShelf.standingPoints[0]!,
      ship.colliders,
    )).toBe(true);
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
      categories: ['workshop' as const],
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
