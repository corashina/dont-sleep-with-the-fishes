import { describe, expect, it } from 'vitest';
import {
  PLAYER_LAYOUT_RADIUS,
  SHIP_LAYOUT,
  analyzeShipNavigation,
  validateShipLayout,
} from '../src/world/ShipLayout';

describe('scavenging ship layout', () => {
  it('defines the approved spacious five-zone contract', () => {
    expect(PLAYER_LAYOUT_RADIUS).toBe(0.35);
    expect(SHIP_LAYOUT.zones.map(({ id }) => id)).toEqual([
      'crewCabin', 'wheelhouse', 'cargoDeck', 'storageWorkroom', 'lifeboatStation',
    ]);
    expect(SHIP_LAYOUT.doors.every(({ width }) => width >= 1.8 && width <= 2.2)).toBe(true);
    expect(SHIP_LAYOUT.lanes.filter(({ className }) => className === 'primary')
      .every(({ clearWidth }) => clearWidth >= 2)).toBe(true);
    expect(SHIP_LAYOUT.lanes.filter(({ className }) => className === 'secondary')
      .every(({ clearWidth }) => clearWidth >= 1.4)).toBe(true);
    expect(SHIP_LAYOUT.rail.height).toBe(1.05);
    expect(SHIP_LAYOUT.rail.starboardOpening.width).toBe(3.2);
    expect(SHIP_LAYOUT.lanes.filter(({ id }) => /exterior-main/.test(id))
      .map(({ clearWidth }) => clearWidth)).toEqual([2.05, 2.05]);
  });

  it('limits every furnished zone to four role-specific perimeter groups', () => {
    const counts = Object.fromEntries(SHIP_LAYOUT.zones.map(({ id }) => [
      id,
      SHIP_LAYOUT.furniture.filter(({ zoneId }) => zoneId === id).length,
    ]));

    expect(counts).toEqual({
      crewCabin: 4,
      wheelhouse: 4,
      cargoDeck: 4,
      storageWorkroom: 4,
      lifeboatStation: 0,
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
    expect(result.minimumPrimaryClearance).toBeGreaterThanOrEqual(2);
    expect(result.minimumSecondaryClearance).toBeGreaterThanOrEqual(1.4);
    expect(result.secondaryAccessLaneCount).toBeGreaterThan(0);
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
        position: [-2, 2.22, 5.4] as const, rotationY: 0 as const,
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
        ? { ...placement, position: [-3.5, 2.22, 9.48] as const, rotationY: 1.5707963267948966 as const }
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
          categories: ['foodWater' as const],
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

  it.each([1.7, 2.3])('rejects door width %s outside the approved range', (width) => {
    const invalid = {
      ...SHIP_LAYOUT,
      doors: SHIP_LAYOUT.doors.map((door, index) => index === 0 ? { ...door, width } : door),
    };
    expect(() => validateShipLayout(invalid)).toThrow(/cabin-port-door.*width/i);
  });

  it.each([0.9, 1.2])('rejects rail height %s outside the approved range', (height) => {
    const invalid = { ...SHIP_LAYOUT, rail: { ...SHIP_LAYOUT.rail, height } };
    expect(() => validateShipLayout(invalid)).toThrow(/rail height/i);
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
