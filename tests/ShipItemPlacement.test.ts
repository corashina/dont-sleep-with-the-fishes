import { NodeIO } from '@gltf-transform/core';
import { resolve } from 'node:path';
import { Box3, Euler, Matrix4, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createItemInstances, ITEM_IDS, type ItemId } from '../src/game/ItemState';
import { createShip } from '../src/world/Ship';
import { ITEM_MODEL_SPECS } from '../src/world/itemModelManifest';
import {
  SHIP_ITEM_PROFILES,
  assignShipItems,
  shipItemTransformBounds,
  validateShipItemSurfaces,
  type ShipItemSurface,
} from '../src/world/ShipItemPlacement';
import { createTestShipFurniture } from './helpers/shipFurniture';

function surface(
  id: string,
  categories: ShipItemSurface['categories'],
  x: number,
  options: Partial<ShipItemSurface> = {},
): ShipItemSurface {
  return {
    id,
    physicalSlotId: id,
    furnitureId: `fixture-${id}`,
    furnitureModelId: 'table',
    categories,
    position: new Vector3(x, 3, 0),
    rotation: new Euler(),
    footprint: { width: 2.1, depth: 2.1 },
    clearanceHeight: 1.2,
    standingPoints: [new Vector3(x, 2.22, -1.25)],
    fallback: false,
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

function rotatedNormalizedBounds(id: ItemId, rotation: Euler): Box3 {
  const normalized = ITEM_MODEL_SPECS[id].normalizedBounds;
  const bounds = new Box3();
  for (const x of [normalized.min[0], normalized.max[0]]) {
    for (const y of [normalized.min[1], normalized.max[1]]) {
      for (const z of [normalized.min[2], normalized.max[2]]) {
        bounds.expandByPoint(new Vector3(x, y, z).applyEuler(rotation));
      }
    }
  }
  return bounds;
}

async function measuredNormalizedBounds(id: ItemId): Promise<Box3> {
  const document = await new NodeIO().read(resolve('src', 'assets', 'models', 'items', `${id}.glb`));
  const bounds = new Box3();
  const rotation = new Euler(...ITEM_MODEL_SPECS[id].rotation);
  for (const node of document.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const worldMatrix = new Matrix4().fromArray(node.getWorldMatrix());
    for (const primitive of mesh.listPrimitives()) {
      const positions = primitive.getAttribute('POSITION');
      if (!positions) continue;
      for (let index = 0; index < positions.getCount(); index += 1) {
        bounds.expandByPoint(
          new Vector3(...positions.getElement(index, [])).applyMatrix4(worldMatrix).applyEuler(rotation),
        );
      }
    }
  }
  const size = bounds.getSize(new Vector3());
  const scale = ITEM_MODEL_SPECS[id].targetLongestDimension / Math.max(size.x, size.y, size.z);
  const center = bounds.getCenter(new Vector3()).multiplyScalar(scale);
  const offset = new Vector3(...ITEM_MODEL_SPECS[id].offset);
  return new Box3(
    bounds.min.clone().multiplyScalar(scale).sub(center).add(offset),
    bounds.max.clone().multiplyScalar(scale).sub(center).add(offset),
  );
}

describe('ship item placement', () => {
  it('places all twenty-two Dorothy instances on unique compatible slots', () => {
    const library = createTestShipFurniture();
    const ship = createShip(library, 8);
    try {
      expect(ship.itemSurfaces).toHaveLength(27);
      expect(ship.itemSurfaces.find(({ id }) => id === 'cabin-bookcase-forward:level-1')
        ?.standingPoints.length).toBeGreaterThan(0);
      const assignments = assignShipItems(
        createItemInstances(),
        ship.itemSurfaces,
        mulberry32(421),
        ship.colliders,
      );
      expect(assignments.size).toBe(22);
      expect(new Set([...assignments.values()].map(({ surfaceId }) => surfaceId)).size).toBe(22);
      expect(new Set([...assignments.values()].map(({ physicalSlotId }) => physicalSlotId)).size)
        .toBe(22);
      for (const instance of createItemInstances()) {
        expect(assignments.has(instance.instanceId), instance.instanceId).toBe(true);
      }
    } finally {
      ship.dispose();
      library.dispose();
    }
  });

  it('keeps the four authored item groups in their intended ship zones', () => {
    expect(SHIP_ITEM_PROFILES.cannedFood.category).toBe('provisions');
    expect(SHIP_ITEM_PROFILES.bottledPaper.category).toBe('navigation');
    expect(SHIP_ITEM_PROFILES.medicalKit.category).toBe('workshop');
    expect(SHIP_ITEM_PROFILES.anchor.category).toBe('deckGear');
  });

  it('uses the injected random stream and backtracks for constrained later items', () => {
    const flareGun = createItemInstances().filter(({ type }) => type === 'flareGun');
    const choices = [
      surface('flare-left', ['navigation'], 0),
      surface('flare-right', ['navigation'], 4),
    ];
    expect(assignShipItems(flareGun, choices, () => 0).get('flareGun-1')!.surfaceId)
      .toBe('flare-right');
    expect(assignShipItems(flareGun, choices, () => 0.99).get('flareGun-1')!.surfaceId)
      .toBe('flare-left');

    const constrained = createItemInstances().filter(
      ({ type }) => type === 'medicalKit' || type === 'scubaSet',
    );
    const assignments = assignShipItems(constrained, [
      surface('shared', ['workshop', 'deckGear'], 0),
      surface('diving-only', ['deckGear'], 4),
    ], () => 0.99);
    expect(assignments.get('scubaSet-1')!.surfaceId).toBe('diving-only');
    expect(assignments.get('medicalKit-1')!.surfaceId).toBe('shared');
  });

  it('rejects duplicate ids, missing owners, invalid categories and dimensions', () => {
    expect(() => assignShipItems([], [
      surface('duplicate', ['workshop'], 0),
      surface('duplicate', ['workshop'], 4),
    ])).toThrow(/duplicate ship item surface id: duplicate/i);
    expect(() => assignShipItems([], [surface('ownerless', ['workshop'], 0, {
      furnitureId: '',
    })])).toThrow(/ownerless.*owner/i);
    expect(() => assignShipItems([], [surface('unsupported', ['alien' as never], 0)]))
      .toThrow(/unsupported.*categor/i);
    expect(() => assignShipItems([], [surface('zero-width', ['workshop'], 0, {
      footprint: { width: 0, depth: 1 },
    })])).toThrow(/zero-width.*positive/i);
  });

  it('rejects overlapping sibling footprints except exact regular/fallback aliases', () => {
    expect(() => assignShipItems([], [
      surface('left', ['workshop'], 0, { furnitureId: 'desk' }),
      surface('right', ['workshop'], 0.2, { furnitureId: 'desk' }),
    ])).toThrow(/overlapping ship item surfaces: left, right/i);

    const regular = surface('regular', ['workshop'], 0, {
      furnitureId: 'desk', physicalSlotId: 'desk-top',
    });
    const fallback = surface('fallback', ['navigation'], 0, {
      furnitureId: 'desk', physicalSlotId: 'desk-top', fallback: true,
    });
    expect(() => assignShipItems([], [regular, fallback])).not.toThrow();

    expect(() => assignShipItems([], [
      surface('first-owner', ['workshop'], 0),
      surface('second-owner', ['workshop'], 0.2),
    ])).toThrow(/overlapping ship item surfaces: first-owner, second-owner/i);
  });

  it('requires a real owner and keeps surface clearance away from structure', () => {
    const owned = surface('structural', ['workshop'], 0, {
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
      .toThrow(/structural.*wall clearance.*0\.1/i);

    const foreign = {
      minX: 0.8, maxX: 1.2, minY: 3, maxY: 4, minZ: -0.5, maxZ: 0.5,
      furnitureId: 'foreign-fixture', furnitureModelId: 'desk' as const,
    };
    const furniture = new Map<string, typeof owner | typeof foreign>([
      [owner.furnitureId, owner],
      [foreign.furnitureId, foreign],
    ]);
    expect(() => validateShipItemSurfaces(
      [owned],
      [],
      furniture,
    )).toThrow(/structural.*foreign-fixture/i);
  });

  it('rejects unreachable surfaces and an item that cannot fit rotated bounds', () => {
    expect(() => assignShipItems([], [surface('unreachable', ['workshop'], 0, {
      standingPoints: [],
    })])).toThrow(/unreachable.*standing/i);
    expect(() => assignShipItems([], [surface('too-far', ['workshop'], 0, {
      standingPoints: [new Vector3(10, 2.22, 0)],
    })])).toThrow(/too-far.*reach/i);

    const rod = createItemInstances().filter(({ type }) => type === 'fishingRod');
    expect(() => assignShipItems(rod, [surface('narrow', ['deckGear'], 0, {
      rotation: new Euler(0, Math.PI / 2, 0),
      footprint: { width: 0.5, depth: 0.5 },
    })])).toThrow('Unable to place ship item: fishingRod-1');
  });

  it('uniformly scales a model to fit but rejects scales below three quarters', () => {
    const cannedFood = createItemInstances().filter(({ type }) => type === 'cannedFood').slice(0, 1);
    const fitted = assignShipItems(cannedFood, [surface('shelf', ['provisions'], 0, {
      footprint: { width: 0.3, depth: 0.35 },
      clearanceHeight: 0.42,
    })]).get(cannedFood[0]!.instanceId)!;
    expect(fitted.scale).toBeCloseTo(0.3 / SHIP_ITEM_PROFILES.cannedFood.width);
    expect(fitted.scale).toBeGreaterThanOrEqual(0.75);

    expect(() => assignShipItems(cannedFood, [surface('too-small', ['provisions'], 0, {
      footprint: { width: 0.29, depth: 0.35 },
      clearanceHeight: 0.42,
    })])).toThrow('Unable to place ship item: cannedFood-1');
  });

  it('measures top-shelf reach from camera height while preserving authored foot points', () => {
    const umbrella = createItemInstances().filter(({ type }) => type === 'umbrella').slice(0, 1);
    const topShelf = surface('top-shelf', ['deckGear'], 0, {
      position: new Vector3(0, 4.007, 0),
      footprint: { width: 0.3, depth: 0.35 },
      clearanceHeight: 1,
      standingPoints: [new Vector3(0, 2.22, -0.82)],
    });
    const itemCenterAtFullScale = topShelf.position.clone().add(
      new Vector3(0, SHIP_ITEM_PROFILES.umbrella.height / 2, 0),
    );
    expect(topShelf.standingPoints[0]!.distanceTo(itemCenterAtFullScale)).toBeGreaterThan(2.2);
    const eye = topShelf.standingPoints[0]!.clone().add(new Vector3(0, 1.5, 0));
    expect(eye.distanceTo(itemCenterAtFullScale)).toBeLessThan(2.2);
    expect(assignShipItems(umbrella, [topShelf]).get(umbrella[0]!.instanceId)!.scale).toBe(1);
  });

  it('searches regular surfaces first and appends fallback only after regular failure', () => {
    const food = createItemInstances().filter(({ type }) => type === 'cannedFood');
    const surfaces = [
      surface('regular', ['provisions'], 0),
      surface('fallback-1', ['provisions'], 4, { fallback: true }),
      surface('fallback-2', ['provisions'], 8, { fallback: true }),
    ];
    const assignments = assignShipItems(food, surfaces, () => 0.2);
    expect([...assignments.values()].filter(({ usedFallbackSurface }) => usedFallbackSurface))
      .toHaveLength(2);

    const oneFood = food.slice(0, 1);
    expect(assignShipItems(oneFood, surfaces, () => 0.2).get(oneFood[0]!.instanceId)!
      .usedFallbackSurface).toBe(false);
  });

  it('assigns the production catalog for 64 seeds without wall overlap, beds, chairs, or slot reuse', () => {
    const library = createTestShipFurniture();
    const ship = createShip(library, 8);
    const byId = new Map(ship.itemSurfaces.map((candidate) => [candidate.id, candidate]));
    try {
      for (let seed = 0; seed < 64; seed += 1) {
        const instances = createItemInstances();
        const assignments = assignShipItems(
          instances,
          ship.itemSurfaces,
          mulberry32(seed),
          ship.colliders,
        );
        expect(assignments.size, `seed ${seed}`).toBe(22);
        expect(new Set([...assignments.values()].map(({ surfaceId }) => surfaceId)).size).toBe(22);
        expect(new Set([...assignments.values()].map(({ physicalSlotId }) => physicalSlotId)).size)
          .toBe(22);
        expect([...assignments.values()].every(({ usedFallbackSurface }) => !usedFallbackSurface))
          .toBe(true);
        for (const [instanceId, assignment] of assignments) {
          const assignedSurface = byId.get(assignment.surfaceId)!;
          const instance = createItemInstances().find((candidate) =>
            candidate.instanceId === instanceId)!;
          const bounds = rotatedNormalizedBounds(instance.type, assignment.rotation);
          const size = bounds.getSize(new Vector3()).multiplyScalar(assignment.scale);
          expect(assignedSurface.standingPoints.length).toBeGreaterThan(0);
          expect(assignedSurface.furnitureModelId).not.toMatch(/bedBunk|chairDesk/);
          expect(size.x).toBeLessThanOrEqual(assignedSurface.footprint.width + 1e-6);
          expect(size.z).toBeLessThanOrEqual(assignedSurface.footprint.depth + 1e-6);
          expect(size.y).toBeLessThanOrEqual(assignedSurface.clearanceHeight + 1e-6);
          expect(assignment.position.y + bounds.min.y * assignment.scale)
            .toBeCloseTo(assignedSurface.position.y);
          const worldBounds = shipItemTransformBounds(instance.type, assignment);
          ship.colliders.forEach((collider) => {
            const owned = collider as typeof collider & { furnitureId?: string };
            if (owned.furnitureId === assignment.furnitureId) return;
            const blocker = new Box3(
              new Vector3(collider.minX, collider.minY, collider.minZ),
              new Vector3(collider.maxX, collider.maxY, collider.maxZ),
            );
            const overlap = worldBounds.min.x < blocker.max.x - 1e-6
              && worldBounds.max.x > blocker.min.x + 1e-6
              && worldBounds.min.y < blocker.max.y - 1e-6
              && worldBounds.max.y > blocker.min.y + 1e-6
              && worldBounds.min.z < blocker.max.z - 1e-6
              && worldBounds.max.z > blocker.min.z + 1e-6;
            expect(overlap, `${seed}:${instanceId}:${assignment.surfaceId}`).toBe(false);
          });
        }
        expect(assignments.get('fishingRod-1')!.scale).toBe(1);
      }
      expect(ship.playerNavigationBounds.safe).toEqual({
        minX: -5.9,
        maxX: 5.9,
        minZ: -17.2,
        maxZ: 17.2,
      });
    } finally {
      ship.dispose();
      library.dispose();
    }
  });

  it('records conservative profiles for every actual normalized item model', async () => {
    for (const id of ITEM_IDS) {
      const actual = await measuredNormalizedBounds(id);
      const size = actual.getSize(new Vector3());
      const profile = SHIP_ITEM_PROFILES[id];
      expect(profile.width, `${id} width`).toBeGreaterThanOrEqual(size.x - 1e-6);
      expect(profile.height, `${id} height`).toBeGreaterThanOrEqual(size.y - 1e-6);
      expect(profile.depth, `${id} depth`).toBeGreaterThanOrEqual(size.z - 1e-6);
      expect(new Box3(
        new Vector3(...ITEM_MODEL_SPECS[id].normalizedBounds.min),
        new Vector3(...ITEM_MODEL_SPECS[id].normalizedBounds.max),
      ).containsBox(actual), id).toBe(true);
    }
  });
});
