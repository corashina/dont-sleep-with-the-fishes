// Importance: 8/10 (scaled from 4/5). Protects valid randomized item placement.
import { Box3, Euler, Mesh, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  ITEM_DEFINITIONS,
  createItemInstances,
} from '../src/game/ItemState';
import { createScavengeItemInstances } from '../src/game/scavengeCatalog';
import { createShip } from '../src/world/Ship';
import {
  MAX_HEAVY_ITEM_DEPOSIT_DISTANCE,
  SHIP_ITEM_PROFILES,
  assignShipItems,
  shipItemTransformBounds,
  validateShipItemSurfaces,
  type ShipItemSurface,
  type ShipPlacementContext,
} from '../src/world/ShipItemPlacement';
import {
  createShipRouteMetric,
} from '../src/world/ShipNavigation';
import { SHIP_LAYOUT } from '../src/world/shipLayoutData';
import { FREIGHTER_DIMENSIONS } from '../src/world/ShipLayoutTypes';
import { createTestShipFurniture } from './helpers/shipFurniture';
import { loadProductionPropModels } from './helpers/productionPropModels';

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

function placementContext(ship: ReturnType<typeof createShip>): ShipPlacementContext {
  const station = SHIP_LAYOUT.zones.find(({ id }) => id === 'lifeboatStation')!;
  return {
    routeMetric: createShipRouteMetric(SHIP_LAYOUT),
    deposit: [
      (station.bounds.minX + station.bounds.maxX) / 2,
      (station.bounds.minZ + station.bounds.maxZ) / 2,
    ],
  };
}

