import { Material, Mesh } from 'three';
import { describe, expect, it } from 'vitest';
import { createLifeboat } from '../src/world/Lifeboat';
import { createTestLifeboatAssets } from './helpers/lifeboatAssets';

function disposeOwnedMeshes(root: ReturnType<typeof createLifeboat>['root']): void {
  const geometries = new Set<Mesh['geometry']>();
  const materials = new Set<Material>();
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    geometries.add(object.geometry);
    const meshMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    meshMaterials.forEach((material) => materials.add(material));
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

describe('lifeboat model', () => {
  it('mounts the paddles lengthwise and rolled without side waterline strips', () => {
    const assets = createTestLifeboatAssets();
    const { root } = createLifeboat(assets);

    expect(root.getObjectByName('paddle-port')?.rotation.y)
      .toBeCloseTo(-0.06);
    expect(root.getObjectByName('paddle-starboard')?.rotation.y)
      .toBeCloseTo(0.06);
    expect(root.getObjectByName('paddle-port')?.rotation.z)
      .toBeCloseTo(Math.PI / 2);
    expect(root.getObjectByName('paddle-starboard')?.rotation.z)
      .toBeCloseTo(Math.PI / 2);
    expect(root.getObjectByName('lifeboat-waterline-port')).toBeUndefined();
    expect(root.getObjectByName('lifeboat-waterline-starboard')).toBeUndefined();

    disposeOwnedMeshes(root);
    assets.dispose();
  });

  it('keeps the three seats and adds one bow-side display bench', () => {
    const assets = createTestLifeboatAssets();
    const { root } = createLifeboat(assets);

    expect([0, 1, 2].map((index) => (
      root.getObjectByName(`survival-bench-${index}`)?.position.z
    ))).toEqual([0.78, 1.48, 2.14]);
    expect(root.getObjectByName('survival-bench-3')).toBeUndefined();

    const display = root.getObjectByName('lifeboat-display-bench');
    expect(display).toBeDefined();
    expect(display!.position.z).toBeLessThan(0);
    expect(root.getObjectsByProperty('name', 'lifeboat-display-bench')).toHaveLength(1);

    disposeOwnedMeshes(root);
    assets.dispose();
  });
});
