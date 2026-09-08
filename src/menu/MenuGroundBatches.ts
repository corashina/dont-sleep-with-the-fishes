import { Group, InstancedMesh, Mesh, type BufferGeometry, type Material } from 'three';
import type { MenuSceneComponent } from './MenuSceneComponent';

// The model library owns geometry and materials. This component owns instance buffers.
export class MenuGroundBatches implements MenuSceneComponent {
  readonly root = new Group();
  private disposed = false;

  constructor(roots: readonly Group[]) {
    this.root.name = 'menu:ground-model-batches';
    const groups = new Map<BufferGeometry, Map<string, {
      material: Material | Material[]; meshes: Mesh[];
    }>>();
    for (const root of roots) {
      root.updateMatrixWorld(true);
      root.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        let materials = groups.get(object.geometry);
        if (!materials) {
          materials = new Map();
          groups.set(object.geometry, materials);
        }
        const key = Array.isArray(object.material)
          ? object.material.map((material) => material.uuid).join(':')
          : object.material.uuid;
        const group = materials.get(key);
        if (group) group.meshes.push(object);
        else materials.set(key, { material: object.material, meshes: [object] });
      });
    }
    for (const [geometry, materials] of groups) {
      for (const { material, meshes } of materials.values()) {
        const batch = new InstancedMesh(geometry, material, meshes.length);
        batch.name = `menu:ground-batch-${this.root.children.length + 1}`;
        for (let index = 0; index < meshes.length; index += 1) {
          batch.setMatrixAt(index, meshes[index]!.matrixWorld);
        }
        batch.computeBoundingBox();
        batch.computeBoundingSphere();
        batch.updateMatrix();
        batch.matrixAutoUpdate = false;
        this.root.add(batch);
      }
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    for (const child of this.root.children) (child as InstancedMesh).dispose();
  }
}
