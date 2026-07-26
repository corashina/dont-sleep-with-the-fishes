import { describe, expect, it } from 'vitest';
import {
  FREIGHTER_DIMENSIONS,
  PLAYER_LAYOUT_RADIUS,
  SHIP_DECK_DETAIL_COUNTS,
  SHIP_LAYOUT,
  SHIP_ROOM_WALL_THICKNESS,
  analyzeShipNavigation,
  detailVisualRect,
  furnitureRect,
  validateShipLayout,
} from '../src/world/ShipLayout';

describe('scavenging ship layout', () => {
  it('assigns deck detail colliders to every retained barrel', () => {
    expect(SHIP_DECK_DETAIL_COUNTS).toEqual({
      barrel: 2,
      cargoBox: 3,
    });
    expect(Object.fromEntries([
      'barrel',
    ].map((kind) => [
      kind,
      SHIP_LAYOUT.details.filter((detail) => detail.kind === kind && detail.colliderSize).length,
    ]))).toEqual({
      barrel: 2,
    });
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

  it('aligns crates and boxes exactly against exterior wall faces', () => {
    const crew = SHIP_LAYOUT.zones.find(({ id }) => id === 'crewCabin')!.bounds;
    const storage = SHIP_LAYOUT.zones.find(({ id }) => id === 'storageWorkroom')!.bounds;
    const halfWall = SHIP_ROOM_WALL_THICKNESS / 2;
    const fixtureRect = (id: string) => furnitureRect(
      SHIP_LAYOUT.furniture.find((fixture) => fixture.id === id)!,
    );

    expect(fixtureRect('cargo-crate-forward-port').minX)
      .toBeCloseTo(crew.minX + halfWall);
    expect(fixtureRect('cargo-crate-forward-port').maxZ)
      .toBeCloseTo(crew.minZ - halfWall);
    expect(fixtureRect('cargo-crate-forward-starboard').maxX)
      .toBeCloseTo(crew.maxX - halfWall);
    expect(fixtureRect('cargo-crate-forward-starboard').maxZ)
      .toBeCloseTo(crew.minZ - halfWall);
    expect(fixtureRect('cargo-crate-aft-port').minX)
      .toBeCloseTo(storage.minX + halfWall);
    expect(fixtureRect('cargo-crate-aft-port').minZ)
      .toBeCloseTo(storage.maxZ + halfWall);
    expect(fixtureRect('cargo-crate-aft-starboard').maxX)
      .toBeCloseTo(storage.maxX - halfWall);
    expect(fixtureRect('cargo-crate-aft-starboard').minZ)
      .toBeCloseTo(storage.maxZ + halfWall);

    const boxRect = (id: string) => detailVisualRect(
      SHIP_LAYOUT.details.find((detail) => detail.id === id)!,
    );
    expect(boxRect('cargoBox-1').maxX).toBeCloseTo(crew.minX - halfWall);
    expect(boxRect('cargoBox-2').minX).toBeCloseTo(storage.maxX + halfWall);
    expect(boxRect('cargoBox-3').maxX).toBeCloseTo(storage.minX - halfWall);
    SHIP_LAYOUT.details.filter(({ kind }) => kind === 'cargoBox')
      .forEach(({ rotationY }) => expect(rotationY).toBe(0));
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
        if (detail.id !== 'barrel-1') return detail;
        const { visualSize: _visualSize, ...withoutVisualSize } = detail;
        return withoutVisualSize;
      }),
    } as unknown as typeof SHIP_LAYOUT;
    expect(() => validateShipLayout(missingVisualFootprint))
      .toThrow(/barrel-1.*visual footprint/i);

    const invalidVisualFootprint = {
      ...SHIP_LAYOUT,
      details: SHIP_LAYOUT.details.map((detail) => detail.id === 'barrel-1'
        ? { ...detail, visualSize: [0, 1.32] as const }
        : detail),
    };
    expect(() => validateShipLayout(invalidVisualFootprint))
      .toThrow(/barrel-1.*visual footprint/i);

    const crateOverlap = {
      ...SHIP_LAYOUT,
      details: SHIP_LAYOUT.details.map((detail) => {
        if (detail.id !== 'barrel-1') return detail;
        const { colliderSize: _colliderSize, ...nonCollidingDetail } = detail;
        return { ...nonCollidingDetail, position: [-3.815, 2.22, 4.315] as const };
      }),
    };
    expect(() => validateShipLayout(crateOverlap))
      .toThrow(/barrel-1.*cargo-crate-forward-port/i);

    const accessOverlap = {
      ...SHIP_LAYOUT,
      details: SHIP_LAYOUT.details.map((detail) => {
        if (detail.id !== 'barrel-1') return detail;
        const { colliderSize: _colliderSize, ...nonCollidingDetail } = detail;
        return { ...nonCollidingDetail, position: [-3.915, 2.22, -6.165] as const };
      }),
    };
    expect(() => validateShipLayout(accessOverlap))
      .toThrow(/barrel-1.*cargo-crate-aft-port:top-access-1/i);
  });

  it('rejects visual footprints spaced less than one metre apart', () => {
    const crowdedDetails = {
      ...SHIP_LAYOUT,
      details: SHIP_LAYOUT.details.map((detail) => detail.id === 'barrel-2'
        ? { ...detail, position: [-1.8, 2.22, 5.8] as const }
        : detail),
    };

    expect(() => validateShipLayout(crowdedDetails))
      .toThrow(/barrel-1.*barrel-2.*1 metre/i);
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
