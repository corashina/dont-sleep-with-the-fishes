import { describe, expect, it } from 'vitest';
import { Euler, Vector3 } from 'three';
import { createItemInstances } from '../src/game/ItemState';
import {
  SHIP_ITEM_PROFILES,
  assignShipItems,
  validateShipItemAnchors,
  type ShipItemAnchor,
} from '../src/world/ShipItemPlacement';

const anchor = (
  id: string,
  categories: ShipItemAnchor['categories'],
  x: number,
  surfaceGroupId = id,
  width = 2.1,
  depth = 1.1,
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
});
