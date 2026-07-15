import { Box3, Mesh, type Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import {
  ITEM_DEFINITIONS,
  createItemInstances,
  type ItemId,
  type ItemInstance,
} from '../src/game/ItemState';
import { boatStorageTransform } from '../src/world/BoatStorage';
import { createLifeboat } from '../src/world/Lifeboat';
import {
  boatStorageEnvelopesOverlap,
  measureBoatStorageEnvelope,
} from './helpers/boatStorage';
import {
  PRODUCTION_NORMALIZED_PROP_BOUNDS,
  loadProductionPropModels,
} from './helpers/productionPropModels';

function placedProductionProp(
  library: Awaited<ReturnType<typeof loadProductionPropModels>>,
  instance: ItemInstance,
): Object3D {
  const root = library.create(instance);
  const transform = boatStorageTransform(instance);
  root.position.copy(transform.position);
  root.rotation.copy(transform.rotation);
  root.scale.setScalar(transform.scale);
  return root;
}

function disposeOwnedMeshes(root: Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => material.dispose());
  });
}

describe('boat item layout', () => {
  it('keeps the normalized production bounds fixture synchronized with checked-in models', async () => {
    const library = await loadProductionPropModels();
    try {
      for (const type of Object.keys(ITEM_DEFINITIONS) as ItemId[]) {
        const root = library.create({ instanceId: `${type}-1`, type });
        const bounds = new Box3().setFromObject(root);
        const fixture = PRODUCTION_NORMALIZED_PROP_BOUNDS[type];
        bounds.min.toArray().forEach((value, index) => {
          expect(value, `${type} min[${index}]`).toBeCloseTo(fixture.min[index]!, 6);
        });
        bounds.max.toArray().forEach((value, index) => {
          expect(value, `${type} max[${index}]`).toBeCloseTo(fixture.max[index]!, 6);
        });
        disposeOwnedMeshes(root);
      }
    } finally {
      library.dispose();
    }
  });

  it('defines exactly one stable transform per possible item instance', () => {
    const instances = createItemInstances();
    expect(instances).toHaveLength(14);
    for (const instance of instances) {
      const first = boatStorageTransform(instance);
      const second = boatStorageTransform(instance);
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
    const first = boatStorageTransform({ instanceId: 'cannedFood-1', type: 'cannedFood' });
    const third = boatStorageTransform({ instanceId: 'cannedFood-3', type: 'cannedFood' });
    expect(first.position.equals(third.position)).toBe(false);
    expect(boatStorageTransform({
      instanceId: 'cannedFood-3',
      type: 'cannedFood',
    }).position.toArray()).toEqual(third.position.toArray());
  });

  it('rejects malformed or out-of-range instance IDs', () => {
    const invalidInstances: readonly ItemInstance[] = [
      { instanceId: 'ductTape-3', type: 'ductTape' },
      { instanceId: 'cannedFood-1e0', type: 'cannedFood' },
      { instanceId: 'cannedFood-01', type: 'cannedFood' },
      { instanceId: 'cannedFood-1.0', type: 'cannedFood' },
      { instanceId: 'ductTape-1', type: 'cannedFood' },
    ];
    for (const instance of invalidInstances) {
      expect(
        () => boatStorageTransform(instance),
        instance.instanceId,
      ).toThrow(`No boat storage slot for ${instance.instanceId}`);
    }
  });

  it('keeps normalized production-model maximum-inventory envelopes separated', async () => {
    const library = await loadProductionPropModels();
    const instances = createItemInstances();
    const roots = instances.map((instance) => placedProductionProp(library, instance));
    try {
      const envelopes = roots.map((root) => measureBoatStorageEnvelope(root));
      for (let first = 0; first < envelopes.length; first += 1) {
        for (let second = first + 1; second < envelopes.length; second += 1) {
          expect(
            boatStorageEnvelopesOverlap(envelopes[first]!, envelopes[second]!),
            `${instances[first]!.instanceId} overlaps ${instances[second]!.instanceId}`,
          ).toBe(false);
        }
      }
    } finally {
      roots.forEach(disposeOwnedMeshes);
      library.dispose();
    }
  });

  it('keeps the medical kit clear of the damaged repair patch', async () => {
    const library = await loadProductionPropModels();
    const medicalKit = placedProductionProp(
      library,
      { instanceId: 'medicalKit-1', type: 'medicalKit' },
    );
    const lifeboat = createLifeboat();
    const repairPatch = lifeboat.root.getObjectByName('damaged-plank-patch')!;
    try {
      const medicalEnvelope = measureBoatStorageEnvelope(medicalKit);
      const patchEnvelope = measureBoatStorageEnvelope(repairPatch, 0);
      expect(boatStorageEnvelopesOverlap(medicalEnvelope, patchEnvelope)).toBe(false);
    } finally {
      disposeOwnedMeshes(medicalKit);
      library.dispose();
      lifeboat.root.traverse((object) => {
        if (object instanceof Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      lifeboat.textures.forEach((texture) => texture.dispose());
    }
  });

  it('leaves the central longitudinal floor clear outside the bow zone', () => {
    for (const instance of createItemInstances()) {
      const { position } = boatStorageTransform(instance);
      if (position.z > -2.05 && instance.type !== 'fishingRod') {
        expect(Math.abs(position.x), instance.instanceId).toBeGreaterThanOrEqual(0.58);
      }
    }
  });
});
