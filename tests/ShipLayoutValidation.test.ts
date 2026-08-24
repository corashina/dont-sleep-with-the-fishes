// Importance: 8/10 (scaled from 4/5). Protects ship layout validation constraints.
import { describe, expect, it } from 'vitest';
import { SHIP_LAYOUT } from '../src/world/shipLayoutData';
import { type ShipLayoutSpec } from '../src/world/ShipLayoutTypes';
import { validateShipLayout } from '../src/world/ShipLayoutValidation';

function expectValidationError(layout: ShipLayoutSpec, expected: string): void {
  try {
    validateShipLayout(layout);
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(expected);
    return;
  }
  throw new Error(`Expected validation error: ${expected}`);
}

describe('ship layout validation', () => {
  it('accepts the canonical ship layout', () => {
    expect(() => validateShipLayout(SHIP_LAYOUT)).not.toThrow();
  });

  it('rejects invalid mainmast lookout assignments', () => {
    const missingMast = {
      ...SHIP_LAYOUT,
      rigging: {
        ...SHIP_LAYOUT.rigging,
        crowsNest: { ...SHIP_LAYOUT.rigging.crowsNest, mastId: 'missing-mast' as never },
      },
    };
    expectValidationError(
      missingMast,
      "Crow's nest mainmast-lookout references missing mast missing-mast",
    );

    const invalidDimension = {
      ...SHIP_LAYOUT,
      rigging: {
        ...SHIP_LAYOUT.rigging,
        crowsNest: { ...SHIP_LAYOUT.rigging.crowsNest, ladder: {
          ...SHIP_LAYOUT.rigging.crowsNest.ladder,
          rungSpacing: 0,
        } },
      },
    };
    expectValidationError(
      invalidDimension,
      "Crow's nest mainmast-lookout must have positive finite dimensions",
    );

    const narrowOpening = {
      ...SHIP_LAYOUT,
      rigging: {
        ...SHIP_LAYOUT.rigging,
        crowsNest: { ...SHIP_LAYOUT.rigging.crowsNest, openingSize: 0.89 },
      },
    };
    expectValidationError(
      narrowOpening,
      "Crow's nest mainmast-lookout opening must be at least 0.9 metres",
    );

    const highFloor = {
      ...SHIP_LAYOUT,
      rigging: {
        ...SHIP_LAYOUT.rigging,
        crowsNest: { ...SHIP_LAYOUT.rigging.crowsNest, floorOffsetY: 14.6 },
      },
    };
    expectValidationError(
      highFloor,
      "Crow's nest mainmast-lookout floor exceeds mast height",
    );
  });

  it('rejects invalid balcony and ladder assignments', () => {
    const narrowerOpening = {
      ...SHIP_LAYOUT,
      balconies: SHIP_LAYOUT.balconies.map((balcony) => balcony.id === 'crew-balcony'
        ? { ...balcony, openingWidth: 0.4 }
        : balcony),
    };
    expectValidationError(
      narrowerOpening,
      'Balcony crew-balcony opening must fit its ladder and player clearance',
    );

    const duplicateLadder = {
      ...SHIP_LAYOUT,
      ladders: [...SHIP_LAYOUT.ladders, { ...SHIP_LAYOUT.ladders[0]! }],
    };
    expectValidationError(
      duplicateLadder,
      'Duplicate ladder id: crew-ladder',
    );

    const missingLadder = {
      ...SHIP_LAYOUT,
      balconies: SHIP_LAYOUT.balconies.map((balcony) => balcony.id === 'crew-balcony'
        ? { ...balcony, ladderId: 'missing-ladder' as never }
        : balcony),
    };
    expectValidationError(
      missingLadder,
      'Balcony crew-balcony references missing ladder missing-ladder',
    );

    const mismatchedEdge = {
      ...SHIP_LAYOUT,
      ladders: SHIP_LAYOUT.ladders.map((ladder) => ladder.id === 'crew-ladder'
        ? { ...ladder, edge: 'forward' as const }
        : ladder),
    };
    expectValidationError(
      mismatchedEdge,
      'Ladder crew-ladder must use the mast-facing aft edge',
    );

    const offCenter = {
      ...SHIP_LAYOUT,
      ladders: SHIP_LAYOUT.ladders.map((ladder) => ladder.id === 'crew-ladder'
        ? { ...ladder, centerX: 0.1 }
        : ladder),
    };
    expectValidationError(
      offCenter,
      'Ladder crew-ladder must be centered at x = 0',
    );

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
    expectValidationError(
      wheelhouseBalcony,
      'Balcony crew-balcony cannot be assigned to wheelhouse',
    );
  });

  it('rejects missing roof stays and anchors too close to roof edges', () => {
    const missingStay = {
      ...SHIP_LAYOUT,
      rigging: {
        ...SHIP_LAYOUT.rigging,
        masts: SHIP_LAYOUT.rigging.masts.map((mast) => ({
          ...mast,
          stays: mast.stays.slice(1),
        })),
      },
    };
    expectValidationError(
      missingStay,
      'Mast mainmast must define four roof-corner stays',
    );

    const crew = SHIP_LAYOUT.zones.find(({ id }) => id === 'crewCabin')!.bounds;
    const railingOverlap = {
      ...SHIP_LAYOUT,
      rigging: {
        ...SHIP_LAYOUT.rigging,
        masts: SHIP_LAYOUT.rigging.masts.map((mast) => ({
          ...mast,
          stays: mast.stays.map((stay) => stay.id === 'fore-port'
            ? {
              ...stay,
              anchor: [crew.minX + 0.1, stay.anchor[1], stay.anchor[2]] as const,
            }
            : stay),
        })),
      },
    };
    expectValidationError(
      railingOverlap,
      'Mast mainmast stay fore-port is too close to a roof edge',
    );
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
    ['mainsail', 'stay', 'Mast mainmast sail mainsail must use boom rig kind'],
    ['staysail', 'boom', 'Mast mainmast sail staysail must use stay rig kind'],
  ] as const)('rejects the %s when paired with the wrong rig kind', (id, kind, message) => {
    const mismatchedSail = {
      ...SHIP_LAYOUT,
      rigging: {
        ...SHIP_LAYOUT.rigging,
        masts: SHIP_LAYOUT.rigging.masts.map((mast) => ({
          ...mast,
          sails: mast.sails.map((sail) => sail.id === id ? { ...sail, kind } : sail),
        })),
      },
    };

    expectValidationError(mismatchedSail, message);
  });

  it('rejects sail cloth above the authored mast-height bound', () => {
    const overHeightSail = {
      ...SHIP_LAYOUT,
      rigging: {
        ...SHIP_LAYOUT.rigging,
        masts: SHIP_LAYOUT.rigging.masts.map((mast) => ({
          ...mast,
          sails: mast.sails.map((sail) => sail.id === 'mainsail'
            ? { ...sail, topY: mast.height }
            : sail),
        })),
      },
    };

    expectValidationError(
      overHeightSail,
      'Mast mainmast sail mainsail exceeds mast height bounds',
    );
  });

  it('rejects a deck hatch that conflicts with a primary lane or item access', () => {
    const laneConflict = {
      ...SHIP_LAYOUT,
      deckHatch: {
        ...SHIP_LAYOUT.deckHatch,
        position: [0, 2.22, -3] as const,
      },
    };
    expect(() => validateShipLayout(laneConflict)).toThrow(/deck-hatch.*primary lane/i);

    const accessConflict = {
      ...SHIP_LAYOUT,
      deckHatch: {
        ...SHIP_LAYOUT.deckHatch,
        position: [-4.4, 2.22, 2.4] as const,
      },
    };
    expect(() => validateShipLayout(accessConflict)).toThrow(/deck-hatch.*item access/i);
  });

  it('rejects invalid mast obstacles by authored id', () => {
    const zeroHeightMast = {
      ...SHIP_LAYOUT,
      rigging: {
        ...SHIP_LAYOUT.rigging,
        masts: SHIP_LAYOUT.rigging.masts.map((mast) => mast.id === 'mainmast'
          ? { ...mast, height: 0 }
          : mast),
      },
    };
    expectValidationError(
      zeroHeightMast,
      'Mast mainmast has invalid dimensions or stay anchors',
    );

    const evacuationMast = {
      ...SHIP_LAYOUT,
      rigging: {
        ...SHIP_LAYOUT.rigging,
        masts: SHIP_LAYOUT.rigging.masts.map((mast) => mast.id === 'mainmast'
          ? { ...mast, position: [8.9, 2.22, 0] as const }
          : mast),
      },
    };
    expect(() => validateShipLayout(evacuationMast)).toThrow(/mainmast/i);

    const wideMast = {
      ...SHIP_LAYOUT,
      rigging: {
        ...SHIP_LAYOUT.rigging,
        masts: SHIP_LAYOUT.rigging.masts.map((mast) => mast.id === 'mainmast'
          ? { ...mast, baseDiameter: 30 }
          : mast),
      },
    };
    expectValidationError(
      wideMast,
      'Mast mainmast base crosses the cargoDeck hull polygon',
    );
  });

  it.each([
    ['a sail foot below the minimum cloth clearance', 5.2],
    ['a sail foot just below the minimum cloth clearance', 5.205],
  ])('rejects %s', (_case, footY) => {
    const invalidMast = {
      ...SHIP_LAYOUT,
      rigging: {
        ...SHIP_LAYOUT.rigging,
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

    expectValidationError(
      invalidMast,
      'Mast mainmast sail mainsail violates cloth clearance',
    );
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
      furniture: SHIP_LAYOUT.furniture.map((placement) => placement.id === 'cabin-cabinet-port-forward'
        ? { ...placement, position: [-5.6, 2.22, 13.2] as const, rotationY: 1.5707963267948966 as const }
        : placement),
    };
    expect(() => validateShipLayout(crossingLocker))
      .toThrow(/cabin-cabinet-port-forward.*crewCabin.*bounds/i);
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

  it('rejects surface regions that do not match their physical owners', () => {
    const mislabeledCabin = {
      ...SHIP_LAYOUT,
      furniture: SHIP_LAYOUT.furniture.map((placement) =>
        placement.id === 'cabin-desk-aft'
          ? {
              ...placement,
              surfaces: placement.surfaces.map((surface, index) => index === 0
                ? { ...surface, regionId: 'wheelhouse' as const }
                : surface),
            }
          : placement),
    };
    expectValidationError(
      mislabeledCabin,
      'Surface cabin-desk-aft:top-left physical owner cabin-desk-aft belongs to crewCabin, not wheelhouse',
    );

    const mislabeledCargo = {
      ...SHIP_LAYOUT,
      furniture: SHIP_LAYOUT.furniture.map((placement) =>
        placement.id === 'cargo-rack-mast-port'
          ? {
              ...placement,
              surfaces: placement.surfaces.map((surface, index) => index === 0
                ? { ...surface, regionId: 'bow' as const }
                : surface),
            }
          : placement),
    };
    expect(() => validateShipLayout(mislabeledCargo))
      .toThrow(/cargo-rack-mast-port:top-left.*physical owner.*centralCargo/i);

    const cargoInsideCabin = {
      ...SHIP_LAYOUT,
      furniture: SHIP_LAYOUT.furniture.map((placement) =>
        placement.id === 'cargo-rack-mast-port'
          ? { ...placement, position: [0, 2.22, 8] as const }
          : placement),
    };
    expect(() => validateShipLayout(cargoInsideCabin))
      .toThrow(/cargo-rack-mast-port:top-left.*approved physical owner placement/i);
  });

  it('requires raised approved owners inside the physical bow and stern zones', () => {
    const invalidBowOwner = {
      ...SHIP_LAYOUT,
      furniture: SHIP_LAYOUT.furniture.map((placement) =>
        placement.id === 'bow-crate-starboard'
          ? { ...placement, modelId: 'cargoRack' as const }
          : placement),
    };
    expectValidationError(
      invalidBowOwner,
      'Furniture bow-crate-starboard in bow must be a raised cargoCrate or barrel owner',
    );

    const lowSternSurface = {
      ...SHIP_LAYOUT,
      furniture: SHIP_LAYOUT.furniture.map((placement) =>
        placement.id === 'stern-crate-port'
          ? {
              ...placement,
              surfaces: placement.surfaces.map((surface) => ({
                ...surface,
                localPosition: [surface.localPosition[0], 0.4, surface.localPosition[2]] as const,
              })),
            }
          : placement),
    };
    expectValidationError(
      lowSternSurface,
      "Surface stern-crate-port:top in stern must use its owner's raised top",
    );
  });

  it('derives both sides of every current door instead of trusting stale targets', () => {
    const movedDoor = {
      ...SHIP_LAYOUT,
      furniture: [],
      doors: SHIP_LAYOUT.doors.map((door) => door.id === 'cabin-port-door'
        ? {
            ...door,
            center: [-20, 8] as const,
            approach: { minX: -21, maxX: -19, minZ: 6.65, maxZ: 9.35 },
          }
        : door),
    };
    expectValidationError(
      movedDoor,
      'Unreachable navigation targets: cabin-port-door-inside, cabin-port-door-outside',
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
        position: [0, 2.22, -13] as const, rotationY: 0 as const,
        colliderSize: [1, 1, 1] as const, scale: [2, 1, 1] as const,
        surfaces: [{
          id: surfaceId,
          physicalSlotId: surfaceId,
          regionId: 'storageWorkroom' as const,
          branch: false,
          localPosition: [0, 1, 0] as const,
          localRotation: [0, 0, 0] as const,
          footprint: { width: 0.5, depth: 0.5 },
          clearanceHeight: 1,
          standingPoints: [[1, 0, 0] as const],
        }],
      }],
      lanes: SHIP_LAYOUT.lanes.filter(({ id }) => !id.includes('-loop-')),
      targets: [...SHIP_LAYOUT.targets, {
        id: `${surfaceId}-standing-0`,
        position: [0, -13] as const,
        kind: 'surface' as const,
      }],
    };
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

    expectValidationError(
      blocked,
      'Surface cabin-desk-aft:top-left has no reachable standing point',
    );
  });

  it('rejects a rail opening below 3.0 and non-finite rectangle coordinates', () => {
    const narrowOpening = {
      ...SHIP_LAYOUT,
      rail: { ...SHIP_LAYOUT.rail, starboardOpening: { ...SHIP_LAYOUT.rail.starboardOpening, width: 2.9 } },
    };
    expectValidationError(
      narrowOpening,
      'Rail opening width 2.9 must be at least 3.0',
    );

    const infiniteLane = {
      ...SHIP_LAYOUT,
      lanes: SHIP_LAYOUT.lanes.map((lane, index) => index === 0
        ? { ...lane, bounds: { ...lane.bounds, maxZ: Number.POSITIVE_INFINITY } }
        : lane),
    };
    expectValidationError(
      infiniteLane,
      'Lane port-exterior-main must use finite rectangle coordinates',
    );

    const nonFiniteDoor = {
      ...SHIP_LAYOUT,
      doors: SHIP_LAYOUT.doors.map((door, index) => index === 0
        ? { ...door, width: Number.NaN }
        : door),
    };
    expectValidationError(
      nonFiniteDoor,
      'Door cabin-port-door width NaN must be between 2.4 and 2.6',
    );
  });

  it('rejects a stern surface access path that crosses the storage wall', () => {
    const crossingWall = {
      ...SHIP_LAYOUT,
      furniture: SHIP_LAYOUT.furniture.map((owner) => owner.id === 'stern-crate-port'
        ? {
            ...owner,
            surfaces: owner.surfaces.map((surface) => ({
              ...surface,
              standingPoints: [[1.8, 0, 3.2] as const],
            })),
          }
        : owner),
    };
    expect(() => validateShipLayout(crossingWall))
      .toThrow(/stern-crate-port:top.*(access.*wall|no reachable standing point)/i);
  });
});
