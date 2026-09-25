// Importance: 10/10. Protects water capture state, sizing, and reflection projection.
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Camera,
  Matrix4,
  Object3D,
  PerspectiveCamera,
  Scene,
  Texture,
  Vector4,
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OceanCapture } from '../src/ocean/OceanCapture';
import { WEATHER_PARTICLE_LAYER } from '../src/rendering/renderLayers';
import { WeatherEffects } from '../src/world/WeatherEffects';
import { BoatRainEffects } from '../src/world/BoatRainEffects';
import { Skybox } from '../src/world/Skybox';

type RenderRecord = {
  camera: Camera;
  target: WebGLRenderTarget | null;
  waterVisible: boolean;
  shadowNeedsUpdate: boolean;
};

function expectMatrixClose(actual: Matrix4, expected: Matrix4): void {
  for (let index = 0; index < 16; index += 1) {
    expect(actual.elements[index]).toBeCloseTo(expected.elements[index]!, 10);
  }
}

function createRenderer() {
  let drawingWidth = 3840;
  let drawingHeight = 2160;
  let renderTarget: WebGLRenderTarget | null = null;
  let cubeFace = 3;
  let mipLevel = 2;
  const viewport = new Vector4(10, 20, 100, 200);
  const scissor = new Vector4(4, 5, 80, 90);
  const mainCurrentViewport = new Vector4(0, 0, drawingWidth, drawingHeight);
  const currentViewport = mainCurrentViewport.clone();
  let scissorTest = true;
  const records: RenderRecord[] = [];
  let water: Object3D;

  const renderer = {
    autoClear: true,
    xr: { enabled: true },
    shadowMap: { autoUpdate: true, needsUpdate: true },
    state: {
      buffers: { depth: { setMask: vi.fn() } },
      viewport: vi.fn(),
    },
    clear: vi.fn(),
    render: vi.fn((_scene: Scene, camera: Camera) => {
      records.push({
        camera,
        target: renderTarget,
        waterVisible: water.visible,
        shadowNeedsUpdate: renderer.shadowMap.needsUpdate,
      });
    }),
    getPixelRatio: vi.fn(() => 2),
    getRenderTarget: vi.fn(() => renderTarget),
    getActiveCubeFace: vi.fn(() => cubeFace),
    getActiveMipmapLevel: vi.fn(() => mipLevel),
    setRenderTarget: vi.fn((target: WebGLRenderTarget | null, face = 0, mip = 0) => {
      renderTarget = target;
      cubeFace = face;
      mipLevel = mip;
      currentViewport.copy(target === null ? mainCurrentViewport : target.viewport);
    }),
    getCurrentViewport: vi.fn((target: Vector4) => target.copy(currentViewport)),
    getViewport: vi.fn((target: Vector4) => target.copy(viewport)),
    setViewport: vi.fn((value: Vector4) => viewport.copy(value)),
    getScissor: vi.fn((target: Vector4) => target.copy(scissor)),
    setScissor: vi.fn((value: Vector4) => scissor.copy(value)),
    getScissorTest: vi.fn(() => scissorTest),
    setScissorTest: vi.fn((value: boolean) => { scissorTest = value; }),
  } as unknown as WebGLRenderer;

  return {
    renderer,
    records,
    setWater(value: Object3D) { water = value; },
    setDrawingBufferSize(width: number, height: number) {
      drawingWidth = width;
      drawingHeight = height;
      mainCurrentViewport.set(0, 0, width, height);
      if (renderTarget === null) currentViewport.copy(mainCurrentViewport);
    },
    state() {
      return { renderTarget, cubeFace, mipLevel, viewport, scissor, scissorTest };
    },
  };
}

function createSceneInput() {
  const scene = new Scene();
  const water = new Object3D();
  scene.add(water);
  const camera = new PerspectiveCamera(60, 16 / 9, 0.1, 500);
  camera.position.set(3, 8, 12);
  camera.lookAt(0, 0, 0);
  camera.layers.set(4);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return { scene, water, camera };
}

