import { Box2, Box3, type Object3D, Vector2 } from 'three';

const BOAT_STORAGE_CLEARANCE = 0.05;

export function measureBoatStorageEnvelope(
  root: Object3D,
  clearance = BOAT_STORAGE_CLEARANCE,
): Box2 {
  root.updateWorldMatrix(true, true);
  const bounds = new Box3().setFromObject(root);
  if (bounds.isEmpty()) throw new Error(`Cannot measure empty boat prop ${root.name}`);
  return new Box2(
    new Vector2(bounds.min.x - clearance, bounds.min.z - clearance),
    new Vector2(bounds.max.x + clearance, bounds.max.z + clearance),
  );
}

export function boatStorageEnvelopesOverlap(first: Box2, second: Box2): boolean {
  return first.intersectsBox(second);
}
