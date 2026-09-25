import { Box3, Matrix4, Object3D, Vector3 } from 'three';
import type { ItemId } from '../game/ItemState';
import type { ItemConditionBinding } from './itemConditionAppearance';

/** Bake storage clearance once; condition changes still only swap resources. */
export function fitBrokenItemToStorage(root: Object3D, bindings: readonly ItemConditionBinding[], itemId: ItemId): void {
  if (bindings.length === 0) return;
  // Punctures remove only wall material; the intact storage pose still fits exactly.
  if (itemId === 'bucket') return;
  root.updateWorldMatrix(true, true);
  const toStorage = root.parent?.matrixWorld.clone().invert() ?? new Matrix4();
  if (itemId === 'fishingNet') {
    // Lower the connected net to a 2 mm clearance over the gunwale.
    const transforms = bindings.map(({ mesh }) => toStorage.clone().multiply(mesh.matrixWorld));
    translateFragments(bindings, transforms, [-0.00435]);
    return;
  }
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
  // A wider damage pose needs more space, not smaller fragments.
  const offset = usable.getCenter(new Vector3()).sub(broken.getCenter(new Vector3()));
  offset.y = usable.min.y + 0.002 - broken.min.y;
  if (itemId === 'anchor') {
    // Full-size fragments sit inward of the hull and ahead of the floor rib.
    offset.x += 0.10;
    offset.z -= 0.08;
  }
  const fit = new Matrix4().makeTranslation(offset.x, offset.y, offset.z);
  bindings.forEach(({ brokenGeometry }, index) => {
    const matrix = transforms[index]!;
    brokenGeometry.applyMatrix4(matrix.clone().invert().multiply(fit).multiply(matrix));
    brokenGeometry.computeBoundingBox();
    brokenGeometry.computeBoundingSphere();
  });
  if (['map', 'spyglass', 'anchor', 'flashlight'].includes(itemId)) {
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