describe('OceanCapture', () => {
  afterEach(() => vi.restoreAllMocks());

  // Importance: 95/100. Captures must reuse transforms and keep sky in reflections only.
  it.each([true])('restores sky and transform state after captures (failure: %s)', (fail) => {
    const capture = new OceanCapture();
    const testRenderer = createRenderer();
    const { scene, water, camera } = createSceneInput();
    const moon = new Texture();
    const sky = new Skybox(scene, { phase: 'day', weather: 'calm', severity: 0 }, moon);
    const background = scene.getObjectByName('procedural-skybox')!;
    scene.updateMatrixWorld(true);
    const updateMatrices = vi.spyOn(scene, 'updateMatrixWorld');
    const visibility: boolean[] = [];
    testRenderer.setWater(water);
    vi.mocked(testRenderer.renderer.render).mockImplementation(() => {
      if (scene.matrixWorldAutoUpdate) scene.updateMatrixWorld();
      visibility.push(background.visible);
      if (fail && visibility.length === 2) throw new Error('capture failure');
    });
    try {
      const draw = () => capture.update(testRenderer.renderer, scene, camera, water);
      if (fail) expect(draw).toThrow('capture failure');
      else draw();
      expect(visibility).toEqual([false, true]);
      expect(updateMatrices).not.toHaveBeenCalled();
      expect(background.visible).toBe(true);
      expect(scene.matrixWorldAutoUpdate).toBe(true);
      expect(camera.matrixWorldAutoUpdate).toBe(true);
    } finally {
      sky.dispose();
      moon.dispose();
      capture.dispose();
    }
  });

  it('captures color, depth, and reflection at a capped half resolution', () => {
    const capture = new OceanCapture();
    const testRenderer = createRenderer();
    const { scene, water, camera } = createSceneInput();
    testRenderer.setWater(water);

    capture.update(testRenderer.renderer, scene, camera, water);

    expect(capture.colorTexture.image).toMatchObject({ width: 1024, height: 576 });
    expect(capture.depthTexture.image).toMatchObject({ width: 1024, height: 576 });
    expect(capture.reflectionTexture.image).toMatchObject({ width: 1024, height: 576 });
    expect(testRenderer.records).toHaveLength(2);
    expect(testRenderer.records[0]).toMatchObject({ camera, waterVisible: false });
    expect(testRenderer.records[1]!.camera).not.toBe(camera);
    expect(testRenderer.records[1]!.camera.userData.hideSkyClouds).toBe(true);
    expect(camera.userData.hideSkyClouds).toBeUndefined();
    expect(testRenderer.records[1]!.camera.layers.mask).toBe(camera.layers.mask);
    expect(testRenderer.records[1]!.target!.depthBuffer).toBe(true);
    expect(testRenderer.records.every((record) => record.shadowNeedsUpdate === false)).toBe(true);
    expect(capture.viewport.toArray()).toEqual([0, 0, 3840, 2160]);
    expectMatrixClose(capture.inverseProjection, camera.projectionMatrixInverse);
    expectMatrixClose(capture.cameraWorld, camera.matrixWorld);
    expectMatrixClose(capture.viewMatrix, camera.matrixWorldInverse);

    const bias = new Matrix4().set(
      0.5, 0, 0, 0.5,
      0, 0.5, 0, 0.5,
      0, 0, 0.5, 0.5,
      0, 0, 0, 1,
    );
    const expectedReflection = bias
      .multiply(camera.projectionMatrix)
      .multiply(testRenderer.records[1]!.camera.matrixWorldInverse);
    expectMatrixClose(capture.reflectionMatrix, expectedReflection);
    capture.dispose();
  });


  // Importance: 95/100. Keep weather visible while excluding its extra reflection draws.
  it('excludes weather particles from reflections but preserves the main view and lightning', () => {
    const capture = new OceanCapture();
    const testRenderer = createRenderer();
    const { scene, water, camera } = createSceneInput();
    camera.layers.set(0);
    camera.layers.enable(WEATHER_PARTICLE_LAYER);
    const originalMask = camera.layers.mask;
    const weather = new WeatherEffects(scene, () => 0.5);
    weather.setWeather('thunderstorm');
    const boat = new Group();
    const hull = new Mesh(new BoxGeometry(3, 1, 5), new MeshBasicMaterial());
    boat.add(hull);
    scene.add(boat);
    const boatRain = new BoatRainEffects(boat);
    boatRain.setIntensity(1);
    const names = ['weather-rain', 'weather-rain-far', 'weather-mist',
      'weather-impacts', 'weather-spray', 'boat-rain-splashes'];
    const effects = names.map((name) => scene.getObjectByName(name)!);
    testRenderer.setWater(water);
    capture.update(testRenderer.renderer, scene, camera, water);
    const refraction = testRenderer.records[0]!.camera;
    const reflection = testRenderer.records[1]!.camera;
    for (const effect of effects) {
      expect(effect.visible, effect.name).toBe(true);
      expect(camera.layers.test(effect.layers), effect.name).toBe(true);
      expect(refraction.layers.test(effect.layers), effect.name).toBe(true);
      expect(reflection.layers.test(effect.layers), effect.name).toBe(false);
    }
    for (const object of [hull, scene.getObjectByName('weather-lightning-light')!,
      scene.getObjectByName('weather-lightning-fill')!, scene.getObjectByName('weather-lightning-bolt-1')!]) {
      expect(reflection.layers.test(object.layers), object.name).toBe(true);
    }
    expect(camera.layers.mask).toBe(originalMask);
    boatRain.dispose();
    weather.dispose();
    hull.geometry.dispose();
    hull.material.dispose();
    capture.dispose();
  });

  it('resizes only when the aspect-preserving capture size changes', () => {
    const resize = vi.spyOn(WebGLRenderTarget.prototype, 'setSize');
    const capture = new OceanCapture();
    const testRenderer = createRenderer();
    const { scene, water, camera } = createSceneInput();
    testRenderer.setWater(water);

    capture.update(testRenderer.renderer, scene, camera, water);
    capture.update(testRenderer.renderer, scene, camera, water);
    expect(resize).toHaveBeenCalledTimes(2);

    testRenderer.setDrawingBufferSize(1600, 900);
    capture.update(testRenderer.renderer, scene, camera, water);
    expect(resize).toHaveBeenCalledTimes(4);
    expect(capture.colorTexture.image).toMatchObject({ width: 800, height: 450 });
    expect(capture.reflectionTexture.image).toMatchObject({ width: 800, height: 450 });
    capture.dispose();
  });

  it('uses a custom target viewport and the target aspect ratio', () => {
    const capture = new OceanCapture();
    const testRenderer = createRenderer();
    const { scene, water, camera } = createSceneInput();
    testRenderer.setWater(water);
    const originalTarget = new WebGLRenderTarget(1200, 600);
    originalTarget.viewport.set(100, 50, 800, 400);
    testRenderer.renderer.setRenderTarget(originalTarget, 4, 1);

    capture.update(testRenderer.renderer, scene, camera, water);

    expect(capture.viewport.toArray()).toEqual([100, 50, 800, 400]);
    expect(capture.colorTexture.image).toMatchObject({ width: 600, height: 300 });
    expect(testRenderer.state()).toMatchObject({
      renderTarget: originalTarget,
      cubeFace: 4,
      mipLevel: 1,
    });
    originalTarget.dispose();
    capture.dispose();
  });

  it('restores all state when reflection rendering fails', () => {
    const capture = new OceanCapture();
    const testRenderer = createRenderer();
    const { scene, water, camera } = createSceneInput();
    testRenderer.setWater(water);
    const originalTarget = new WebGLRenderTarget(7, 9);
    testRenderer.renderer.setRenderTarget(originalTarget, 3, 2);
    const error = new Error('reflection failed');
    vi.mocked(testRenderer.renderer.render)
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => { throw error; });

    expect(() => capture.update(testRenderer.renderer, scene, camera, water)).toThrow(error);

    expect(water.visible).toBe(true);
    expect(scene.overrideMaterial).toBeNull();
    expect(testRenderer.renderer.autoClear).toBe(true);
    expect(testRenderer.renderer.xr.enabled).toBe(true);
    expect(testRenderer.renderer.shadowMap.autoUpdate).toBe(true);
    expect(testRenderer.renderer.shadowMap.needsUpdate).toBe(true);
    expect(testRenderer.state()).toMatchObject({
      renderTarget: originalTarget,
      cubeFace: 3,
      mipLevel: 2,
      scissorTest: true,
    });
    expect(testRenderer.state().viewport.toArray()).toEqual([10, 20, 100, 200]);
    expect(testRenderer.state().scissor.toArray()).toEqual([4, 5, 80, 90]);
    originalTarget.dispose();
    capture.dispose();
  });
});
