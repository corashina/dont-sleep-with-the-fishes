import {
  Box3, BoxGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial,
  Texture, Vector3,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import { DistantSeabed } from '../src/menu/DistantSeabed';
import { MenuGroundBatches } from '../src/menu/MenuGroundBatches';
import { UnderwaterPlantField } from '../src/menu/UnderwaterPlantField';
import { menuSandChannelContains, menuSeabedHeight } from '../src/menu/MenuSceneLayout';

describe('menu environment', () => {
  it('keeps stone geometry outside the foreground sand opening', () => {
    const texture = new Texture();
    const seabed = new DistantSeabed(texture);
    const matrix = new Matrix4();
    const position = new Vector3();
    const bounds = new Box3();
    let foreground = 0;
    try {
      for (const name of ['menu:scatter-rocks', 'menu:scatter-stones']) {
        const batch = seabed.root.getObjectByName(name) as InstancedMesh;
        batch.geometry.computeBoundingBox();
        for (let index = 0; index < batch.count; index += 1) {
          batch.getMatrixAt(index, matrix);
          position.setFromMatrixPosition(matrix);
          if (position.z < -12) continue;
          foreground += 1;
          bounds.copy(batch.geometry.boundingBox!).applyMatrix4(matrix);
          const radius = Math.max(position.x - bounds.min.x, bounds.max.x - position.x);
          expect(menuSandChannelContains(position.x, position.z, radius)).toBe(false);
        }
      }
      expect(foreground).toBeGreaterThan(10);
      expect((seabed.root.getObjectByName('menu:barnacle-colonies') as InstancedMesh).count).toBeGreaterThan(0);
      expect((seabed.root.getObjectByName('menu:sponge-colonies') as InstancedMesh).count).toBeGreaterThan(0);
    } finally {
      seabed.dispose();
      texture.dispose();
    }
  });

  it('roots all plant forms on the terrain and preserves static instance buffers during animation', () => {
    const plants = new UnderwaterPlantField();
    const matrix = new Matrix4();
    const position = new Vector3();
    const planted: Vector3[] = [];
    try {
      expect(plants.root.children).toHaveLength(3);
      for (const child of plants.root.children) {
        const batch = child as InstancedMesh;
        const original = batch.instanceMatrix.array.slice();
        expect(batch.count, batch.name).toBeGreaterThan(10);
        for (let index = 0; index < batch.count; index += 1) {
          batch.getMatrixAt(index, matrix);
          position.setFromMatrixPosition(matrix);
          expect(position.y).toBeCloseTo(menuSeabedHeight(position.x, position.z) - 0.025, 5);
          expect(menuSandChannelContains(position.x, position.z, 0.5)).toBe(false);
          expect(batch.boundingBox!.containsPoint(position)).toBe(true);
          for (const previous of planted) {
            expect(Math.hypot(position.x - previous.x, position.z - previous.z)).toBeGreaterThanOrEqual(0.69999);
          }
          planted.push(position.clone());
        }
        plants.setTime(150);
        expect(batch.instanceMatrix.array).toEqual(original);
      }
    } finally { plants.dispose(); }
  });

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
