import { Group, Mesh, MeshStandardMaterial, type Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import type { ItemInstance, ItemInstanceId } from '../src/game/ItemState';
import { BoatSupplyDisplay } from '../src/survival/BoatSupplyDisplay';
import { SurvivalInventoryState } from '../src/survival/inventory';
import type { SurvivalSnapshot } from '../src/survival/survivalTypes';
import { createTestPropModels } from './helpers/propModels';

function snapshot(
  savedItems: readonly ItemInstance[],
  inventory = new SurvivalInventoryState(savedItems),
): SurvivalSnapshot {
  return {
    state: 'day',
    endingReason: 'standard',
    day: 1,
    pressure: 0,
    health: 100,
    hunger: 20,
    energy: 80,
    hull: 80,
    food: 0,
    bait: 0,
    recoveredFood: 0,
    recoveredBait: 0,
    repairMaterial: 0,
    rescueProgress: 0,
    chest: { state: 'none', acquiredDay: null },
    eventFlags: [],
    weather: 'calm',
    actedToday: false,
    journalEntries: [],
    inventory: inventory.snapshot(),
    savedItems,
    captainWhiskers: null,
    pendingEventId: null,
    pendingEventTargetId: null,
    pendingDriftingLootVariant: null,
    lastOutcome: null,
    seed: 1,
  };
}

function firstMesh(root: Object3D): Mesh {
  let result: Mesh | null = null;
  root.traverse((object) => {
    if (result === null && object instanceof Mesh) result = object;
  });
  if (result === null) throw new Error('Expected a mesh.');
  return result;
}

describe('BoatSupplyDisplay', () => {
  it('finds an item type from an instance id', () => {
    const propModels = createTestPropModels();
    const display = new BoatSupplyDisplay(propModels, new Group(), []);

    try {
      expect(display.itemType('flashlight-1' as ItemInstanceId)).toBe('flashlight');
      expect(display.itemType('missing-1' as ItemInstanceId)).toBeNull();
    } finally {
      display.dispose();
      propModels.dispose();
    }
  });

  it('keeps event-stowed copies hidden until dawn and restores their latest conditions', () => {
    const flashlight = {
      instanceId: 'flashlight-1' as ItemInstanceId,
      type: 'flashlight' as const,
    };
    const map = {
      instanceId: 'map-1' as ItemInstanceId,
      type: 'map' as const,
    };
    const bucket = {
      instanceId: 'bucket-1' as ItemInstanceId,
      type: 'bucket' as const,
    };
    const savedItems = [flashlight, map, bucket];
    const propModels = createTestPropModels();
    const parent = new Group();
    const display = new BoatSupplyDisplay(propModels, parent, savedItems);

    try {
      const nightSnapshot = snapshot(savedItems);
      display.sync(nightSnapshot);
      const normalMapMaterial = firstMesh(
        parent.getObjectByName('boat-supply:map:copy-1')!,
      ).material as MeshStandardMaterial;
      const actor = display.borrowEventActor(flashlight.instanceId);
      expect(actor).not.toBeNull();

      display.stowEventItemUntilDay(flashlight.instanceId);
      display.stowEventItemUntilDay(map.instanceId);
      display.stowEventItemUntilDay(bucket.instanceId);
      actor!.release();
      display.clearEventMotion();
      display.sync(nightSnapshot);

      expect(parent.getObjectByName('boat-supply:flashlight')?.visible).toBe(false);

      const dayInventory = new SurvivalInventoryState(savedItems);
      expect(dayInventory.break(map.instanceId)).toBe(true);
      expect(dayInventory.lose(bucket.instanceId)).toBe(true);
      const daySnapshot = snapshot(savedItems, dayInventory);
      display.releaseDayStowedItems();
      display.sync(daySnapshot);

      const mapCopy = parent.getObjectByName('boat-supply:map:copy-1')!;
      const brokenMapMaterial = firstMesh(mapCopy).material as MeshStandardMaterial;
      expect(parent.getObjectByName('boat-supply:flashlight')?.visible).toBe(true);
      expect(mapCopy.visible).toBe(true);
      expect(brokenMapMaterial).not.toBe(normalMapMaterial);
      expect(brokenMapMaterial.roughness).toBeGreaterThanOrEqual(0.82);
      expect(parent.getObjectByName('boat-supply:bucket')?.visible).toBe(false);

      const visibleBeforeSecondRelease = mapCopy.visible;
      const materialBeforeSecondRelease = firstMesh(mapCopy).material;
      display.releaseDayStowedItems();
      display.sync(daySnapshot);
      expect(mapCopy.visible).toBe(visibleBeforeSecondRelease);
      expect(firstMesh(mapCopy).material).toBe(materialBeforeSecondRelease);
    } finally {
      display.dispose();
      propModels.dispose();
    }
  });
});
