import {
  BufferGeometry,
  Mesh,
  PerspectiveCamera,
  ShaderMaterial,
  Vector3,
} from 'three';
import { expect, it, vi } from 'vitest';
import { ITEM_AMBIENT_OCCLUSION_LAYER } from '../src/rendering/ItemAmbientOcclusion';
import {
  LIGHT_SHAFT_COUNT,
  UnderwaterLightShafts,
} from '../src/menu/UnderwaterLightShafts';
import {
  MENU_CAMERA_FIELD_OF_VIEW,
  MENU_CAMERA_POSITION,
  MENU_CAMERA_TARGET,
  MENU_MINIMUM_ASPECT,
} from '../src/menu/MenuSceneLayout';

it('builds four animated transparent light shafts and disposes shared resources', () => {
  const shafts = new UnderwaterLightShafts();
  expect(shafts.root.name).toBe('menu:light-shafts');
  expect(LIGHT_SHAFT_COUNT).toBe(4);
  expect(shafts.root.children).toHaveLength(LIGHT_SHAFT_COUNT);

  const meshes = shafts.root.children as Mesh<BufferGeometry, ShaderMaterial>[];
  const geometry = meshes[0]!.geometry;
  const geometryDispose = vi.spyOn(geometry, 'dispose');
  const materialDisposers = meshes.map(({ material }) => vi.spyOn(material, 'dispose'));
  expect(geometry.getAttribute('position').count).toBeGreaterThan(4);
  for (const mesh of meshes) {
    expect(mesh.geometry).toBe(geometry);
    expect(mesh.material).toBeInstanceOf(ShaderMaterial);
    expect(mesh.material.transparent).toBe(true);
    expect(mesh.material.depthWrite).toBe(false);
    expect(mesh.layers.isEnabled(ITEM_AMBIENT_OCCLUSION_LAYER)).toBe(false);
    expect(mesh.material.uniforms.uTaper!.value).toBeGreaterThan(0);
    expect(mesh.material.uniforms.uDensity!.value).toBeGreaterThan(1);
    expect(mesh.material.uniforms.uDrift!.value).toBeGreaterThan(0);
    expect(mesh.material.vertexShader).toContain('uTaper');
    expect(mesh.material.fragmentShader).toContain('valueNoise');
  }

  shafts.setTime(2.5);
  for (const mesh of meshes) {
    expect(mesh.material.uniforms.uTime!.value).toBe(2.5);
  }

  shafts.setTime(Number.NaN);
  for (const mesh of meshes) {
    expect(mesh.material.uniforms.uTime!.value).toBe(0);
  }

  shafts.dispose();
  shafts.dispose();
  expect(geometryDispose).toHaveBeenCalledTimes(1);
  for (const dispose of materialDisposers) expect(dispose).toHaveBeenCalledTimes(1);
});

it('starts each upper fade above the minimum menu viewport', () => {
  const shafts = new UnderwaterLightShafts();
  const camera = new PerspectiveCamera(
    MENU_CAMERA_FIELD_OF_VIEW,
    MENU_MINIMUM_ASPECT,
    0.08,
    1000,
  );
  camera.position.set(...MENU_CAMERA_POSITION);
  camera.lookAt(...MENU_CAMERA_TARGET);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  shafts.root.updateMatrixWorld(true);

  const fadeStartLocalY = 0.86 - 0.5;
  for (const mesh of shafts.root.children as Mesh[]) {
    const lowestProjectedFadeEdge = Math.min(...[-0.5, 0.5].map((x) => (
      new Vector3(x, fadeStartLocalY, 0)
        .applyMatrix4(mesh.matrixWorld)
        .project(camera)
        .y
    )));
    expect.soft(lowestProjectedFadeEdge, mesh.name).toBeGreaterThan(1);
  }

  shafts.dispose();
});
