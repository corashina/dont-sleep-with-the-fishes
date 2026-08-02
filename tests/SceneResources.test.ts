// Importance: 5/5. Protects exact resource ownership and cleanup.
import {
  BoxGeometry,
  type BufferGeometry,
  Group,
  type Material,
  Mesh,
  MeshBasicMaterial,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createShipFurniture } from '../src/world/ShipFurniture';
import { createShipMaterials } from '../src/world/ShipMaterials';
import {
  collectMeshResources,
  disposeMeshResources,
  type MeshResourceAddition,
} from '../src/world/SceneResources';
import { createTestShipFurniture } from './helpers/shipFurniture';

describe('scene resources', () => {
  it('reuses one owned geometry and shared materials for generated timber benches', () => {
    const materials = createShipMaterials();
    const library = createTestShipFurniture();
    const furniture = createShipFurniture(materials, library);
    const benches = furniture.root.children.filter(({ name }) =>
      name.startsWith('furniture:deck-bench-'));

    try {
      expect(benches).toHaveLength(3);
      const meshes = benches.flatMap((bench) => bench.children.filter(
        (child): child is Mesh => child instanceof Mesh,
      ));
      expect(meshes).toHaveLength(45);
      expect(new Set(meshes.map(({ geometry }) => geometry)).size).toBe(1);
      expect(new Set(meshes.map(({ material }) => material)))
        .toEqual(new Set([materials.hatchTimber, materials.darkMetal]));
      benches.forEach((bench) => {
        const names = bench.children.map(({ name }) => name);
        expect(names.filter((name) => name.startsWith('bench-plank-'))).toHaveLength(3);
        expect(names.filter((name) => name.startsWith('bench-brace-'))).toHaveLength(2);
        expect(names.filter((name) => name.startsWith('bench-fastener-'))).toHaveLength(6);
        expect(names.filter((name) => name.startsWith('bench-band-'))).toHaveLength(2);
        const planks = bench.children.filter(({ name }) => name.startsWith('bench-plank-'));
        expect(new Set(planks.map(({ scale }) => scale.x)).size).toBeGreaterThan(1);
        expect(planks.some(({ rotation }) => rotation.y !== 0 || rotation.z !== 0)).toBe(true);
      });

      const dispose = vi.spyOn(meshes[0]!.geometry, 'dispose');
      furniture.disposeGeometry();
      furniture.disposeGeometry();
      expect(dispose).toHaveBeenCalledOnce();
    } finally {
      furniture.disposeGeometry();
      library.dispose();
      materials.dispose();
    }
  });

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

  it('continues ordered disposal, clears ownership, and rethrows the first failure', () => {
    const firstGeometry = new BoxGeometry();
    const secondGeometry = new BoxGeometry();
    const firstMaterial = new MeshBasicMaterial();
    const secondMaterial = new MeshBasicMaterial();
    const firstError = new Error('first geometry disposal failed');
    const laterError = new Error('later material disposal failed');
    const calls: string[] = [];
    const firstGeometryDispose = vi.spyOn(firstGeometry, 'dispose').mockImplementation(() => {
      calls.push('first geometry');
      throw firstError;
    });
    const secondGeometryDispose = vi.spyOn(secondGeometry, 'dispose').mockImplementation(() => {
      calls.push('second geometry');
    });
    const firstMaterialDispose = vi.spyOn(firstMaterial, 'dispose').mockImplementation(() => {
      calls.push('first material');
      throw laterError;
    });
    const secondMaterialDispose = vi.spyOn(secondMaterial, 'dispose').mockImplementation(() => {
      calls.push('second material');
    });
    const geometries = new Set([firstGeometry, secondGeometry]);
    const materials = new Set([firstMaterial, secondMaterial]);

    expect(() => disposeMeshResources(geometries, materials)).toThrow(firstError);

    expect(calls).toEqual([
      'first geometry',
      'second geometry',
      'first material',
      'second material',
    ]);
    expect(geometries.size).toBe(0);
    expect(materials.size).toBe(0);
    expect(() => disposeMeshResources(geometries, materials)).not.toThrow();
    [firstGeometryDispose, secondGeometryDispose, firstMaterialDispose, secondMaterialDispose]
      .forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
  });
});
