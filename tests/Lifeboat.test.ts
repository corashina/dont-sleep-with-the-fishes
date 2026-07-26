import { Material, Mesh } from 'three';
import { describe, expect, it } from 'vitest';
import { createLifeboat } from '../src/world/Lifeboat';
import { createTestLifeboatAssets } from './helpers/lifeboatAssets';

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
    assets.dispose();
  });
});
