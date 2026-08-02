// Importance: 4/5. Protects valid deterministic item placement.
import { performance } from 'node:perf_hooks';
import { Box3, Euler, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  ITEM_DEFINITIONS,
  createItemInstances,
} from '../src/game/ItemState';
import {
  planBaselineScavengeRoute,
  planExpertScavengeRoute,
} from '../src/game/ScavengeRoutePlanner';
import { createScavengeItemInstances } from '../src/game/scavengeCatalog';
import { createShip } from '../src/world/Ship';
import {
  SCAVENGE_FALLBACK_SURFACE_BY_INSTANCE,
  SCAVENGE_GENERATED_PLACEMENT_ATTEMPTS,
  SHIP_ITEM_PROFILES,
  assignShipItems,
  shipItemTransformBounds,
  validateShipItemSurfaces,
  type ShipItemSurface,
  type ShipItemTransform,
  type ShipPlacementContext,
} from '../src/world/ShipItemPlacement';
import {
  createShipRouteMetric,
  SHIP_LAYOUT,
  type ScavengeRegionId,
} from '../src/world/ShipLayout';
import { createTestShipFurniture } from './helpers/shipFurniture';

function surface(
  id: string,
  x: number,
  options: Partial<ShipItemSurface> = {},
): ShipItemSurface {
  return {
    id,
    physicalSlotId: id,
    furnitureId: `fixture-${id}`,
    furnitureModelId: 'table',
    regionId: 'centralCargo',
    branch: false,
    position: new Vector3(x, 3, 0),
    rotation: new Euler(),
    footprint: { width: 2.1, depth: 2.1 },
    clearanceHeight: 1.2,
    standingPoints: [new Vector3(x, 2.22, -1.25)],
    ...options,
  };
}

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function placementContext(
  ship: ReturnType<typeof createShip>,
  maxAttempts?: number,
): ShipPlacementContext {
  const station = SHIP_LAYOUT.zones.find(({ id }) => id === 'lifeboatStation')!;
  return {
    routeMetric: createShipRouteMetric(SHIP_LAYOUT),
    start: [ship.playerStart.x, ship.playerStart.z],
    deposit: [
      (station.bounds.minX + station.bounds.maxX) / 2,
      (station.bounds.minZ + station.bounds.maxZ) / 2,
    ],
    evacuation: [ship.evacuationPoint.x, ship.evacuationPoint.z],
    maxAttempts,
  };
}

const REGION_LIMITS: Readonly<Record<
  ScavengeRegionId,
  readonly [number, number]
>> = {
  crewCabin: [3, 4],
  wheelhouse: [2, 3],
  centralCargo: [6, 7],
  storageWorkroom: [3, 4],
  bow: [2, 3],
  stern: [2, 3],
};

function expectProductionConstraints(
  assignments: ReadonlyMap<string, ShipItemTransform>,
  context: ShipPlacementContext,
): void {
  for (const [regionId, [minimum, maximum]] of Object.entries(REGION_LIMITS)) {
    const count = [...assignments.values()].filter(
      (value) => value.regionId === regionId,
    ).length;
    expect(count, regionId).toBeGreaterThanOrEqual(minimum);
    expect(count, regionId).toBeLessThanOrEqual(maximum);
  }
  const branches = [...assignments.values()].filter(({ branch }) => branch).length;
  expect(branches).toBeGreaterThanOrEqual(4);
  expect(branches).toBeLessThanOrEqual(6);

  const values = [...assignments.values()];
  values.forEach((left, index) => values.slice(index + 1).forEach((right) => {
    expect(
      Math.hypot(left.position.x - right.position.x, left.position.z - right.position.z),
    ).toBeGreaterThanOrEqual(1.25 - 1e-6);
  }));
  for (const instance of createScavengeItemInstances()) {
    const value = assignments.get(instance.instanceId)!;
    const weight = ITEM_DEFINITIONS[instance.type].weight;
    const distance = context.routeMetric.distance(
      [value.standingPoint.x, value.standingPoint.z],
      context.deposit,
    );
    expect(distance).not.toBeNull();
    if (weight === 3) expect(distance!).toBeLessThanOrEqual(14 + 1e-6);
    if (weight === 2) expect(distance!).toBeLessThanOrEqual(22 + 1e-6);
  }
}

