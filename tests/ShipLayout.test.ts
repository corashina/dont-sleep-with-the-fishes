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
import type { ShipZoneId } from '../src/world/ShipLayout';

describe('scavenging ship layout', () => {
  it('defines the approved enlarged single-level plan', () => {
    expect(FREIGHTER_DIMENSIONS).toEqual({ width: 20, length: 55, deckY: 2.22 });

    const zone = (id: ShipZoneId) =>
      SHIP_LAYOUT.zones.find((candidate) => candidate.id === id)!.bounds;
    const crew = zone('crewCabin');
    const wheelhouse = zone('wheelhouse');
    const storage = zone('storageWorkroom');

    expect(crew.maxX - crew.minX).toBeCloseTo(11.5);
    expect(storage.maxX - storage.minX).toBeCloseTo(11.5);
    expect(wheelhouse.maxX - wheelhouse.minX).toBeCloseTo(11);
    expect(wheelhouse.minZ - crew.maxZ).toBeCloseTo(3.5);
    expect(FREIGHTER_DIMENSIONS.deckY).toBe(2.22);
  });

  it('uses one central mast outside the clear forward-room passage', () => {
    expect(SHIP_LAYOUT.rigging.masts).toHaveLength(1);
    const mast = SHIP_LAYOUT.rigging.masts[0]!;
    expect(mast.id).toBe('mainmast');
    expect(mast.position).toEqual([0, FREIGHTER_DIMENSIONS.deckY, 0]);
    expect(mast.sails.map(({ id }) => id)).toEqual(['mainsail', 'staysail']);

    const crew = SHIP_LAYOUT.zones.find(({ id }) => id === 'crewCabin')!.bounds;
    const wheelhouse = SHIP_LAYOUT.zones.find(({ id }) => id === 'wheelhouse')!.bounds;
    expect(
      mast.position[2] <= crew.maxZ || mast.position[2] >= wheelhouse.minZ,
    ).toBe(true);
  });

  it('authors one mast-facing centered ladder for each inner roof balcony', () => {
    expect(SHIP_LAYOUT.balconies).toEqual([
      expect.objectContaining({
        id: 'crew-balcony',
        zoneId: 'crewCabin',
        ladderId: 'crew-ladder',
        edge: 'aft',
        coamingHeight: 0.12,
        openingWidth: 1.5,
      }),
      expect.objectContaining({
        id: 'storage-balcony',
        zoneId: 'storageWorkroom',
        ladderId: 'storage-ladder',
        edge: 'forward',
        coamingHeight: 0.12,
        openingWidth: 1.5,
      }),
    ]);
    expect(SHIP_LAYOUT.ladders).toEqual([
      expect.objectContaining({
        id: 'crew-ladder',
        zoneId: 'crewCabin',
        edge: 'aft',
        centerX: 0,
      }),
      expect.objectContaining({
        id: 'storage-ladder',
        zoneId: 'storageWorkroom',
        edge: 'forward',
        centerX: 0,
      }),
    ]);
  });

  it('rejects invalid balcony and ladder assignments', () => {
    const narrowerOpening = {
      ...SHIP_LAYOUT,
      balconies: SHIP_LAYOUT.balconies.map((balcony) => balcony.id === 'crew-balcony'
        ? { ...balcony, openingWidth: 0.4 }
        : balcony),
    };
    expect(() => validateShipLayout(narrowerOpening)).toThrow(/crew-balcony.*opening/i);

    const duplicateLadder = {
      ...SHIP_LAYOUT,
      ladders: [...SHIP_LAYOUT.ladders, { ...SHIP_LAYOUT.ladders[0]! }],
    };
    expect(() => validateShipLayout(duplicateLadder)).toThrow(/crew-ladder/i);

    const missingLadder = {
      ...SHIP_LAYOUT,
      balconies: SHIP_LAYOUT.balconies.map((balcony) => balcony.id === 'crew-balcony'
        ? { ...balcony, ladderId: 'missing-ladder' as never }
        : balcony),
    };
    expect(() => validateShipLayout(missingLadder)).toThrow(/crew-balcony.*missing-ladder/i);

    const mismatchedEdge = {
      ...SHIP_LAYOUT,
      ladders: SHIP_LAYOUT.ladders.map((ladder) => ladder.id === 'crew-ladder'
        ? { ...ladder, edge: 'forward' as const }
        : ladder),
    };
    expect(() => validateShipLayout(mismatchedEdge)).toThrow(/crew-ladder.*edge/i);

    const offCenter = {
      ...SHIP_LAYOUT,
      ladders: SHIP_LAYOUT.ladders.map((ladder) => ladder.id === 'crew-ladder'
        ? { ...ladder, centerX: 0.1 }
        : ladder),
    };
    expect(() => validateShipLayout(offCenter)).toThrow(/crew-ladder.*centered/i);

    const invalidDimension = {
      ...SHIP_LAYOUT,
      balconies: SHIP_LAYOUT.balconies.map((balcony) => balcony.id === 'crew-balcony'
        ? { ...balcony, coamingHeight: Number.NaN }
        : balcony),
    };
    expect(() => validateShipLayout(invalidDimension)).toThrow(/crew-balcony.*positive/i);

    const wheelhouseBalcony = {
      ...SHIP_LAYOUT,
      balconies: SHIP_LAYOUT.balconies.map((balcony) => balcony.id === 'crew-balcony'
        ? { ...balcony, zoneId: 'wheelhouse' as never }
        : balcony),
    };
    expect(() => validateShipLayout(wheelhouseBalcony)).toThrow(/crew-balcony.*wheelhouse/i);
  });

  it('rejects a forward-room gap that is not exactly 3.5 metres', () => {
    const changedGap = {
      ...SHIP_LAYOUT,
      zones: SHIP_LAYOUT.zones.map((zone) => zone.id === 'wheelhouse'
        ? { ...zone, bounds: { ...zone.bounds, minZ: zone.bounds.minZ + 0.1 } }
        : zone),
    };

    expect(() => validateShipLayout(changedGap)).toThrow(/room gap.*3\.5/i);
  });

  it.each([
    ['mainsail', 'stay'],
    ['staysail', 'boom'],
  ] as const)('rejects the %s when paired with the wrong rig kind', (id, kind) => {
    const mismatchedSail = {
      ...SHIP_LAYOUT,
      rigging: {
        masts: SHIP_LAYOUT.rigging.masts.map((mast) => ({
          ...mast,
          sails: mast.sails.map((sail) => sail.id === id ? { ...sail, kind } : sail),
        })),
      },
    };

    expect(() => validateShipLayout(mismatchedSail)).toThrow(
      new RegExp(`${id}.*${id === 'mainsail' ? 'boom' : 'stay'}`, 'i'),
    );
  });

  it('rejects sail cloth above the authored mast-height bound', () => {
    const overHeightSail = {
      ...SHIP_LAYOUT,
      rigging: {
        masts: SHIP_LAYOUT.rigging.masts.map((mast) => ({
          ...mast,
          sails: mast.sails.map((sail) => sail.id === 'mainsail'
            ? { ...sail, topY: mast.height }
            : sail),
        })),
      },
    };

    expect(() => validateShipLayout(overHeightSail)).toThrow(/mainsail.*mast height/i);
  });

  it('owns the deck hatch transform and collision footprint in layout data', () => {
    expect(SHIP_LAYOUT.deckHatch).toEqual({
      id: 'deck-hatch',
      position: [3.8, 2.22, -7],
      rotationY: 0,
      size: [1.45, 0.18, 1.8],
      colliderSize: [1.45, 0.18, 1.8],
    });
  });

  it('rejects a deck hatch that conflicts with a primary lane or item access', () => {
    const laneConflict = {
      ...SHIP_LAYOUT,
      deckHatch: {
        ...SHIP_LAYOUT.deckHatch,
        position: [0, 2.22, -7] as const,
      },
    };
    expect(() => validateShipLayout(laneConflict)).toThrow(/deck-hatch.*primary lane/i);

    const accessConflict = {
      ...SHIP_LAYOUT,
      deckHatch: {
        ...SHIP_LAYOUT.deckHatch,
        position: [-5.1, 2.22, 0.9] as const,
      },
    };
    expect(() => validateShipLayout(accessConflict)).toThrow(/deck-hatch.*item access/i);
  });

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
        masts: SHIP_LAYOUT.rigging.masts.map((mast) => mast.id === 'mainmast'
          ? { ...mast, height: 0 }
          : mast),
      },
    };
    expect(() => validateShipLayout(zeroHeightMast)).toThrow(/mainmast/i);

    const evacuationMast = {
      ...SHIP_LAYOUT,
      rigging: {
        masts: SHIP_LAYOUT.rigging.masts.map((mast) => mast.id === 'mainmast'
          ? { ...mast, position: [8.9, 2.22, 0] as const }
          : mast),
      },
    };
    expect(() => validateShipLayout(evacuationMast)).toThrow(/mainmast/i);
  });

  it.each([
    ['a sail foot below the minimum cloth clearance', 5.2],
    ['a sail foot just below the minimum cloth clearance', 5.205],
  ])('rejects %s', (_case, footY) => {
    const invalidMast = {
      ...SHIP_LAYOUT,
      rigging: {
        masts: SHIP_LAYOUT.rigging.masts.map((mast) => mast.id === 'mainmast'
          ? {
            ...mast,
            sails: mast.sails.map((sail) => sail.id === 'mainsail'
              ? { ...sail, footY }
              : sail),
          }
          : mast),
      },
    };

    expect(() => validateShipLayout(invalidMast)).toThrow(/mainmast.*mainsail.*cloth clearance/i);
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
        return { ...nonCollidingDetail, position: [-4.4, 2.22, 3.825] as const };
      }),
    };
    expect(() => validateShipLayout(crateOverlap))
      .toThrow(/barrel-1.*cargo-crate-forward-port/i);

    const accessOverlap = {
      ...SHIP_LAYOUT,
      details: SHIP_LAYOUT.details.map((detail) => {
        if (detail.id !== 'barrel-1') return detail;
        const { colliderSize: _colliderSize, ...nonCollidingDetail } = detail;
        return { ...nonCollidingDetail, position: [-4.4, 2.22, -8.815] as const };
      }),
    };
    expect(() => validateShipLayout(accessOverlap))
      .toThrow(/barrel-1.*cargo-crate-aft-port:top-access-1/i);
  });

  it('rejects visual footprints spaced less than one metre apart', () => {
    const crowdedDetails = {
      ...SHIP_LAYOUT,
      details: SHIP_LAYOUT.details.map((detail) => detail.id === 'barrel-2'
        ? { ...detail, position: [-2.5, 2.22, 4] as const }
        : detail),
    };

    expect(() => validateShipLayout(crowdedDetails))
      .toThrow(/barrel-1.*barrel-2.*1 metre/i);
  });

  it('measures lane bounds instead of trusting a declared clearance', () => {
    const narrowed = {
      ...SHIP_LAYOUT,
      lanes: SHIP_LAYOUT.lanes.map((lane) => lane.id === 'cargo-aft-longitudinal'
        ? { ...lane, bounds: { ...lane.bounds, maxX: 0.9 } }
        : lane),
    };
    expect(() => validateShipLayout(narrowed)).toThrow(/cargo-aft-longitudinal.*measured.*2/i);
  });

  it('applies placement scale when checking furniture footprints', () => {
    const scaled = {
      ...SHIP_LAYOUT,
      furniture: [{
        id: 'scaled-furniture', modelId: 'desk' as const, zoneId: 'crewCabin' as const,
        position: [-4.7, 2.22, 7.4] as const, rotationY: 0 as const,
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
        ? { ...placement, position: [-5.6, 2.22, 13.2] as const, rotationY: 1.5707963267948966 as const }
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
        position: [0, 2.22, -12] as const, rotationY: 0 as const,
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
        position: [0, -12] as const,
        kind: 'surface' as const,
      }],
    };
    const result = analyzeShipNavigation(fixture);
    expect(result.unreachableTargetIds).toEqual([]);
    expect(result.secondaryAccessLaneCount).toBe(1);
    expect(result.minimumSecondaryClearance).toBeCloseTo(1.4);
    expect(result.secondaryAccessRectangles).toEqual([{
      id: `${surfaceId}-access-0`,
      bounds: { minX: -0.35, maxX: 2.35, minZ: -12.35, maxZ: -11.65 },
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
