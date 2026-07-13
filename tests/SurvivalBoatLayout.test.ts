import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import {
  ITEM_DEFINITIONS,
  createItemInstances,
  type ItemId,
  type ItemInstance,
} from '../src/game/ItemState';
import {
  SURVIVAL_STORAGE_CLEARANCE,
  measureSurvivalStorageEnvelope,
  storageEnvelopesOverlap,
  survivalBoatStorageTransform,
} from '../src/survival/SurvivalBoatLayout';

const REPRESENTATIVE_SIZE: Readonly<Record<ItemId, readonly [number, number, number]>> = {
  flareGun: [0.62, 0.24, 0.34],
  ductTape: [0.54, 0.24, 0.28],
  fishingRod: [0.12, 0.16, 1.80],
  baitTin: [0.50, 0.25, 0.36],
  medicalKit: [0.66, 0.42, 0.48],
  waterJug: [0.52, 0.78, 0.52],
  cannedFood: [0.34, 0.42, 0.34],
  flashlight: [0.24, 0.26, 0.68],
  scubaSet: [0.92, 0.70, 0.62],
};

function representativeProp(instance: ItemInstance): Group {
  const root = new Group();
  const [width, height, depth] = REPRESENTATIVE_SIZE[instance.type];
  root.add(new Mesh(
    new BoxGeometry(width, height, depth),
    new MeshBasicMaterial(),
  ));
  const transform = survivalBoatStorageTransform(instance);
  root.position.copy(transform.position);
  root.rotation.copy(transform.rotation);
  root.scale.setScalar(transform.scale);
  return root;
}

describe('survival boat item layout', () => {
  it('defines exactly one stable transform per possible item instance', () => {
    const instances = createItemInstances();
    expect(instances).toHaveLength(14);
    for (const instance of instances) {
      const first = survivalBoatStorageTransform(instance);
      const second = survivalBoatStorageTransform(instance);
      expect(second.position.toArray()).toEqual(first.position.toArray());
      expect(second.rotation.toArray()).toEqual(first.rotation.toArray());
      expect(second.scale).toBe(first.scale);
    }
    for (const [type, definition] of Object.entries(ITEM_DEFINITIONS)) {
      expect(instances.filter((instance) => instance.type === type)).toHaveLength(
        definition.spawnCount,
      );
    }
  });

  it('keeps duplicate transforms distinct and independent of missing siblings', () => {
    const first = survivalBoatStorageTransform({ instanceId: 'cannedFood-1', type: 'cannedFood' });
    const third = survivalBoatStorageTransform({ instanceId: 'cannedFood-3', type: 'cannedFood' });
    expect(first.position.equals(third.position)).toBe(false);
    expect(survivalBoatStorageTransform({
      instanceId: 'cannedFood-3',
      type: 'cannedFood',
    }).position.toArray()).toEqual(third.position.toArray());
  });

  it('rejects malformed or out-of-range instance IDs', () => {
    expect(() => survivalBoatStorageTransform({
      instanceId: 'ductTape-3',
      type: 'ductTape',
    })).toThrow('No survival boat slot for ductTape-3');
  });

  it('keeps measured maximum-inventory envelopes separated', () => {
    expect(SURVIVAL_STORAGE_CLEARANCE).toBe(0.05);
    const roots = createItemInstances().map(representativeProp);
    const envelopes = roots.map((root) => measureSurvivalStorageEnvelope(root));
    for (let first = 0; first < envelopes.length; first += 1) {
      for (let second = first + 1; second < envelopes.length; second += 1) {
        expect(
          storageEnvelopesOverlap(envelopes[first]!, envelopes[second]!),
          `${createItemInstances()[first]!.instanceId} overlaps ${createItemInstances()[second]!.instanceId}`,
        ).toBe(false);
      }
    }
    roots.forEach((root) => {
      root.traverse((object) => {
        if (object instanceof Mesh) {
          object.geometry.dispose();
          object.material.dispose();
        }
      });
    });
  });

  it('leaves the central longitudinal floor clear outside the bow zone', () => {
    for (const instance of createItemInstances()) {
      const { position } = survivalBoatStorageTransform(instance);
      if (position.z > -2.05 && instance.type !== 'fishingRod') {
        expect(Math.abs(position.x), instance.instanceId).toBeGreaterThanOrEqual(0.58);
      }
    }
  });
});
