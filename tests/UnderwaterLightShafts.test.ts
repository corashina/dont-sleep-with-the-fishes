import { BufferGeometry, Mesh, ShaderMaterial } from 'three';
import { expect, it, vi } from 'vitest';
import { ITEM_AMBIENT_OCCLUSION_LAYER } from '../src/rendering/ItemAmbientOcclusion';
import {
  LIGHT_SHAFT_COUNT,
  UnderwaterLightShafts,
} from '../src/menu/UnderwaterLightShafts';

it('builds four animated transparent light shafts and disposes shared resources', () => {
  const shafts = new UnderwaterLightShafts();
  expect(shafts.root.name).toBe('menu:light-shafts');
  expect(LIGHT_SHAFT_COUNT).toBe(4);
  expect(shafts.root.children).toHaveLength(LIGHT_SHAFT_COUNT);

  const meshes = shafts.root.children as Mesh<BufferGeometry, ShaderMaterial>[];
  const geometry = meshes[0]!.geometry;
  const geometryDispose = vi.spyOn(geometry, 'dispose');
  const materialDisposers = meshes.map(({ material }) => vi.spyOn(material, 'dispose'));
  for (const mesh of meshes) {
    expect(mesh.geometry).toBe(geometry);
    expect(mesh.material).toBeInstanceOf(ShaderMaterial);
    expect(mesh.material.transparent).toBe(true);
    expect(mesh.material.depthWrite).toBe(false);
    expect(mesh.layers.isEnabled(ITEM_AMBIENT_OCCLUSION_LAYER)).toBe(false);
  }

  shafts.setTime(2.5);
  for (const mesh of meshes) {
    expect(mesh.material.uniforms.uTime!.value).toBe(2.5);
  }

  shafts.dispose();
  shafts.dispose();
  expect(geometryDispose).toHaveBeenCalledTimes(1);
  for (const dispose of materialDisposers) expect(dispose).toHaveBeenCalledTimes(1);
});
