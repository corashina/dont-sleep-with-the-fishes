// Importance: 8/10 (scaled from 4/5). Protects ship layout validation constraints.
import { describe,expect,it } from 'vitest';
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