describe('ship item placement', () => {
  it('rests the complete scavenging umbrella diagonally across its surface', () => {
    const umbrella = createScavengeItemInstances().find(
      ({ instanceId }) => instanceId === 'umbrella-1',
    )!;
    const restingSurface = surface('umbrella-rest', 0);
    const transform = assignShipItems([umbrella], [restingSurface])
      .get(umbrella.instanceId)!;
    const bounds = shipItemTransformBounds(umbrella.type, transform);

    expect(transform.rotation.x).toBeCloseTo(0);
    expect(transform.rotation.y).toBeCloseTo(-Math.PI / 4);
    expect(transform.rotation.z).toBeCloseTo(-42.7 * Math.PI / 180);
    expect(bounds.min.y).toBeCloseTo(restingSurface.position.y);
  });

  it('uses the same floor pose for every umbrella surface orientation', () => {
    const umbrella = createScavengeItemInstances().find(
      ({ instanceId }) => instanceId === 'umbrella-1',
    )!;
    const rotations = [
      new Euler(0, 0, 0),
      new Euler(0, Math.PI / 2, 0),
      new Euler(Math.PI / 2, -Math.PI / 2, 0),
    ];

    rotations.forEach((surfaceRotation, index) => {
      const restingSurface = surface(`umbrella-rest-${index}`, 0, {
        rotation: surfaceRotation,
      });
      const transform = assignShipItems([umbrella], [restingSurface])
        .get(umbrella.instanceId)!;
      const bounds = shipItemTransformBounds(umbrella.type, transform);

      expect(transform.rotation.x).toBeCloseTo(0);
      expect(transform.rotation.y).toBeCloseTo(surfaceRotation.y - Math.PI / 4);
      expect(transform.rotation.z).toBeCloseTo(-42.7 * Math.PI / 180);
      expect(bounds.min.y).toBeCloseTo(restingSurface.position.y);
    });
  });

  it('rests the loaded umbrella mesh on its scavenging surface', async () => {
    const umbrella = createScavengeItemInstances().find(
      ({ instanceId }) => instanceId === 'umbrella-1',
    )!;
    const restingSurface = surface('loaded-umbrella-rest', 0);
    const transform = assignShipItems([umbrella], [restingSurface])
      .get(umbrella.instanceId)!;
    const models = await loadProductionPropModels();
    try {
      const prop = models.create(umbrella);
      prop.position.copy(transform.position);
      prop.rotation.copy(transform.rotation);
      prop.scale.setScalar(transform.scale);
      prop.updateMatrixWorld(true);
      const inversePropMatrix = prop.matrixWorld.clone().invert();
      let canopyFloorY = Number.POSITIVE_INFINITY;
      let handleFloorY = Number.POSITIVE_INFINITY;
      prop.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        const positions = object.geometry.getAttribute('position');
        for (let index = 0; index < positions.count; index += 1) {
          const worldPoint = new Vector3()
            .fromBufferAttribute(positions, index)
            .applyMatrix4(object.matrixWorld);
          const itemPoint = worldPoint.clone().applyMatrix4(inversePropMatrix);
          if (itemPoint.x < 0.05) canopyFloorY = Math.min(canopyFloorY, worldPoint.y);
          if (itemPoint.x > 0.15) handleFloorY = Math.min(handleFloorY, worldPoint.y);
        }
      });

      expect(canopyFloorY).toBeCloseTo(restingSurface.position.y, 2);
      expect(handleFloorY).toBeCloseTo(restingSurface.position.y, 2);
    } finally {
      models.dispose();
    }
  });

  it('rests the scavenging anchor flat on its surface', () => {
    const anchor = createScavengeItemInstances().find(
      ({ instanceId }) => instanceId === 'anchor-1',
    )!;
    const restingSurface = surface('anchor-rest', 0);
    const transform = assignShipItems([anchor], [restingSurface])
      .get(anchor.instanceId)!;
    const bounds = shipItemTransformBounds(anchor.type, transform);
    const size = bounds.getSize(new Vector3());

    expect(transform.rotation.x).toBeCloseTo(Math.PI / 2);
    expect(bounds.min.y).toBeCloseTo(restingSurface.position.y);
    expect(size.y).toBeLessThan(size.x);
    expect(size.y).toBeLessThan(size.z);
  });

  it('rests the scavenging duct tape flat on its surface', () => {
    const ductTape = createScavengeItemInstances().find(
      ({ instanceId }) => instanceId === 'ductTape-1',
    )!;
    const restingSurface = surface('duct-tape-rest', 0);
    const transform = assignShipItems([ductTape], [restingSurface])
      .get(ductTape.instanceId)!;
    const bounds = shipItemTransformBounds(ductTape.type, transform);
    const size = bounds.getSize(new Vector3());

    expect(transform.rotation.x).toBeCloseTo(Math.PI / 2);
    expect(bounds.min.y).toBeCloseTo(restingSurface.position.y);
    expect(size.y).toBeLessThan(size.x);
    expect(size.y).toBeLessThan(size.z);
  });

  it('rests the scavenging compass face-up on its surface', () => {
    const compass = createScavengeItemInstances().find(
      ({ instanceId }) => instanceId === 'compass-1',
    )!;
    const restingSurface = surface('compass-rest', 0);
    const transform = assignShipItems([compass], [restingSurface])
      .get(compass.instanceId)!;
    const bounds = shipItemTransformBounds(compass.type, transform);
    const size = bounds.getSize(new Vector3());
    const faceNormal = new Vector3(0, 0, 1).applyEuler(transform.rotation);

    expect(bounds.min.y).toBeCloseTo(restingSurface.position.y);
    expect(size.y).toBeLessThan(size.x);
    expect(size.y).toBeLessThan(size.z);
    expect(faceNormal.y).toBeGreaterThan(0.99);
  });

  it('faces Carlitos toward the ship center during scavenging', () => {
    const captain = createScavengeItemInstances().find(
      ({ instanceId }) => instanceId === 'carlitos-1',
    )!;
    const restingSurface = surface('captain-rest', -4, {
      position: new Vector3(-4, 3, -3),
    });
    const transform = assignShipItems([captain], [restingSurface])
      .get(captain.instanceId)!;
    const forward = new Vector3(0, 0, -1).applyEuler(transform.rotation).normalize();
    const towardCenter = transform.position.clone().setY(0).negate().normalize();

    expect(forward.dot(towardCenter)).toBeCloseTo(1);
  });

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

  it('uses every lower cabin bunk as a visible placement', () => {
    const library = createTestShipFurniture();
    const ship = createShip(library, 8);
    try {
      const bunkSurfaces = ship.itemSurfaces.filter(
        ({ furnitureModelId }) => furnitureModelId === 'bedBunk',
      );
      expect(bunkSurfaces).toHaveLength(5);
      bunkSurfaces.forEach(({ position }) => {
        expect(position.y).toBeCloseTo(FREIGHTER_DIMENSIONS.deckY + 0.49);
      });
    } finally {
      ship.dispose();
      library.dispose();
    }
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

  it('places heavy items close and outside the two far rooms', () => {
    const library = createTestShipFurniture();
    const ship = createShip(library, 8);
    const context = placementContext(ship);
    try {
      for (let seed = 0; seed < 64; seed += 1) {
        const instances = createScavengeItemInstances();
        const assignments = assignShipItems(
          instances,
          ship.itemSurfaces,
          mulberry32(seed),
          ship.colliders,
          context,
        );
        for (const instance of instances) {
          if (ITEM_DEFINITIONS[instance.type].weight !== 3) continue;
          const assignment = assignments.get(instance.instanceId)!;
          const distance = context.routeMetric.distance(
            [assignment.standingPoint.x, assignment.standingPoint.z],
            context.deposit,
          );
          expect(distance).not.toBeNull();
          expect(distance!).toBeLessThanOrEqual(MAX_HEAVY_ITEM_DEPOSIT_DISTANCE);
          expect(['storageWorkroom', 'crewCabin']).not.toContain(assignment.regionId);
        }
      }
    } finally {
      ship.dispose();
      library.dispose();
    }
  });

  it('keeps medium items unrestricted by the heavy route limit', () => {
    const medicalKit = createItemInstances()
      .filter(({ type }) => type === 'medicalKit')
      .slice(0, 1);
    const context: ShipPlacementContext = {
      routeMetric: { distance: () => MAX_HEAVY_ITEM_DEPOSIT_DISTANCE + 10 },
      deposit: [0, 0],
    };
    expect(assignShipItems(
      medicalKit,
      [surface('far-medical-kit', 0)],
      mulberry32(1),
      [],
      context,
    ).get('medicalKit-1')?.surfaceId).toBe('far-medical-kit');
  });

  it('keeps one seed deterministic', () => {
    const library = createTestShipFurniture();
    const ship = createShip(library, 8);
    const instances = createScavengeItemInstances();
    const context = placementContext(ship);
    try {
      const first = assignShipItems(
        instances,
        ship.itemSurfaces,
        mulberry32(7),
        ship.colliders,
        context,
      );
      const second = assignShipItems(
        instances,
        ship.itemSurfaces,
        mulberry32(7),
        ship.colliders,
        context,
      );
      expect([...second].map(([id, value]) => [id, value.surfaceId]))
        .toEqual([...first].map(([id, value]) => [id, value.surfaceId]));
    } finally {
      ship.dispose();
      library.dispose();
    }
  });

  it('places production items without blocker overlap or slot reuse', () => {
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
      expect([...assignments.values()].every(
        ({ placementSource }) => placementSource === 'random',
      )).toBe(true);
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

  it('randomizes all other items across predefined placements', () => {
    const library = createTestShipFurniture();
    const ship = createShip(library, 8);
    const context = placementContext(ship);
    const instances = createScavengeItemInstances();
    try {
      const surfacesByInstance = new Map<string, Set<string>>();
      const signatures = new Set<string>();
      for (let seed = 0; seed < 128; seed += 1) {
        const assignments = assignShipItems(
          instances,
          ship.itemSurfaces,
          mulberry32(seed),
          ship.colliders,
          context,
        );
        expect(assignments.size).toBe(21);
        const signature = instances.map(({ instanceId }) => (
          `${instanceId}:${assignments.get(instanceId)!.surfaceId}`
        )).sort().join('|');
        signatures.add(signature);
        for (const instance of instances) {
          const value = assignments.get(instance.instanceId)!;
          const itemSurfaces = surfacesByInstance.get(instance.instanceId) ?? new Set<string>();
          itemSurfaces.add(value.surfaceId);
          surfacesByInstance.set(instance.instanceId, itemSurfaces);
        }
      }
      expect(signatures.size).toBe(128);
      for (const instance of instances) {
        if (ITEM_DEFINITIONS[instance.type].weight === 3) continue;
        expect(surfacesByInstance.get(instance.instanceId)?.size, instance.instanceId)
          .toBeGreaterThanOrEqual(2);
      }
    } finally {
      ship.dispose();
      library.dispose();
    }
  }, 10_000);
});
