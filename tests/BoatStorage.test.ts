import { Box3, Mesh, type Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import {
  ITEM_DEFINITIONS,
  ITEM_IDS,
  createItemInstances,
  type ItemId,
  type ItemInstance,
} from '../src/game/ItemState';
import { boatStorageTransform } from '../src/world/BoatStorage';
import { createLifeboat, lifeboatHullHalfWidthAt } from '../src/world/Lifeboat';
import {
  boatStorageEnvelopesOverlap,
  measureBoatStorageEnvelope,
} from './helpers/boatStorage';
import {
  PRODUCTION_NORMALIZED_PROP_BOUNDS,
  loadProductionPropModels,
} from './helpers/productionPropModels';
import { createTestLifeboatAssets } from './helpers/lifeboatAssets';
import {
  BOAT_SUPPLY_GROUP_IDS,
  boatSupplyCopyOffsets,
  boatSupplyGroupTransform,
} from '../src/world/BoatSupplyLayout';

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
});
