import {
  BoxGeometry,
  type BufferGeometry,
  Group,
  type Material,
  Mesh,
  MeshBasicMaterial,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  collectMeshResources,
  disposeMeshResources,
  type MeshResourceAddition,
} from '../src/world/SceneResources';

describe('scene resources', () => {
  it('collects each geometry and material once in traversal order', () => {
    const root = new Group();
    const geometry = new BoxGeometry();
    const first = new MeshBasicMaterial();
    const second = new MeshBasicMaterial();
    root.add(new Mesh(geometry, [first, second]), new Mesh(geometry, first));
    const geometries = new Set<BufferGeometry>();
    const materials = new Set<Material>();
    const additions: MeshResourceAddition[] = [];

    collectMeshResources(root, geometries, materials, (addition) => additions.push(addition));

    expect([...geometries]).toEqual([geometry]);
    expect([...materials]).toEqual([first, second]);
    expect(additions.map(({ kind }) => kind)).toEqual(['geometry', 'material', 'material']);
  });

  it('disposes and clears each owned set', () => {
    const geometry = new BoxGeometry();
    const material = new MeshBasicMaterial();
    const geometryDispose = vi.spyOn(geometry, 'dispose');
    const materialDispose = vi.spyOn(material, 'dispose');
    const geometries = new Set([geometry]);
    const materials = new Set([material]);

    disposeMeshResources(geometries, materials);

    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(geometries.size).toBe(0);
    expect(materials.size).toBe(0);
  });
});
