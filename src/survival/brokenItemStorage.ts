import { Box3, Matrix4, Object3D, Vector3 } from 'three';
import type { ItemId } from '../game/ItemState';
import type { ItemConditionBinding } from './itemConditionAppearance';

/** Bake storage clearance once; condition changes still only swap resources. */
export function fitBrokenItemToStorage(root: Object3D, bindings: readonly ItemConditionBinding[], itemId: ItemId): void {
  if (bindings.length === 0) return;
  // The net hangs across a curved rim. Its tested mesh pose, not its box, defines clearance.
  if (itemId === 'fishingNet') return;
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
}