describe('ship item placement', () => {
  it.each([
    ['cannedFood-1', 'bow'],
    ['compass-1', 'storageWorkroom'],
    ['ductTape-1', 'crewCabin'],
    ['bottledPaper-1', 'centralCargo'],
  ] as const)('allows %s in fitting %s spots', (instanceId, regionId) => {
    const item = createScavengeItemInstances().find(
      (candidate) => candidate.instanceId === instanceId,
    )!;
    const assignment = assignShipItems([
      item,
    ], [surface('wide', 0, { regionId })]).get(instanceId);
    expect(assignment?.regionId).toBe(regionId);
  });

  it('uses injected random values for context-free physical assignment', () => {
    const flareGun = createItemInstances().filter(({ type }) => type === 'flareGun');
    const choices = [surface('flare-left', 0), surface('flare-right', 4)];
    expect(assignShipItems(flareGun, choices, () => 0).get('flareGun-1')!.surfaceId)
      .toBe('flare-right');
    expect(assignShipItems(flareGun, choices, () => 0.99).get('flareGun-1')!.surfaceId)
      .toBe('flare-left');
  });

  it('keeps physical fit, ownership, blocker, and slot safety', () => {
    expect(() => assignShipItems([], [
      surface('duplicate', 0),
      surface('duplicate', 4),
    ])).toThrow(/duplicate ship item surface id/i);
    expect(() => assignShipItems([], [surface('ownerless', 0, {
      furnitureId: '',
    })])).toThrow(/ownerless.*owner/i);
    expect(() => assignShipItems([], [
      surface('slot-left', 0, { physicalSlotId: 'same-slot' }),
      surface('slot-right', 4, { physicalSlotId: 'same-slot' }),
    ])).toThrow(/duplicate.*physical slot/i);
    expect(() => assignShipItems([], [surface('unknown-region', 0, {
      regionId: 'belowDeck' as never,
    })])).toThrow(/unknown-region.*unknown.*region/i);
    expect(() => assignShipItems([], [surface('zero-width', 0, {
      footprint: { width: 0, depth: 1 },
    })])).toThrow(/zero-width.*positive/i);

    const food = createItemInstances().filter(({ type }) => type === 'cannedFood').slice(0, 1);
    expect(() => assignShipItems(food, [surface('too-small', 0, {
      footprint: { width: SHIP_ITEM_PROFILES.cannedFood.width * 0.74, depth: 0.35 },
      clearanceHeight: 0.42,
    })])).toThrow(/cannedFood-1/);
  });

  it('keeps owner bounds and structure clearance checks', () => {
    const owned = surface('structural', 0, {
      furnitureId: 'fixture-structural',
      position: new Vector3(0, 3, 0),
      footprint: { width: 2, depth: 2 },
    });
    const owner = {
      minX: -1, maxX: 1, minY: 2, maxY: 3, minZ: -1, maxZ: 1,
      furnitureId: 'fixture-structural', furnitureModelId: 'table' as const,
    };
    expect(() => validateShipItemSurfaces([owned], [], new Map()))
      .toThrow(/owner fixture-structural/i);
    expect(() => validateShipItemSurfaces([owned], [{
      minX: 1.05, maxX: 1.2, minY: 2, maxY: 5, minZ: -2, maxZ: 2,
    }], new Map([[owner.furnitureId, owner]])))
      .toThrow(/wall clearance.*0\.1/i);
  });

  it('requires route context for the production twenty-one item catalog', () => {
    const library = createTestShipFurniture();
    const ship = createShip(library, 8);
    try {
      expect(() => assignShipItems(
        createScavengeItemInstances(),
        ship.itemSurfaces,
        mulberry32(1),
        ship.colliders,
      )).toThrow(/requires.*placement context/i);
    } finally {
      ship.dispose();
      library.dispose();
    }
  });

  it('uses the complete checked fallback after zero generated attempts', () => {
    const library = createTestShipFurniture();
    const ship = createShip(library, 8);
    const context = placementContext(ship, 0);
    try {
      const instances = createScavengeItemInstances();
      expect(Object.keys(SCAVENGE_FALLBACK_SURFACE_BY_INSTANCE).sort())
        .toEqual(instances.map(({ instanceId }) => instanceId).sort());
      expect(SCAVENGE_FALLBACK_SURFACE_BY_INSTANCE).not.toHaveProperty('energyBar-1');
      expect(Object.isFrozen(SCAVENGE_FALLBACK_SURFACE_BY_INSTANCE)).toBe(true);
      const assignments = assignShipItems(
        instances,
        ship.itemSurfaces,
        mulberry32(4),
        ship.colliders,
        context,
      );
      expect(assignments.size).toBe(21);
      expect([...assignments.values()].every(
        ({ placementSource }) => placementSource === 'fallback',
      )).toBe(true);
      for (const instance of instances) {
        expect(assignments.get(instance.instanceId)?.surfaceId).toBe(
          SCAVENGE_FALLBACK_SURFACE_BY_INSTANCE[
            instance.instanceId as keyof typeof SCAVENGE_FALLBACK_SURFACE_BY_INSTANCE
          ],
        );
      }
      expectProductionConstraints(assignments, context);
    } finally {
      ship.dispose();
      library.dispose();
    }
  });

  it('caps generated placement at sixty-four attempts', () => {
    expect(SCAVENGE_GENERATED_PLACEMENT_ATTEMPTS).toBe(64);
  });

  it('generates without a surface required only by the fallback', () => {
    const library = createTestShipFurniture();
    const ship = createShip(library, 8);
    const context = placementContext(ship, 1);
    const surfaces = ship.itemSurfaces.filter(
      ({ id }) => id !== SCAVENGE_FALLBACK_SURFACE_BY_INSTANCE['ductTape-1'],
    );
    try {
      const assignments = assignShipItems(
        createScavengeItemInstances(),
        surfaces,
        () => 0,
        ship.colliders,
        context,
      );
      expect(assignments.size).toBe(21);
      expect([...assignments.values()].every(
        ({ placementSource }) => placementSource === 'generated',
      )).toBe(true);
    } finally {
      ship.dispose();
      library.dispose();
    }
  });

  it('places production items without blocker overlap', () => {
    const library = createTestShipFurniture();
    const ship = createShip(library, 8);
    const context = placementContext(ship);
    const byId = new Map(ship.itemSurfaces.map((candidate) => [candidate.id, candidate]));
    try {
      const instances = createScavengeItemInstances();
      const assignments = assignShipItems(
        instances,
        ship.itemSurfaces,
        mulberry32(421),
        ship.colliders,
        context,
      );
      expect(assignments.size).toBe(21);
      expect(new Set([...assignments.values()].map(({ physicalSlotId }) => physicalSlotId)).size)
        .toBe(21);
      expectProductionConstraints(assignments, context);
      for (const instance of instances) {
        const assignment = assignments.get(instance.instanceId)!;
        const assignedSurface = byId.get(assignment.surfaceId)!;
        expect(assignment).toMatchObject({
          regionId: assignedSurface.regionId,
          branch: assignedSurface.branch,
        });
        expect(assignment.standingPoint).toBeInstanceOf(Vector3);
        const worldBounds = shipItemTransformBounds(instance.type, assignment);
        ship.colliders.forEach((collider) => {
          const owned = collider as typeof collider & { furnitureId?: string };
          if (owned.furnitureId === assignment.furnitureId) return;
          const blocker = new Box3(
            new Vector3(collider.minX, collider.minY, collider.minZ),
            new Vector3(collider.maxX, collider.maxY, collider.maxZ),
          );
          expect(worldBounds.intersectsBox(blocker)).toBe(false);
        });
      }
    } finally {
      ship.dispose();
      library.dispose();
    }
  }, 10_000);

  it('accepts one thousand deterministic production seeds below fifteen seconds', () => {
    const library = createTestShipFurniture();
    const ship = createShip(library, 8);
    const context = placementContext(ship);
    const instances = createScavengeItemInstances();
    const started = performance.now();
    try {
      let generatedCount = 0;
      const surfacesByType = new Map<string, Set<string>>();
      const surfacesByRegion = new Map<string, Set<string>>();
      const signatures = new Set<string>();
      const signaturesBySeed: string[] = [];
      for (let seed = 0; seed < 1_000; seed += 1) {
        const assignments = assignShipItems(
          instances,
          ship.itemSurfaces,
          mulberry32(seed),
          ship.colliders,
          context,
        );
        expect(assignments.size).toBe(21);
        if ([...assignments.values()].every(
          ({ placementSource }) => placementSource === 'generated',
        )) {
          generatedCount += 1;
        }
        const signature = instances.map(({ instanceId }) => (
          `${instanceId}:${assignments.get(instanceId)!.surfaceId}`
        )).sort().join('|');
        signatures.add(signature);
        signaturesBySeed.push(signature);
        const changedFromFallback = instances.filter(({ instanceId }) => (
          assignments.get(instanceId)!.surfaceId
          !== SCAVENGE_FALLBACK_SURFACE_BY_INSTANCE[
            instanceId as keyof typeof SCAVENGE_FALLBACK_SURFACE_BY_INSTANCE
          ]
        )).length;
        expect(changedFromFallback).toBeGreaterThanOrEqual(5);
        for (const instance of instances) {
          const value = assignments.get(instance.instanceId)!;
          const typeSurfaces = surfacesByType.get(instance.type) ?? new Set<string>();
          typeSurfaces.add(value.surfaceId);
          surfacesByType.set(instance.type, typeSurfaces);
          const regionSurfaces = surfacesByRegion.get(value.regionId) ?? new Set<string>();
          regionSurfaces.add(value.surfaceId);
          surfacesByRegion.set(value.regionId, regionSurfaces);
        }
        expectProductionConstraints(assignments, context);
        const routeInput = {
          assignments: instances.map((instance) => {
            const value = assignments.get(instance.instanceId)!;
            return {
              instanceId: instance.instanceId,
              weight: ITEM_DEFINITIONS[instance.type].weight,
              position: [value.standingPoint.x, value.standingPoint.z] as const,
              branch: value.branch,
            };
          }),
          start: context.start,
          deposit: context.deposit,
          evacuation: context.evacuation,
          metric: context.routeMetric,
        };
        const route = planExpertScavengeRoute(routeInput);
        expect(route).not.toBeNull();
        expect(route!.seconds).toBeGreaterThanOrEqual(54);
        expect(route!.seconds).toBeLessThanOrEqual(58);
        const baseline = planBaselineScavengeRoute(routeInput);
        expect(baseline.savedCount).toBeGreaterThanOrEqual(15);
        expect(baseline.savedCount).toBeLessThanOrEqual(17);
      }
      expect(generatedCount).toBe(1_000);
      expect(signatures.size).toBe(12);
      for (let seed = 0; seed < 64; seed += 1) {
        const assignments = assignShipItems(
          instances,
          ship.itemSurfaces,
          mulberry32(seed),
          ship.colliders,
          context,
        );
        const signature = instances.map(({ instanceId }) => (
          `${instanceId}:${assignments.get(instanceId)!.surfaceId}`
        )).sort().join('|');
        expect(signature).toBe(signaturesBySeed[seed]);
      }
      expect(new Set([...surfacesByType.values()].flatMap((values) => [...values])).size)
        .toBeGreaterThanOrEqual(32);
      for (const [itemType, surfaceIds] of surfacesByType) {
        expect(surfaceIds.size, itemType).toBeGreaterThanOrEqual(2);
      }
      for (const [regionId, minimumSurfaceCount] of [
        ['crewCabin', 5],
        ['wheelhouse', 3],
        ['centralCargo', 8],
        ['storageWorkroom', 5],
        ['bow', 4],
        ['stern', 3],
      ] as const) {
        expect(surfacesByRegion.get(regionId)?.size, regionId)
          .toBeGreaterThanOrEqual(minimumSurfaceCount);
      }
      expect(performance.now() - started).toBeLessThan(15_000);
    } finally {
      ship.dispose();
      library.dispose();
    }
  }, 20_000);
});
