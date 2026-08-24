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

  it('measures the shortest navigable route around furniture', () => {
    const metric = createShipRouteMetric(SHIP_LAYOUT);
    expect(metric.stable).toBe(true);
    expect(Object.isFrozen(metric)).toBe(true);
    const direct = Math.hypot(7.025, 9.6);
    const routed = metric.distance([0, 9.6], [7.025, 0]);
    expect(routed).not.toBeNull();
    expect(routed!).toBeGreaterThan(direct);
  });

  it('returns null when either point has no reachable grid cell', () => {
    const metric = createShipRouteMetric(SHIP_LAYOUT);
    expect(metric.distance([0, 0], [99, 99])).toBeNull();
  });

  it('returns null for non-finite route coordinates', () => {
    const metric = createShipRouteMetric(SHIP_LAYOUT);
    expect(metric.distance([Number.NaN, 0], [0, 0])).toBeNull();
    expect(metric.distance([0, Number.POSITIVE_INFINITY], [0, 0])).toBeNull();
    expect(metric.distance([0, 0], [Number.NEGATIVE_INFINITY, 0])).toBeNull();
  });

  it('uses one exact symmetric cached route distance', () => {
    const metric = createShipRouteMetric(SHIP_LAYOUT);
    expect(metric.distance([0, 11], [7.025, 0])).toBe(14.878174593051993);
    expect(metric.distance([7.025, 0], [0, 11])).toBe(14.878174593051993);
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
