import { NodeIO } from '@gltf-transform/core';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Box3, Euler, Matrix4, Vector3 } from 'three';
import { createItemInstances, ITEM_IDS, type ItemId } from '../src/game/ItemState';
import { createShip } from '../src/world/Ship';
import { ITEM_MODEL_SPECS, type ItemModelSpec } from '../src/world/itemModelManifest';
import {
  SHIP_ITEM_PROFILES,
  assignShipItems,
  validateShipItemAnchors,
  type ShipItemAnchor,
} from '../src/world/ShipItemPlacement';

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

async function measuredNormalizedSize(id: ItemId): Promise<Vector3> {
  return (await measuredNormalizedBounds(id)).getSize(new Vector3());
}

function orientedSize(size: Vector3, rotation: Euler): Vector3 {
  const bounds = new Box3();
  for (const x of [-size.x / 2, size.x / 2]) {
    for (const y of [-size.y / 2, size.y / 2]) {
      for (const z of [-size.z / 2, size.z / 2]) {
        bounds.expandByPoint(new Vector3(x, y, z).applyEuler(rotation));
      }
    }
  }
  return bounds.getSize(new Vector3());
}

function transformedBounds(bounds: Box3, rotation: Euler, scale: number, position: Vector3): Box3 {
  const transformed = new Box3();
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        transformed.expandByPoint(
          new Vector3(x, y, z).multiplyScalar(scale).applyEuler(rotation).add(position),
        );
      }
    }
  }
  return transformed;
}

const anchor = (
  id: string,
  categories: ShipItemAnchor['categories'],
  x: number,
  surfaceGroupId = id,
  width = 2.1,
  depth = 2.1,
  clearanceHeight = 1.2,
): ShipItemAnchor => ({
  id,
  categories,
  position: new Vector3(x, 3, 0),
  rotation: new Euler(0, 0, 0),
  scale: 1,
  surface: 'workbench',
  surfaceGroupId,
  footprint: { width, depth },
  clearanceHeight,
  emergency: false,
});

