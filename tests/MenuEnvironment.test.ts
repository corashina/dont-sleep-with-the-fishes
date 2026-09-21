import { BoxGeometry,Group,InstancedMesh,Matrix4,Mesh,MeshStandardMaterial } from 'three';
import { describe,expect,it,vi } from 'vitest';
import { MenuGroundBatches } from '../src/menu/MenuGroundBatches';

describe('menu environment', () => {
  it('batches cloned material arrays without changing world transforms or disposing shared assets', () => {
    const geometry = new BoxGeometry();
    const material = new MeshStandardMaterial();
    const roots = [new Group(), new Group()];
    roots.forEach((root, index) => {
      root.position.set(index * 3, 1, -2);
      root.rotation.y = index * 0.4;
      const mesh = new Mesh(geometry, [material]);
      mesh.position.x = 0.5;
      root.add(mesh);
    });
    const batches = new MenuGroundBatches(roots);
    const disposeGeometry = vi.spyOn(geometry, 'dispose');
    const disposeMaterial = vi.spyOn(material, 'dispose');
    expect(batches.root.children).toHaveLength(1);
    const batch = batches.root.children[0] as InstancedMesh;
    const disposeBatch = vi.spyOn(batch, 'dispose');
    const matrix = new Matrix4();
    expect(batch.count).toBe(2);
    roots.forEach((root, index) => {
      batch.getMatrixAt(index, matrix);
      matrix.elements.forEach((value, element) => {
        expect(value).toBeCloseTo(root.children[0]!.matrixWorld.elements[element]!, 6);
      });
    });
    batches.dispose();
    batches.dispose();
    expect(disposeBatch).toHaveBeenCalledOnce();
    expect(disposeGeometry).not.toHaveBeenCalled();
    expect(disposeMaterial).not.toHaveBeenCalled();
    geometry.dispose();
    material.dispose();
  });
});
