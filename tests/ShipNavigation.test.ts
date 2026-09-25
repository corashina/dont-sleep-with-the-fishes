// Importance: 8/10 (scaled from 4/5). Protects deterministic ship navigation.
import { describe, expect, it } from 'vitest';
import { SHIP_LAYOUT } from '../src/world/shipLayoutData';
import {
  analyzeShipNavigation,
  createShipRouteMetric,
} from '../src/world/ShipNavigation';

describe('ship navigation', () => {
  it('connects start, doors, lanes, surfaces, and evacuation', () => {
    const result = analyzeShipNavigation(SHIP_LAYOUT);
    expect(result.unreachableTargetIds).toEqual([]);
    expect(result.minimumPrimaryClearance).toBeGreaterThanOrEqual(2.2);
    expect(result.minimumSecondaryClearance).toBeGreaterThanOrEqual(1.4);
    expect(result.secondaryAccessLaneCount).toBeGreaterThan(0);
  });

  // Importance: 95/100. Route costs drive supply placement; a detour must be shortest and avoid the obstacle.
  it('measures the shortest route around a rectangular hatch', () => {
    const cargo = SHIP_LAYOUT.zones.find(({ id }) => id === 'cargoDeck')!;
    const metric = createShipRouteMetric({
      ...SHIP_LAYOUT,
      zones: [{ ...cargo, bounds: { minX: -5, maxX: 5, minZ: -5, maxZ: 5 },
        polygon: [[-5, -5], [5, -5], [5, 5], [-5, 5]] }],
      furniture: [], doors: [],
      rigging: { ...SHIP_LAYOUT.rigging, masts: [] },
      deckHatch: { ...SHIP_LAYOUT.deckHatch, position: [0, 0, 0], rotationY: 0, colliderSize: [0.4, 1, 1.2] },
    });
    expect(metric.stable).toBe(true);
    expect(Object.isFrozen(metric)).toBe(true);
    // The inflated hatch blocks x +/-0.55 and z +/-0.95. On the 0.1 grid,
    // the shortest route has two metres of diagonal travel and two of straight travel.
    expect(metric.distance([-2, 0], [2, 0])).toBeCloseTo(2 * Math.SQRT2 + 2, 8);
  });

  it('returns null when either point has no reachable grid cell', () => {
    const metric = createShipRouteMetric(SHIP_LAYOUT);
    expect(metric.distance([0, 0], [99, 99])).toBeNull();
  });

  it('returns null in both directions for a blocked in-grid endpoint', () => {
    const metric = createShipRouteMetric(SHIP_LAYOUT);
    expect(metric.distance([0, 9.6], [0, -7])).toBeNull();
    expect(metric.distance([0, -7], [0, 9.6])).toBeNull();
    expect(metric.distance([0, 9.6], [0, -7])).toBeNull();
  });

  it('returns null for non-finite route coordinates', () => {
    const metric = createShipRouteMetric(SHIP_LAYOUT);
    expect(metric.distance([Number.NaN, 0], [0, 0])).toBeNull();
    expect(metric.distance([0, Number.POSITIVE_INFINITY], [0, 0])).toBeNull();
    expect(metric.distance([0, 0], [Number.NEGATIVE_INFINITY, 0])).toBeNull();
  });

  // Importance: 90/100. The production layout must yield stable bidirectional route costs.
  it('returns the same production route distance in both directions and on repeat', () => {
    const metric = createShipRouteMetric(SHIP_LAYOUT);
    const distance = metric.distance([0, 11], [7.025, 0]);
    expect(distance).toBeGreaterThan(Math.hypot(7.025, 11));
    expect(metric.distance([7.025, 0], [0, 11])).toBe(distance);
    expect(metric.distance([0, 11], [7.025, 0])).toBe(distance);
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
    expect(analyzeShipNavigation(movedDoor).unreachableTargetIds).toEqual([
      'cabin-port-door-inside', 'cabin-port-door-outside',
    ]);
  });

  it('derives scaled surface targets and exact secondary access rectangles', () => {
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
    const result = analyzeShipNavigation(fixture);
    expect(result.unreachableTargetIds).toEqual([]);
    expect(result.reachableSurfaceStandingPointIds).toEqual([`${surfaceId}-standing-0`]);
    expect(result.secondaryAccessLaneCount).toBe(1);
    expect(result.minimumSecondaryClearance).toBeCloseTo(1.4);
    expect(result.secondaryAccessRectangles).toEqual([{
      id: `${surfaceId}-access-0`,
      bounds: { minX: -0.35, maxX: 2.35, minZ: -13.35, maxZ: -12.65 },
    }]);
  });
});