describe('ship item placement', () => {
  it('places all fourteen standard instances once on compatible anchors', () => {
    const categories = ['foodWater', 'medicalEmergency', 'toolsRepair', 'fishingDiving'] as const;
    const anchors = Array.from({ length: 28 }, (_, index) =>
      anchor(`anchor-${index}`, [categories[index % categories.length]!], index * 2));
    const assignments = assignShipItems(createItemInstances(), anchors, () => 0.4);
    expect(assignments.size).toBe(14);
    expect(new Set([...assignments.values()].map((value) => value.anchorId)).size).toBe(14);
    assignments.forEach((value) => expect(value.usedEmergencyAnchor).toBe(false));
  });

  it('assigns every standard instance to an anchor with its profile category', () => {
    const instances = createItemInstances();
    const categories = ['foodWater', 'medicalEmergency', 'toolsRepair', 'fishingDiving'] as const;
    const anchors = Array.from({ length: 28 }, (_, index) =>
      anchor(`category-anchor-${index}`, [categories[index % categories.length]!], index * 2));
    const anchorsById = new Map(anchors.map((value) => [value.id, value]));
    const assignments = assignShipItems(instances, anchors, () => 0.4);

    instances.forEach((instance) => {
      const assignedAnchor = anchorsById.get(assignments.get(instance.instanceId)!.anchorId)!;
      expect(assignedAnchor.categories).toContain(SHIP_ITEM_PROFILES[instance.type].category);
    });
  });

  it('uses the injected random stream to choose among compatible anchors', () => {
    const flareGun = createItemInstances().filter(({ type }) => type === 'flareGun');
    const anchors = [
      anchor('flare-left', ['medicalEmergency'], 0),
      anchor('flare-right', ['medicalEmergency'], 4),
    ];

    expect(assignShipItems(flareGun, anchors, () => 0).get('flareGun-1')!.anchorId)
      .toBe('flare-right');
    expect(assignShipItems(flareGun, anchors, () => 0.99).get('flareGun-1')!.anchorId)
      .toBe('flare-left');
  });

  it('backtracks when the first compatible choice blocks a later instance', () => {
    const instances = createItemInstances().filter(
      ({ type }) => type === 'medicalKit' || type === 'scubaSet',
    );
    const anchors = [
      anchor('shared', ['medicalEmergency', 'fishingDiving'], 0),
      anchor('diving-only', ['fishingDiving'], 4),
    ];
    const assignments = assignShipItems(instances, anchors, () => 0.99);

    expect(assignments.get('scubaSet-1')!.anchorId).toBe('diving-only');
    expect(assignments.get('medicalKit-1')!.anchorId).toBe('shared');
  });

  it('rejects duplicate ids and overlapping sibling anchors', () => {
    expect(() => validateShipItemAnchors([
      anchor('duplicate', ['toolsRepair'], 0),
      anchor('duplicate', ['toolsRepair'], 3),
    ])).toThrow('Duplicate ship item anchor id: duplicate');
    expect(() => validateShipItemAnchors([
      anchor('left', ['toolsRepair'], 0, 'desk'),
      anchor('right', ['toolsRepair'], 0.2, 'desk'),
    ])).toThrow('Overlapping ship item anchors: left, right');
  });

  it('uses a reachable emergency anchor only when regular capacity is exhausted', () => {
    const instances = createItemInstances().filter(({ type }) => type === 'cannedFood');
    const anchors = [
      anchor('food-regular', ['foodWater'], 0),
      { ...anchor('food-emergency-1', ['foodWater'], 4), emergency: true },
      { ...anchor('food-emergency-2', ['foodWater'], 8), emergency: true },
    ];
    const assignments = assignShipItems(instances, anchors, () => 0.2);
    expect([...assignments.values()].filter((value) => value.usedEmergencyAnchor)).toHaveLength(2);
  });

  it('fails with the item id when no compatible anchor can fit it', () => {
    const scuba = createItemInstances().filter(({ type }) => type === 'scubaSet');
    expect(() => assignShipItems(scuba, [
      anchor('tiny-rack', ['fishingDiving'], 0, 'tiny', 0.2, 0.2, 0.2),
    ], () => 0.5)).toThrow('Unable to place ship item: scubaSet-1');
  });

  it('conservatively profiles the post-normalization bounds of every actual GLB', async () => {
    for (const id of ITEM_IDS) {
      const actual = await measuredNormalizedSize(id);
      const profile = SHIP_ITEM_PROFILES[id];
      expect(profile.width, `${id} width`).toBeGreaterThanOrEqual(actual.x - 1e-6);
      expect(profile.height, `${id} height`).toBeGreaterThanOrEqual(actual.y - 1e-6);
      expect(profile.depth, `${id} depth`).toBeGreaterThanOrEqual(actual.z - 1e-6);
    }
  });

  it('fits every assigned actual model in its authored anchor orientation', async () => {
    const ship = createShip();
    try {
      const anchorsById = new Map(ship.itemAnchors.map((value) => [value.id, value]));
      const assignments = assignShipItems(createItemInstances(), ship.itemAnchors, () => 0.4);
      for (const instance of createItemInstances()) {
        const anchor = anchorsById.get(assignments.get(instance.instanceId)!.anchorId)!;
        const actual = orientedSize(await measuredNormalizedSize(instance.type), anchor.rotation);
        expect(anchor.footprint.width, `${instance.type} at ${anchor.id} width`)
          .toBeGreaterThanOrEqual(actual.x - 1e-6);
        expect(anchor.footprint.depth, `${instance.type} at ${anchor.id} depth`)
          .toBeGreaterThanOrEqual(actual.z - 1e-6);
        expect(anchor.clearanceHeight, `${instance.type} at ${anchor.id} height`)
          .toBeGreaterThanOrEqual(actual.y - 1e-6);
      }
    } finally {
      ship.dispose();
    }
  });

  it('records conservative normalized minima and maxima around each manifest offset', async () => {
    for (const id of ITEM_IDS) {
      const actual = await measuredNormalizedBounds(id);
      const spec = ITEM_MODEL_SPECS[id] as ItemModelSpec & {
        normalizedBounds?: {
          min: readonly [number, number, number];
          max: readonly [number, number, number];
        };
      };
      const actualCenter = actual.getCenter(new Vector3());
      spec.offset.forEach((value, axis) =>
        expect(actualCenter.getComponent(axis), `${id} measured center axis ${axis}`)
          .toBeCloseTo(value, 8));
      expect(spec.normalizedBounds, `${id} recorded bounds`).toBeDefined();
      const recorded = new Box3(
        new Vector3(...spec.normalizedBounds!.min),
        new Vector3(...spec.normalizedBounds!.max),
      );
      expect(recorded.containsBox(actual), id).toBe(true);
      const recordedCenter = recorded.getCenter(new Vector3());
      spec.offset.forEach((value, axis) =>
        expect(recordedCenter.getComponent(axis), `${id} recorded center axis ${axis}`)
          .toBeCloseTo(value, 8));
    }
  });

  it('raises every assigned actual model to rest on its support without exceeding clearance', async () => {
    const ship = createShip();
    try {
      const instances = createItemInstances();
      const anchorsById = new Map(ship.itemAnchors.map((value) => [value.id, value]));
      const assignments = assignShipItems(instances, ship.itemAnchors, () => 0.4);
      for (const instance of instances) {
        const assignment = assignments.get(instance.instanceId)!;
        const anchor = anchorsById.get(assignment.anchorId)!;
        const placed = transformedBounds(
          await measuredNormalizedBounds(instance.type),
          assignment.rotation,
          assignment.scale,
          assignment.position,
        );
        expect(placed.min.y, `${instance.instanceId} bottom`).toBeCloseTo(anchor.position.y, 6);
        expect(placed.min.y, `${instance.instanceId} penetration`)
          .toBeGreaterThanOrEqual(anchor.position.y - 1e-6);
        expect(placed.max.y, `${instance.instanceId} clearance`)
          .toBeLessThanOrEqual(anchor.position.y + anchor.clearanceHeight + 1e-6);
        expect(placed.min.x, `${instance.instanceId} min x`)
          .toBeGreaterThanOrEqual(anchor.position.x - anchor.footprint.width / 2 - 1e-6);
        expect(placed.max.x, `${instance.instanceId} max x`)
          .toBeLessThanOrEqual(anchor.position.x + anchor.footprint.width / 2 + 1e-6);
        expect(placed.min.z, `${instance.instanceId} min z`)
          .toBeGreaterThanOrEqual(anchor.position.z - anchor.footprint.depth / 2 - 1e-6);
        expect(placed.max.z, `${instance.instanceId} max z`)
          .toBeLessThanOrEqual(anchor.position.z + anchor.footprint.depth / 2 + 1e-6);
      }
    } finally {
      ship.dispose();
    }
  });
});
