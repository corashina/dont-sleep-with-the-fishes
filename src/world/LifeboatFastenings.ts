import { type Group, Mesh, type MeshStandardMaterial } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Fixed hardware shares one draw call. Run once, before the boat starts moving. */
export function mergeLifeboatFastenings(root: Group, material: MeshStandardMaterial): void {
  const fastenings: Mesh[] = [];
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    if (object instanceof Mesh && object.material === material) fastenings.push(object);
  });
  const transformed = fastenings.map((mesh) => mesh.geometry.clone().applyMatrix4(mesh.matrixWorld));
  const geometry = mergeGeometries(transformed);
  transformed.forEach((part) => part.dispose());
  if (!geometry) throw new Error('Lifeboat fastenings must have matching geometry attributes');
  const originalGeometries = new Set(fastenings.map((mesh) => mesh.geometry));
  fastenings.forEach((mesh) => mesh.removeFromParent());
  originalGeometries.forEach((part) => part.dispose());
  const combined = new Mesh(geometry, material);
  combined.name = 'lifeboat-iron-fastenings';
  root.add(combined);
}
