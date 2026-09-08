// Importance: 10/10. Protects water capture state, sizing, and reflection projection.
import {
  BufferGeometry,
  Camera,
  Matrix4,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  Scene,
  Vector4,
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OceanCapture } from '../src/ocean/OceanCapture';

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

  it('captures color, depth, and reflection at a capped half resolution', () => {
    const capture = new OceanCapture();
    const testRenderer = createRenderer();
    const { scene, water, camera } = createSceneInput();
    testRenderer.setWater(water);

    capture.update(testRenderer.renderer, scene, camera, water);

    expect(capture.colorTexture.image).toMatchObject({ width: 1024, height: 576 });
    expect(capture.depthTexture.image).toMatchObject({ width: 1024, height: 576 });
    expect(capture.reflectionTexture.image).toMatchObject({ width: 1024, height: 576 });
    expect(capture.reflectionDepthTexture.image).toMatchObject({ width: 1024, height: 576 });
    expect(testRenderer.records).toHaveLength(2);
    expect(testRenderer.records[0]).toMatchObject({ camera, waterVisible: false });
    expect(testRenderer.records[1]!.camera).not.toBe(camera);
    expect(testRenderer.records[1]!.camera.layers.mask).toBe(camera.layers.mask);
    expect(testRenderer.records[1]!.target!.depthTexture).toBe(capture.reflectionDepthTexture);
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

  it('skips capture while the scene uses an override material', () => {
    const capture = new OceanCapture();
    const testRenderer = createRenderer();
    const { scene, water, camera } = createSceneInput();
    testRenderer.setWater(water);
    const overrideMaterial = new MeshBasicMaterial();
    scene.overrideMaterial = overrideMaterial;

    capture.update(testRenderer.renderer, scene, camera, water);

    expect(testRenderer.renderer.render).not.toHaveBeenCalled();
    expect(water.visible).toBe(true);
    expect(scene.overrideMaterial).toBe(overrideMaterial);
    overrideMaterial.dispose();
    capture.dispose();
  });

  it('disposes each owned target and reflector geometry once', () => {
    const targetDispose = vi.spyOn(WebGLRenderTarget.prototype, 'dispose');
    const geometryDispose = vi.spyOn(BufferGeometry.prototype, 'dispose');
    const capture = new OceanCapture();

    capture.dispose();
    capture.dispose();

    expect(targetDispose).toHaveBeenCalledTimes(2);
    expect(geometryDispose).toHaveBeenCalledTimes(1);
  });

  it('does no work after disposal', () => {
    const capture = new OceanCapture();
    const testRenderer = createRenderer();
    const { scene, water, camera } = createSceneInput();
    testRenderer.setWater(water);
    capture.dispose();

    capture.update(testRenderer.renderer, scene, camera, water);

    expect(testRenderer.renderer.getRenderTarget).not.toHaveBeenCalled();
    expect(testRenderer.renderer.render).not.toHaveBeenCalled();
  });
});
