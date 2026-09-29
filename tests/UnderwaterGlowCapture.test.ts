// Importance: 95/100. Nested glow draws must restore the main camera and renderer, including after failure.
import { afterEach, expect, it, vi } from 'vitest';
import { Color, PerspectiveCamera, Scene, Vector4, WebGLRenderTarget, type WebGLRenderer } from 'three';
import { UnderwaterGlowCapture } from '../src/ocean/UnderwaterGlowCapture';
import { OceanRenderer } from '../src/ocean/OceanRenderer';
import { OceanCapture } from '../src/ocean/OceanCapture';
import { UNDERWATER_GLOW_LAYER } from '../src/rendering/renderLayers';

afterEach(() => vi.restoreAllMocks());

it.each([false, true])('restores capture state when rendering throws: %s', (fails) => {
  const capture = new UnderwaterGlowCapture();
  const scene = new Scene();
  scene.background = new Color(0x123456);
  const background = scene.background;
  const camera = new PerspectiveCamera();
  const previousTarget = new WebGLRenderTarget(1280, 720);
  const state = { target: previousTarget, color: new Color(0x112233), alpha: 0.4, scissor: true };
  const renderer = {
    autoClear: false, xr: { enabled: true }, shadowMap: { autoUpdate: true, needsUpdate: true },
    getRenderTarget: () => state.target, getActiveCubeFace: () => 0, getActiveMipmapLevel: () => 0,
    getClearAlpha: () => state.alpha, getClearColor: (color: Color) => color.copy(state.color),
    getScissorTest: () => state.scissor,
    getViewport: (v: Vector4) => v.set(0, 0, 1280, 720),
    getCurrentViewport: (v: Vector4) => v.set(0, 0, 1280, 720),
    getScissor: (v: Vector4) => v.set(4, 5, 80, 90),
    setViewport: vi.fn(), setScissor: vi.fn(),
    setRenderTarget: (target: WebGLRenderTarget) => { state.target = target; },
    setClearColor: (color: Color | number, alpha: number) => { state.color.set(color); state.alpha = alpha; },
    setScissorTest: (enabled: boolean) => { state.scissor = enabled; },
    render: () => {
      expect(camera.layers.mask).toBe(1 << UNDERWATER_GLOW_LAYER);
      expect(scene.background).toBeNull();
      expect(state.target.width).toBe(1280);
      expect(state.target.height).toBe(720);
      expect(state.alpha).toBe(0);
      if (fails) throw new Error('capture failed');
    },
  };
  const draw = () => capture.update(renderer as unknown as WebGLRenderer, scene, camera);
  if (fails) expect(draw).toThrow('capture failed');
  else draw();
  expect(camera.layers.mask).toBe(1);
  expect(scene.background).toBe(background);
  expect(state.target).toBe(previousTarget);
  expect(state.color.getHex()).toBe(0x112233);
  expect(state.alpha).toBe(0.4);
  expect(state.scissor).toBe(true);
  expect(renderer.autoClear).toBe(false);
  expect(renderer.xr.enabled).toBe(true);
  expect(renderer.shadowMap).toEqual({ autoUpdate: true, needsUpdate: true });
  capture.dispose();
  previousTarget.dispose();
});

// Importance: 95/100. Light must work in both water modes and must stop consuming resources after the event.
it('keeps glow through quality changes and releases it when the event clears', () => {
  const update = vi.spyOn(UnderwaterGlowCapture.prototype, 'update').mockImplementation(() => {});
  const dispose = vi.spyOn(UnderwaterGlowCapture.prototype, 'dispose');
  vi.spyOn(OceanCapture.prototype, 'update').mockImplementation(() => {});
  const ocean = new OceanRenderer('low');
  const camera = new PerspectiveCamera();
  const scene = new Scene();
  const draw = () => ocean.mesh.onBeforeRender({} as WebGLRenderer, scene, camera,
    ocean.mesh.geometry, ocean.material, null!);
  const uniforms = ocean.material.uniforms;
  ocean.setBioluminescence([new Vector4(0, -10, 2, 1)]);
  const texture = uniforms.uGlowColor!.value;
  draw();
  expect(uniforms.uGlowReady!.value).toBe(1);
  ocean.setQuality('high');
  draw();
  expect(update).toHaveBeenCalledTimes(2);
  expect(uniforms.uGlowColor!.value).toBe(texture);
  ocean.setBioluminescence([]);
  expect(uniforms.uGlowReady!.value).toBe(0);
  expect(uniforms.uGlowColor!.value).toBeNull();
  ocean.dispose();
  expect(dispose).toHaveBeenCalledOnce();
});
