import { Box3, Matrix4, Object3D, Vector3 } from 'three';
import type { ItemId } from '../game/ItemState';
import type { ItemConditionBinding } from './itemConditionAppearance';

/** Bake storage clearance once; condition changes still only swap resources. */
export function fitBrokenItemToStorage(root: Object3D, bindings: readonly ItemConditionBinding[], itemId: ItemId): void {
  if (bindings.length === 0) return;
  if (itemId === 'fishingNet') {
    seatNetFragments(root, bindings);
    return;
  }
  root.updateWorldMatrix(true, true);
  const toStorage = root.parent?.matrixWorld.clone().invert() ?? new Matrix4();
  const usable = new Box3();
  const broken = new Box3();
  const point = new Vector3();
  const transforms = bindings.map(({ mesh, usableGeometry, brokenGeometry }) => {
    const matrix = toStorage.clone().multiply(mesh.matrixWorld);
    for (const [geometry, bounds] of [[usableGeometry, usable], [brokenGeometry, broken]] as const) {
      const positions = geometry.getAttribute('position');
      for (let index = 0; index < positions.count; index += 1) {
        bounds.expandByPoint(point.fromBufferAttribute(positions, index).applyMatrix4(matrix));
      }
    }
    return matrix;
  });
  const originalSize = usable.getSize(new Vector3());
  const damagedSize = broken.getSize(new Vector3());
  const scale = Math.min(1,
    originalSize.x / Math.max(damagedSize.x, 0.0001),
    originalSize.z / Math.max(damagedSize.z, 0.0001),
    Math.max(originalSize.y, 0.06) / Math.max(damagedSize.y, 0.0001));
  const offset = usable.getCenter(new Vector3()).sub(broken.getCenter(new Vector3()).multiplyScalar(scale));
  offset.y = usable.min.y + 0.002 - broken.min.y * scale;
  const fit = new Matrix4().makeTranslation(offset.x, offset.y, offset.z)
    .multiply(new Matrix4().makeScale(scale, scale, scale));
  bindings.forEach(({ brokenGeometry }, index) => {
    const matrix = transforms[index]!;
    brokenGeometry.applyMatrix4(matrix.clone().invert().multiply(fit).multiply(matrix));
    brokenGeometry.computeBoundingBox();
    brokenGeometry.computeBoundingSphere();
  });
  if (itemId === 'map' || itemId === 'spyglass' || itemId === 'anchor' || itemId === 'umbrella' || itemId === 'flashlight') {
    seatFragments(bindings, transforms, usable.min.y + 0.002);
  }
}

function seatFragments(bindings: readonly ItemConditionBinding[], transforms: readonly Matrix4[], surfaceY: number): void {
  const bottoms = [Infinity, Infinity];
  const point = new Vector3();
  bindings.forEach(({ brokenGeometry }, meshIndex) => {
    const positions = brokenGeometry.getAttribute('position');
    const fragments = brokenGeometry.getAttribute('damageFragment');
    for (let index = 0; index < positions.count; index += 1) {
      point.fromBufferAttribute(positions, index).applyMatrix4(transforms[meshIndex]!);
      const fragment = fragments.getX(index);
      bottoms[fragment] = Math.min(bottoms[fragment]!, point.y);
    }
  });
  translateFragments(bindings, transforms, bottoms.map((bottom) => surfaceY - bottom));
}

function translateFragments(bindings: readonly ItemConditionBinding[], transforms: readonly Matrix4[], offsets: readonly number[]): void {
  const point = new Vector3();
  bindings.forEach(({ brokenGeometry }, meshIndex) => {
    const matrix = transforms[meshIndex]!;
    const inverse = matrix.clone().invert();
    const positions = brokenGeometry.getAttribute('position');
    const fragments = brokenGeometry.getAttribute('damageFragment');
    for (let index = 0; index < positions.count; index += 1) {
      point.fromBufferAttribute(positions, index).applyMatrix4(matrix);
      point.y += offsets[fragments.getX(index)]!;
      point.applyMatrix4(inverse);
      positions.setXYZ(index, point.x, point.y, point.z);
    }
    positions.needsUpdate = true;
    brokenGeometry.computeBoundingBox();
    brokenGeometry.computeBoundingSphere();
  });
}

function seatNetFragments(root: Object3D, bindings: readonly ItemConditionBinding[]): void {
  root.updateWorldMatrix(true, true);
  const toStorage = root.parent?.matrixWorld.clone().invert() ?? new Matrix4();
  const transforms = bindings.map(({ mesh }) => toStorage.clone().multiply(mesh.matrixWorld));
  // Measured against the gunwale and floor rib in the authored net storage pose.
  // Real-mesh clearance and contact tests protect these contact offsets.
  translateFragments(bindings, transforms, [-0.00435351, 0.00723172]);
}
