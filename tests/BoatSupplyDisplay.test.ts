import { describe, expect, it } from 'vitest';
import { Group, Quaternion, Vector3 } from 'three';
import type { ItemInstance, ItemInstanceId } from '../src/game/ItemState';
import { BoatSupplyDisplay } from '../src/survival/BoatSupplyDisplay';
import { SurvivalInventoryState } from '../src/survival/inventory';
import type { SurvivalSnapshot } from '../src/survival/survivalTypes';
import { createTestPropModels } from './helpers/propModels';

const savedItems: readonly ItemInstance[] = [
  { instanceId: 'bucket-1', type: 'bucket' },
  { instanceId: 'umbrella-1', type: 'umbrella' },
];

function snapshot(): SurvivalSnapshot {
  return {
    state: 'nightEvent',
    day: 1,
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
    weather: 'calm',
    actedToday: false,
    journalEntries: [],
    inventory: new SurvivalInventoryState(savedItems).snapshot(),
    savedItems,
    pendingEventId: null,
    lastOutcome: null,
    seed: 8,
  };
}

describe('BoatSupplyDisplay event motion', () => {
  it('layers ambient and selected poses over canonical supply transforms', () => {
    const models = createTestPropModels();
    const parent = new Group();
    const display = new BoatSupplyDisplay(models, parent, savedItems);
    display.sync(snapshot());
    const bucket = parent.getObjectByName('boat-supply:bucket')!;
    const umbrella = parent.getObjectByName('boat-supply:umbrella')!;
    const bucketBase = bucket.position.clone();
    const umbrellaBase = umbrella.position.clone();
    const bucketQuaternion = bucket.quaternion.clone();

    display.applyEventAmbientPose(0.2, 0);
    expect(display.applyEventItemPose('bucket-1', {
      x: 0.4, y: 0.6, z: -0.2,
      yaw: 0.1, pitch: -0.2, roll: 0.3,
      scaleX: 1, scaleY: 1, scaleZ: 1,
    })).toBe(true);
    display.update(0);

    expect(bucket.position.y).toBeCloseTo(bucketBase.y + 0.6);
    expect(umbrella.position.y).toBeCloseTo(umbrellaBase.y);
    expect(bucket.position.x).toBeCloseTo(bucketBase.x + 0.4);
    expect(bucket.position.z).toBeCloseTo(bucketBase.z - 0.2);
    expect(bucket.quaternion.toArray()).not.toEqual(bucketQuaternion.toArray());

    expect(display.applyEventItemPose('missing-1' as ItemInstanceId, {
      x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0,
      scaleX: 1, scaleY: 1, scaleZ: 1,
    })).toBe(false);
    display.clearEventMotion();
    expect(bucket.position.toArray()).toEqual(bucketBase.toArray());
    expect(bucket.quaternion.toArray()).toEqual(bucketQuaternion.toArray());
    expect(umbrella.position.toArray()).toEqual(umbrellaBase.toArray());
    display.clearEventMotion();
    expect(bucket.position.toArray()).toEqual(bucketBase.toArray());

    display.dispose();
    models.dispose();
  });

  it('does not mutate the stored ambient base pose', () => {
    const models = createTestPropModels();
    const parent = new Group();
    const display = new BoatSupplyDisplay(models, parent, savedItems);
    display.sync(snapshot());
    const bucket = parent.getObjectByName('boat-supply:bucket')!;
    const basePosition = new Vector3().copy(bucket.position);
    const baseQuaternion = new Quaternion().copy(bucket.quaternion);

    display.applyEventAmbientPose(0.35, 0.2);
    display.update(0);
    display.clearEventMotion();

    expect(bucket.position.toArray()).toEqual(basePosition.toArray());
    expect(bucket.quaternion.toArray()).toEqual(baseQuaternion.toArray());
    display.dispose();
    models.dispose();
  });
});
