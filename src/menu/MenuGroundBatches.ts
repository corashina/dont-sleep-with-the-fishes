import { Color, Group, InstancedMesh, Mesh, type BufferGeometry, type Material } from 'three';
import type { MenuSceneComponent } from './MenuSceneComponent';

const WHITE = new Color(1, 1, 1);

// The model library owns geometry and materials. This component owns instance buffers.
export class MenuGroundBatches implements MenuSceneComponent {
  readonly root = new Group();
  private disposed = false;

  constructor(
    roots: readonly Group[],
    tints: ReadonlyMap<Group, Color> = new Map(),
  ) {
    this.root.name = 'menu:ground-model-batches';
    const groups = new Map<BufferGeometry, Map<string, {
      material: Material | Material[]; meshes: Mesh[]; tints: Color[];
    }>>();
    for (const root of roots) {
      root.updateMatrixWorld(true);
      const tint = tints.get(root) ?? WHITE;
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
        if (group) {
          group.meshes.push(object);
          group.tints.push(tint);
        } else {
          materials.set(key, { material: object.material, meshes: [object], tints: [tint] });
        }
      });
    }
    for (const [geometry, materials] of groups) {
      for (const { material, meshes, tints: meshTints } of materials.values()) {
        const batch = new InstancedMesh(geometry, material, meshes.length);
        batch.name = `menu:ground-batch-${this.root.children.length + 1}`;
        const tinted = meshTints.some((tint) => tint !== WHITE);
        for (let index = 0; index < meshes.length; index += 1) {
          batch.setMatrixAt(index, meshes[index]!.matrixWorld);
          if (tinted) batch.setColorAt(index, meshTints[index]!);
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
