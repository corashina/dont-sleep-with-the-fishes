import { describe, expect, it } from 'vitest';
import {
  FREIGHTER_DIMENSIONS,
  PLAYER_LAYOUT_RADIUS,
  SHIP_DECK_DETAIL_COUNTS,
  SHIP_LAYOUT,
  analyzeShipNavigation,
  validateShipLayout,
} from '../src/world/ShipLayout';

describe('scavenging ship layout', () => {
  it('defines the enlarged five-zone plan, detail catalog, and rigging', () => {
    expect(PLAYER_LAYOUT_RADIUS).toBe(0.35);
    expect(FREIGHTER_DIMENSIONS).toEqual({ width: 16, length: 44, deckY: 2.22 });
    expect(SHIP_LAYOUT.zones.map(({ id }) => id)).toEqual([
      'crewCabin', 'wheelhouse', 'cargoDeck', 'storageWorkroom', 'lifeboatStation',
    ]);
    expect(SHIP_LAYOUT.zones.find(({ id }) => id === 'crewCabin')!.bounds)
      .toEqual({ minX: -4.6, maxX: 4.6, minZ: 5, maxZ: 12.4 });
    expect(SHIP_LAYOUT.zones.find(({ id }) => id === 'wheelhouse')!.bounds)
      .toEqual({ minX: -4.6, maxX: 4.6, minZ: 13.4, maxZ: 17.2 });
    expect(SHIP_LAYOUT.zones.find(({ id }) => id === 'storageWorkroom')!.bounds)
      .toEqual({ minX: -4.7, maxX: 4.7, minZ: -13.4, maxZ: -8 });
    expect(SHIP_LAYOUT.zones.find(({ id }) => id === 'lifeboatStation')!.bounds)
      .toEqual({ minX: 5, maxX: 7.6, minZ: -1.8, maxZ: 1.8 });
    expect(SHIP_LAYOUT.doors.map(({ id, center, width }) => ({ id, center, width }))).toEqual([
      { id: 'cabin-port-door', center: [-4.6, 7.4], width: 2.4 },
      { id: 'cabin-starboard-door', center: [4.6, 7.4], width: 2.4 },
      { id: 'wheelhouse-aft-door', center: [0, 13.4], width: 2.4 },
      { id: 'wheelhouse-port-door', center: [-4.6, 15.2], width: 2.2 },
      { id: 'storage-port-door', center: [-4.7, -10.6], width: 2.4 },
      { id: 'storage-starboard-door', center: [4.7, -10.6], width: 2.4 },
    ]);
    expect(SHIP_LAYOUT.lanes.filter(({ className }) => className === 'primary')
      .every(({ clearWidth }) => clearWidth >= 2.2)).toBe(true);
    expect(SHIP_LAYOUT.lanes.filter(({ className }) => className === 'secondary')
      .every(({ clearWidth }) => clearWidth >= 1.4)).toBe(true);
    expect(SHIP_LAYOUT.rail).toEqual({
      height: 1.05, innerFaceX: 7.575, starboardOpening: { centerZ: 0, width: 3.6 },
    });
    expect(SHIP_LAYOUT.lanes.filter(({ id }) => /exterior-main/.test(id))
      .map(({ clearWidth }) => clearWidth)).toEqual([2.5, 2.5]);
    const lifeboatStation = SHIP_LAYOUT.zones.find(({ id }) => id === 'lifeboatStation')!;
    const evacuation = SHIP_LAYOUT.targets.find(({ kind }) => kind === 'evacuation')!;
    expect(lifeboatStation.bounds).toEqual({ minX: 5, maxX: 7.6, minZ: -1.8, maxZ: 1.8 });
    expect(lifeboatStation.furniturePolicy.clearCenter).toEqual({
      minX: 6.75, maxX: 7.45, minZ: -0.35, maxZ: 0.35,
    });
    expect(evacuation.position).toEqual([7.1, 0]);
    expect(SHIP_LAYOUT.evacuationRect).toEqual({
      minX: 6.75, maxX: 7.45, minZ: -0.35, maxZ: 0.35,
    });
    expect(SHIP_LAYOUT.details).toHaveLength(16);
    expect(SHIP_DECK_DETAIL_COUNTS).toEqual({
      barrel: 6,
      ropeCoil: 4,
      lifeRing: 4,
      spareTimber: 2,
    });
    expect([...new Set(SHIP_LAYOUT.details.map(({ kind }) => kind))].sort()).toEqual([
      'barrel', 'lifeRing', 'ropeCoil', 'spareTimber',
    ]);
    expect(SHIP_LAYOUT.rigging.masts.map(({ id, position, height, baseDiameter }) => ({
      id, position, height, baseDiameter,
    }))).toEqual([
      { id: 'foremast', position: [0, 2.22, 19.1], height: 8, baseDiameter: 0.6 },
      { id: 'aft-mast', position: [0, 2.22, -4.8], height: 7.2, baseDiameter: 0.6 },
    ]);
  });

  it('locks every retained deck detail to its current authored transform', () => {
    expect(SHIP_LAYOUT.details.map(({ id, kind, position, rotationY, scale }) => ({
      id, kind, position, rotationY, scale,
    }))).toEqual([
      { id: 'barrel-1', kind: 'barrel', position: [-6, 2.22, 18.2], rotationY: 0, scale: [1, 1, 1] },
      { id: 'barrel-2', kind: 'barrel', position: [6, 2.22, 18.2], rotationY: 0, scale: [1, 1, 1] },
      { id: 'barrel-3', kind: 'barrel', position: [-6, 2.22, -18.2], rotationY: 0, scale: [1, 1, 1] },
      { id: 'barrel-4', kind: 'barrel', position: [6, 2.22, -18.2], rotationY: 0, scale: [1, 1, 1] },
      { id: 'barrel-5', kind: 'barrel', position: [-1.8, 2.22, 4.4], rotationY: 0, scale: [1, 1, 1] },
      { id: 'barrel-6', kind: 'barrel', position: [1.9, 2.22, -7.3], rotationY: 0, scale: [1, 1, 1] },
      { id: 'ropeCoil-1', kind: 'ropeCoil', position: [-6.85, 2.22, 13], rotationY: 0, scale: [1, 1, 1] },
      { id: 'ropeCoil-2', kind: 'ropeCoil', position: [6.85, 2.22, 10.1], rotationY: 0, scale: [1, 1, 1] },
      { id: 'ropeCoil-3', kind: 'ropeCoil', position: [-6.85, 2.22, -9], rotationY: 0, scale: [1, 1, 1] },
      { id: 'ropeCoil-4', kind: 'ropeCoil', position: [6.85, 2.22, -12.9], rotationY: 0, scale: [1, 1, 1] },
      { id: 'lifeRing-1', kind: 'lifeRing', position: [-7.2, 2.22, 9.5], rotationY: 0, scale: [1, 1, 1] },
      { id: 'lifeRing-2', kind: 'lifeRing', position: [7.2, 2.22, 14], rotationY: 0, scale: [1, 1, 1] },
      { id: 'lifeRing-3', kind: 'lifeRing', position: [-7.2, 2.22, -13.8], rotationY: 0, scale: [1, 1, 1] },
      { id: 'lifeRing-4', kind: 'lifeRing', position: [7.2, 2.22, -7], rotationY: 0, scale: [1, 1, 1] },
      { id: 'spareTimber-1', kind: 'spareTimber', position: [2.8, 2.22, 12.8], rotationY: 0, scale: [1, 1, 1] },
      { id: 'spareTimber-2', kind: 'spareTimber', position: [-2.8, 2.22, -13.9], rotationY: 0, scale: [1, 1, 1] },
    ]);
  });

  it('locks every retained deck detail to its approved position', () => {
    expect(SHIP_LAYOUT.details.map(({ id, position }) => ({ id, position }))).toEqual([
      { id: 'barrel-1', position: [-6, 2.22, 18.2] },
      { id: 'barrel-2', position: [6, 2.22, 18.2] },
      { id: 'barrel-3', position: [-6, 2.22, -18.2] },
      { id: 'barrel-4', position: [6, 2.22, -18.2] },
      { id: 'barrel-5', position: [-1.8, 2.22, 4.4] },
      { id: 'barrel-6', position: [1.9, 2.22, -7.3] },
      { id: 'ropeCoil-1', position: [-6.85, 2.22, 13] },
      { id: 'ropeCoil-2', position: [6.85, 2.22, 10.1] },
      { id: 'ropeCoil-3', position: [-6.85, 2.22, -9] },
      { id: 'ropeCoil-4', position: [6.85, 2.22, -12.9] },
      { id: 'lifeRing-1', position: [-7.2, 2.22, 9.5] },
      { id: 'lifeRing-2', position: [7.2, 2.22, 14] },
      { id: 'lifeRing-3', position: [-7.2, 2.22, -13.8] },
      { id: 'lifeRing-4', position: [7.2, 2.22, -7] },
      { id: 'spareTimber-1', position: [2.8, 2.22, 12.8] },
      { id: 'spareTimber-2', position: [-2.8, 2.22, -13.9] },
    ]);
  });

  it('assigns deck detail colliders only to barrels and spare timber', () => {
    expect(Object.fromEntries([
      'barrel', 'ropeCoil', 'lifeRing', 'spareTimber',
    ].map((kind) => [
      kind,
      SHIP_LAYOUT.details.filter((detail) => detail.kind === kind && detail.colliderSize).length,
    ]))).toEqual({
      barrel: 6,
      ropeCoil: 0,
      lifeRing: 0,
      spareTimber: 2,
    });
  });

  it('limits every furnished zone to its exact role-specific perimeter fixtures', () => {
    const counts = Object.fromEntries(SHIP_LAYOUT.zones.map(({ id }) => [
      id,
      SHIP_LAYOUT.furniture.filter(({ zoneId }) => zoneId === id).length,
    ]));

    expect(counts).toEqual({
      crewCabin: 6,
      wheelhouse: 6,
      cargoDeck: 7,
      storageWorkroom: 3,
      lifeboatStation: 0,
    });
    expect(Object.fromEntries(SHIP_LAYOUT.zones.map(({ id, furniturePolicy }) => [
      id,
      {
        maxFixtures: furniturePolicy.maxFixtures,
        allowedModelIds: furniturePolicy.allowedModelIds,
      },
    ]))).toEqual({
      crewCabin: {
        maxFixtures: 6,
        allowedModelIds: ['bedBunk', 'desk', 'bookcaseOpen', 'sideTableDrawers'],
      },
      wheelhouse: {
        maxFixtures: 6,
        allowedModelIds: ['desk', 'sideTableDrawers'],
      },
      cargoDeck: {
        maxFixtures: 7,
        allowedModelIds: ['cargoCrate', 'cargoRack'],
      },
      storageWorkroom: {
        maxFixtures: 3,
        allowedModelIds: ['table', 'bookcaseOpen'],
      },
      lifeboatStation: { maxFixtures: 0, allowedModelIds: [] },
    });
    expect(SHIP_LAYOUT.furniture.filter(({ modelId }) => modelId === 'bedBunk')
      .every(({ zoneId }) => zoneId === 'crewCabin')).toBe(true);
    expect(SHIP_LAYOUT.furniture.filter(({ id }) => /helm|chart|instrument/.test(id))
      .every(({ zoneId }) => zoneId === 'wheelhouse')).toBe(true);
    expect(SHIP_LAYOUT.furniture.filter(({ id }) => /workbench|storage-shelf/.test(id))
      .every(({ zoneId }) => zoneId === 'storageWorkroom')).toBe(true);
  });

  it('requires reachable targets across both rounded end decks', () => {
    const endTargets = SHIP_LAYOUT.targets
      .filter(({ kind }) => (kind as string) === 'endDeck')
      .map(({ id }) => id)
      .sort();

    expect(endTargets).toEqual([
      'bow-center', 'bow-port', 'bow-starboard',
      'stern-center', 'stern-port', 'stern-starboard',
    ]);
  });

  it('connects start, both sides of every door, both loop directions, surfaces, and evacuation', () => {
    expect(() => validateShipLayout(SHIP_LAYOUT)).not.toThrow();
    const result = analyzeShipNavigation(SHIP_LAYOUT);
    expect(result.unreachableTargetIds).toEqual([]);
    expect(result.minimumPrimaryClearance).toBeGreaterThanOrEqual(2.2);
    expect(result.minimumSecondaryClearance).toBeGreaterThanOrEqual(1.4);
    expect(result.secondaryAccessLaneCount).toBeGreaterThan(0);
  });

  it('rejects invalid detail and mast obstacles by authored id', () => {
    const duplicateDetail = {
      ...SHIP_LAYOUT,
      details: [...SHIP_LAYOUT.details, { ...SHIP_LAYOUT.details[0]! }],
    };
    expect(() => validateShipLayout(duplicateDetail)).toThrow(/barrel-1/i);

    const laneBarrel = {
      ...SHIP_LAYOUT,
      details: SHIP_LAYOUT.details.map((detail, index) => index === 0
        ? { ...detail, id: 'lane-barrel', position: [0, 2.22, 0] as const }
        : detail),
    };
    expect(() => validateShipLayout(laneBarrel)).toThrow(/lane-barrel/i);

    const zeroHeightMast = {
      ...SHIP_LAYOUT,
      rigging: {
        masts: SHIP_LAYOUT.rigging.masts.map((mast) => mast.id === 'foremast'
          ? { ...mast, height: 0 }
          : mast),
      },
    };
    expect(() => validateShipLayout(zeroHeightMast)).toThrow(/foremast/i);

    const evacuationMast = {
      ...SHIP_LAYOUT,
      rigging: {
        masts: SHIP_LAYOUT.rigging.masts.map((mast) => mast.id === 'aft-mast'
          ? { ...mast, position: [7.1, 2.22, 0] as const }
          : mast),
      },
    };
    expect(() => validateShipLayout(evacuationMast)).toThrow(/aft-mast/i);
  });

  it.each([
    ['a sail top at the minimum clearance', 5.45],
    ['a negative derived cloth length just above the minimum clearance', 5.455],
  ])('rejects %s', (_case, height) => {
    const invalidMast = {
      ...SHIP_LAYOUT,
      rigging: {
        masts: SHIP_LAYOUT.rigging.masts.map((mast) => mast.id === 'foremast'
          ? { ...mast, height }
          : mast),
      },
    };

    expect(() => validateShipLayout(invalidMast)).toThrow(/foremast.*cloth clearance/i);
  });

  it('rejects non-colliding visual details over searchable furniture and item access', () => {
    const missingVisualFootprint = {
      ...SHIP_LAYOUT,
      details: SHIP_LAYOUT.details.map((detail) => {
        if (detail.id !== 'ropeCoil-1') return detail;
        const { visualSize: _visualSize, ...withoutVisualSize } = detail;
        return withoutVisualSize;
      }),
    } as unknown as typeof SHIP_LAYOUT;
    expect(() => validateShipLayout(missingVisualFootprint))
      .toThrow(/ropeCoil-1.*visual footprint/i);

    const invalidVisualFootprint = {
      ...SHIP_LAYOUT,
      details: SHIP_LAYOUT.details.map((detail) => detail.id === 'ropeCoil-1'
        ? { ...detail, visualSize: [0, 1.32] as const }
        : detail),
    };
    expect(() => validateShipLayout(invalidVisualFootprint))
      .toThrow(/ropeCoil-1.*visual footprint/i);

    const crateOverlap = {
      ...SHIP_LAYOUT,
      details: SHIP_LAYOUT.details.map((detail) => detail.id === 'ropeCoil-1'
        ? { ...detail, position: [-4.1, 2.22, 3.8] as const }
        : detail),
    };
    expect(() => validateShipLayout(crateOverlap))
      .toThrow(/ropeCoil-1.*cargo-crate-forward-port/i);

    const accessOverlap = {
      ...SHIP_LAYOUT,
      details: SHIP_LAYOUT.details.map((detail) => detail.id === 'lifeRing-1'
        ? { ...detail, position: [-4.1, 2.22, 2.65] as const }
        : detail),
    };
    expect(() => validateShipLayout(accessOverlap))
      .toThrow(/lifeRing-1.*cargo-crate-forward-port:top-access-0/i);
  });

  it('rejects visual footprints spaced less than one metre apart', () => {
    const crowdedDetails = {
      ...SHIP_LAYOUT,
      details: SHIP_LAYOUT.details.map((detail) => detail.id === 'lifeRing-1'
        ? { ...detail, position: [-7.2, 2.22, 11.4] as const }
        : detail),
    };

    expect(() => validateShipLayout(crowdedDetails))
      .toThrow(/ropeCoil-1.*lifeRing-1.*1 metre/i);
  });

  it('authors the exact perimeter placement and surface catalog', () => {
    expect(SHIP_LAYOUT.furniture.map(({ id, modelId, position }) => ({ id, modelId, position })))
      .toEqual([
        { id: 'cabin-bunk-port', modelId: 'bedBunk', position: [-3.9, 2.22, 10.1] },
        { id: 'cabin-bunk-starboard', modelId: 'bedBunk', position: [3.9, 2.22, 10.1] },
        { id: 'cabin-desk-aft', modelId: 'desk', position: [-2.4, 2.22, 5.51] },
        { id: 'cabin-bookcase-forward', modelId: 'bookcaseOpen', position: [0, 2.22, 12.05] },
        { id: 'cabin-food-cabinet', modelId: 'sideTableDrawers', position: [-3.9, 2.22, 11.75] },
        { id: 'cabin-side-cabinet', modelId: 'sideTableDrawers', position: [3.9, 2.22, 11.75] },
        { id: 'helm-desk-forward', modelId: 'desk', position: [0, 2.22, 16.6] },
        { id: 'chart-table-port', modelId: 'sideTableDrawers', position: [-3, 2.22, 13.77] },
        { id: 'chart-cabinet-port', modelId: 'sideTableDrawers', position: [-2.4, 2.22, 16.83] },
        { id: 'instrument-cabinet-starboard-aft', modelId: 'sideTableDrawers', position: [3.9, 2.22, 14.1] },
        { id: 'instrument-cabinet-starboard-center', modelId: 'sideTableDrawers', position: [3.9, 2.22, 15.4] },
        { id: 'instrument-cabinet-starboard-forward', modelId: 'sideTableDrawers', position: [3.9, 2.22, 16.55] },
        { id: 'workbench-port', modelId: 'table', position: [-2.8, 2.22, -12.72] },
        { id: 'workbench-starboard', modelId: 'table', position: [2.8, 2.22, -12.72] },
        { id: 'storage-shelf-forward', modelId: 'bookcaseOpen', position: [0, 2.22, -8.35] },
        { id: 'cargo-crate-forward-port', modelId: 'cargoCrate', position: [-3.6, 2.22, 3.8] },
        { id: 'cargo-crate-forward-starboard', modelId: 'cargoCrate', position: [3.6, 2.22, 3.8] },
        { id: 'cargo-crate-aft-port', modelId: 'cargoCrate', position: [-3.6, 2.22, -6.4] },
        { id: 'cargo-crate-aft-starboard', modelId: 'cargoCrate', position: [3.6, 2.22, -6.4] },
        { id: 'cargo-rack-port', modelId: 'cargoRack', position: [-3.6, 2.22, 1.5] },
        { id: 'cargo-rack-starboard', modelId: 'cargoRack', position: [3.6, 2.22, 1.5] },
        { id: 'cargo-rod-rack-port', modelId: 'cargoRack', position: [-3.6, 2.22, -3.8] },
      ]);
    const surfaces = SHIP_LAYOUT.furniture.flatMap(({ surfaces }) => surfaces);
    expect(surfaces).toHaveLength(32);
    expect(new Set(surfaces.map(({ physicalSlotId }) => physicalSlotId)).size).toBe(32);
    expect(surfaces.every(({ categories, fallback }) => categories.length === 1 && !fallback))
      .toBe(true);
    expect(Object.fromEntries(['provisions', 'navigation', 'workshop', 'deckGear'].map((category) => [
      category,
      surfaces.filter(({ categories }) => categories[0] === category).length,
    ]))).toEqual({ provisions: 8, navigation: 7, workshop: 8, deckGear: 9 });
    const categoriesByFurniture = Object.fromEntries(SHIP_LAYOUT.furniture.map(({ id, surfaces }) => [
      id,
      [...new Set(surfaces.flatMap(({ categories }) => categories))].sort(),
    ]));
    expect(categoriesByFurniture['cabin-desk-aft']).toEqual(['provisions']);
    expect(categoriesByFurniture['cabin-bookcase-forward']).toEqual(['provisions']);
    expect(categoriesByFurniture['cabin-food-cabinet']).toEqual(['provisions']);
    expect(categoriesByFurniture['cabin-side-cabinet']).toEqual(['provisions']);
    expect(categoriesByFurniture['helm-desk-forward']).toEqual(['navigation']);
    expect(categoriesByFurniture['chart-table-port']).toEqual(['navigation']);
    expect(categoriesByFurniture['chart-cabinet-port']).toEqual(['navigation']);
    expect(categoriesByFurniture['instrument-cabinet-starboard-aft']).toEqual(['navigation']);
    expect(categoriesByFurniture['instrument-cabinet-starboard-center']).toEqual(['navigation']);
    expect(categoriesByFurniture['instrument-cabinet-starboard-forward']).toEqual(['navigation']);
    expect(categoriesByFurniture['workbench-port']).toEqual(['workshop']);
    expect(categoriesByFurniture['workbench-starboard']).toEqual(['workshop']);
    expect(categoriesByFurniture['storage-shelf-forward']).toEqual(['workshop']);
    expect(categoriesByFurniture['cargo-crate-forward-port']).toEqual(['deckGear']);
    expect(categoriesByFurniture['cargo-crate-forward-starboard']).toEqual(['deckGear']);
    expect(categoriesByFurniture['cargo-crate-aft-port']).toEqual(['deckGear']);
    expect(categoriesByFurniture['cargo-crate-aft-starboard']).toEqual(['deckGear']);
    expect(categoriesByFurniture['cargo-rack-port']).toEqual(['deckGear']);
    expect(categoriesByFurniture['cargo-rack-starboard']).toEqual(['deckGear']);
    expect(categoriesByFurniture['cargo-rod-rack-port']).toEqual(['deckGear']);
  });

  it('rejects the old blocked cabin exit and overlapping cargo arrangement by object id', () => {
    const blocked = {
      ...SHIP_LAYOUT,
      furniture: [...SHIP_LAYOUT.furniture, {
        id: 'old-port-bunk', modelId: 'bedBunk' as const, zoneId: 'crewCabin' as const,
        position: [-4.1, 2.22, 7.4] as const, rotationY: 0 as const,
        colliderSize: [1, 1.75, 2.18] as const,
        scale: [1, 1, 1] as const, surfaces: [],
      }],
    };
    expect(() => validateShipLayout(blocked)).toThrow(/old-port-bunk.*cabin-port-door/i);
  });

  it('measures lane bounds instead of trusting a declared clearance', () => {
    const narrowed = {
      ...SHIP_LAYOUT,
      lanes: SHIP_LAYOUT.lanes.map((lane) => lane.id === 'cargo-longitudinal'
        ? { ...lane, bounds: { ...lane.bounds, maxX: 0.9 } }
        : lane),
    };
    expect(() => validateShipLayout(narrowed)).toThrow(/cargo-longitudinal.*measured.*1\.9/i);
  });

  it('applies placement scale when checking furniture footprints', () => {
    const scaled = {
      ...SHIP_LAYOUT,
      furniture: [{
        id: 'scaled-furniture', modelId: 'desk' as const, zoneId: 'crewCabin' as const,
        position: [-3.5, 2.22, 7.4] as const, rotationY: 0 as const,
        colliderSize: [1, 1, 1] as const, scale: [2, 1, 1] as const, surfaces: [],
      }],
    };
    expect(() => validateShipLayout(scaled)).toThrow(/scaled-furniture.*cabin-port-door/i);
  });

  it('rejects furniture zone-role changes and rotated colliders crossing zone walls', () => {
    const relabeledBunk = {
      ...SHIP_LAYOUT,
      furniture: SHIP_LAYOUT.furniture.map((placement) => placement.id === 'cabin-bunk-port'
        ? { ...placement, zoneId: 'cargoDeck' as const }
        : placement),
    };
    expect(() => validateShipLayout(relabeledBunk)).toThrow(/cabin-bunk-port.*cargoDeck/i);

    const cargoDesk = {
      ...SHIP_LAYOUT,
      furniture: SHIP_LAYOUT.furniture.map((placement) => placement.id === 'cabin-desk-aft'
        ? { ...placement, zoneId: 'cargoDeck' as const }
        : placement),
    };
    expect(() => validateShipLayout(cargoDesk)).toThrow(/cabin-desk-aft.*cargoDeck/i);

    const crossingLocker = {
      ...SHIP_LAYOUT,
      furniture: SHIP_LAYOUT.furniture.map((placement) => placement.id === 'cabin-bookcase-forward'
        ? { ...placement, position: [-4.4, 2.22, 11.8] as const, rotationY: 1.5707963267948966 as const }
        : placement),
    };
    expect(() => validateShipLayout(crossingLocker))
      .toThrow(/cabin-bookcase-forward.*crewCabin.*bounds/i);
  });

  it('rejects surface and physical-slot IDs owned by another furniture prefix', () => {
    const unrelatedSurface = {
      ...SHIP_LAYOUT,
      furniture: SHIP_LAYOUT.furniture.map((placement) => placement.id === 'cabin-desk-aft'
        ? {
            ...placement,
            surfaces: placement.surfaces.map((surface, index) => index === 0
              ? { ...surface, id: 'unrelated:top-left' }
              : surface),
          }
        : placement),
    };
    expect(() => validateShipLayout(unrelatedSurface))
      .toThrow(/unrelated:top-left.*cabin-desk-aft/i);

    const unrelatedPhysicalSlot = {
      ...SHIP_LAYOUT,
      furniture: SHIP_LAYOUT.furniture.map((placement) => placement.id === 'cabin-desk-aft'
        ? {
            ...placement,
            surfaces: placement.surfaces.map((surface, index) => index === 0
              ? { ...surface, physicalSlotId: 'unrelated:top-left' }
              : surface),
          }
        : placement),
    };
    expect(() => validateShipLayout(unrelatedPhysicalSlot))
      .toThrow(/unrelated:top-left.*cabin-desk-aft/i);
  });

  it('derives both sides of every current door instead of trusting stale targets', () => {
    const movedDoor = {
      ...SHIP_LAYOUT,
      furniture: [],
      doors: SHIP_LAYOUT.doors.map((door) => door.id === 'cabin-port-door'
        ? {
            ...door,
            center: [-3.7, 8] as const,
            approach: { minX: -4.7, maxX: -2.7, minZ: 6.65, maxZ: 9.35 },
          }
        : door),
      machineryClosure: { minX: -4.5, maxX: -2.9, minZ: 7.7, maxZ: 8.3 },
    };
    expect(analyzeShipNavigation(movedDoor).unreachableTargetIds).toEqual([
      'cabin-port-door-inside', 'cabin-port-door-outside',
    ]);
    expect(() => validateShipLayout(movedDoor)).toThrow(
      /cabin-port-door-inside.*cabin-port-door-outside/i,
    );
  });

  it('derives scaled surface standing targets and exact secondary access rectangles', () => {
    const surfaceId = 'fixture-table:top';
    const fixture = {
      ...SHIP_LAYOUT,
      zones: SHIP_LAYOUT.zones.map((zone) => zone.id === 'storageWorkroom'
        ? { ...zone, furniturePolicy: { ...zone.furniturePolicy, clearCenter: undefined } }
        : zone),
      furniture: [{
        id: 'fixture-table', modelId: 'table' as const, zoneId: 'storageWorkroom' as const,
        position: [0, 2.22, -9] as const, rotationY: 0 as const,
        colliderSize: [1, 1, 1] as const, scale: [2, 1, 1] as const,
        surfaces: [{
          id: surfaceId,
          physicalSlotId: surfaceId,
          categories: ['provisions' as const],
          localPosition: [0, 1, 0] as const,
          localRotation: [0, 0, 0] as const,
          footprint: { width: 0.5, depth: 0.5 },
          clearanceHeight: 1,
          standingPoints: [[1, 0, 0] as const],
          fallback: false,
        }],
      }],
      targets: [...SHIP_LAYOUT.targets, {
        id: `${surfaceId}-standing-0`,
        position: [0, -13] as const,
        kind: 'surface' as const,
      }],
    };
    const result = analyzeShipNavigation(fixture);
    expect(result.unreachableTargetIds).toEqual([]);
    expect(result.secondaryAccessLaneCount).toBe(1);
    expect(result.minimumSecondaryClearance).toBeCloseTo(1.4);
    expect(result.secondaryAccessRectangles).toEqual([{
      id: `${surfaceId}-access-0`,
      bounds: { minX: -0.35, maxX: 2.35, minZ: -9.35, maxZ: -8.65 },
    }]);
    expect(() => validateShipLayout(fixture)).not.toThrow();
  });

  it('rejects an authored surface when every standing point is blocked', () => {
    const blocked = {
      ...SHIP_LAYOUT,
      furniture: SHIP_LAYOUT.furniture.map((placement) =>
        placement.id === 'cabin-desk-aft'
          ? {
              ...placement,
              surfaces: placement.surfaces.map((surface, index) => index === 0
                ? { ...surface, standingPoints: [[0, 0, 0] as const] }
                : surface),
            }
          : placement),
    };

    expect(() => validateShipLayout(blocked))
      .toThrow(/cabin-desk-aft:top-left.*reachable standing point/i);
  });



  it('rejects a rail opening below 3.0 and non-finite rectangle coordinates', () => {
    const narrowOpening = {
      ...SHIP_LAYOUT,
      rail: { ...SHIP_LAYOUT.rail, starboardOpening: { ...SHIP_LAYOUT.rail.starboardOpening, width: 2.9 } },
    };
    expect(() => validateShipLayout(narrowOpening)).toThrow(/rail opening/i);

    const infiniteLane = {
      ...SHIP_LAYOUT,
      lanes: SHIP_LAYOUT.lanes.map((lane, index) => index === 0
        ? { ...lane, bounds: { ...lane.bounds, maxZ: Number.POSITIVE_INFINITY } }
        : lane),
    };
    expect(() => validateShipLayout(infiniteLane)).toThrow(/port-exterior-main.*finite/i);

    const nonFiniteDoor = {
      ...SHIP_LAYOUT,
      doors: SHIP_LAYOUT.doors.map((door, index) => index === 0
        ? { ...door, width: Number.NaN }
        : door),
    };
    expect(() => validateShipLayout(nonFiniteDoor)).toThrow(/cabin-port-door.*width/i);
  });
});
