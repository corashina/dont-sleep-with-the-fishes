import { DirectionalLight, PerspectiveCamera, Scene, WebGLRenderTarget, type WebGLRenderer } from 'three';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { expect, it, vi } from 'vitest';
import { ITEM_AMBIENT_OCCLUSION_LAYER, ItemAmbientOcclusionPass } from '../src/rendering/ItemAmbientOcclusion';

it.each([true, false])('restores transform flags and layers after AO capture, initial auto update: %s', autoUpdate => {
  const pass = new ItemAmbientOcclusionPass();
  const scene = new Scene();
  const camera = new PerspectiveCamera();
  scene.matrixWorldAutoUpdate = autoUpdate;
  camera.matrixWorldAutoUpdate = autoUpdate;
  camera.layers.enable(4);
  const mask = camera.layers.mask;
  const light = new DirectionalLight();
  const excluded = new DirectionalLight();
  excluded.layers.set(ITEM_AMBIENT_OCCLUSION_LAYER);
  scene.add(light, excluded);
  const renderer = { shadowMap: { autoUpdate, needsUpdate: autoUpdate } } as WebGLRenderer;
  pass.setContext(scene, camera);
  const target = new WebGLRenderTarget(8, 8);
  let fail = false;
  const render = vi.spyOn(GTAOPass.prototype, 'render').mockImplementation(() => {
    expect(scene.matrixWorldAutoUpdate).toBe(false);
    expect(camera.matrixWorldAutoUpdate).toBe(false);
    expect(camera.layers.mask).toBe(1 << ITEM_AMBIENT_OCCLUSION_LAYER);
    expect(light.layers.test(camera.layers)).toBe(true);
    expect(excluded.layers.test(camera.layers)).toBe(false);
    expect(renderer.shadowMap.autoUpdate).toBe(false);
    expect(renderer.shadowMap.needsUpdate).toBe(false);
    if (fail) throw new Error('capture failed');
  });
  const capture = () => pass.render(renderer, target, target, 0, false);
  try {
    capture();
    expect(scene.matrixWorldAutoUpdate).toBe(autoUpdate);
    expect(camera.matrixWorldAutoUpdate).toBe(autoUpdate);
    expect(camera.layers.mask).toBe(mask);
    expect(light.layers.mask).toBe(1);
    expect(excluded.layers.mask).toBe(1 << ITEM_AMBIENT_OCCLUSION_LAYER);
    expect(renderer.shadowMap.autoUpdate).toBe(autoUpdate);
    expect(renderer.shadowMap.needsUpdate).toBe(autoUpdate);
    fail = true;
    expect(capture).toThrow('capture failed');
    expect(scene.matrixWorldAutoUpdate).toBe(autoUpdate);
    expect(camera.matrixWorldAutoUpdate).toBe(autoUpdate);
    expect(camera.layers.mask).toBe(mask);
    expect(light.layers.mask).toBe(1);
    expect(excluded.layers.mask).toBe(1 << ITEM_AMBIENT_OCCLUSION_LAYER);
    expect(renderer.shadowMap.autoUpdate).toBe(autoUpdate);
    expect(renderer.shadowMap.needsUpdate).toBe(autoUpdate);
  } finally { render.mockRestore(); pass.dispose(); target.dispose(); }
});
