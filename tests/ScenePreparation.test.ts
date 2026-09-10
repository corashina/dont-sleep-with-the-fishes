import { describe, expect, it, vi } from 'vitest';
import {
  ACESFilmicToneMapping,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  Vector2,
  WebGLRenderTarget,
  type Camera,
  type Material,
  type Object3D,
  type WebGLRenderer,
} from 'three';
import { DirectSceneRenderer } from '../src/rendering/SceneRenderer';
import { PostProcessingPipeline } from '../src/rendering/PostProcessingPipeline';
import { ITEM_AMBIENT_OCCLUSION_LAYER } from '../src/rendering/ItemAmbientOcclusion';

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function rendererRig() {
  let target: WebGLRenderTarget | null = new WebGLRenderTarget(2, 2);
  const initialTarget = target;
  const compilations: {
    scene: Object3D;
    target: WebGLRenderTarget | null;
    materials: Material[];
    cameraLayerMask: number;
  }[] = [];
  const renderer = {
    capabilities: { maxTextureSize: 4096, maxSamples: 4 },
    shadowMap: { type: 0 },
    outputColorSpace: SRGBColorSpace,
    toneMapping: ACESFilmicToneMapping,
    toneMappingExposure: 1,
    getSize: (size: Vector2) => size.set(100, 100),
    getPixelRatio: () => 1,
    getRenderTarget: () => target,
    getActiveCubeFace: () => 3,
    getActiveMipmapLevel: () => 2,
    setRenderTarget: vi.fn((next: WebGLRenderTarget | null) => { target = next; }),
    compileAsync: vi.fn((scene: Object3D, camera: Camera) => {
      const materials: Material[] = [];
      scene.traverse((object) => {
        if (object instanceof Mesh) materials.push(...[object.material].flat());
      });
      compilations.push({ scene, target, materials, cameraLayerMask: camera.layers.mask });
      return Promise.resolve();
    }),
    render: vi.fn(),
  };
  return { renderer, initialTarget, compilations, webgl: renderer as unknown as WebGLRenderer };
}

const menu = { kind: 'menu', elapsedSeconds: 0 } as const;

describe('scene preparation', () => {
  it('compiles direct scenes and consumes a pending shadow-material refresh', async () => {
    const rig = rendererRig();
    const sceneRenderer = new DirectSceneRenderer(rig.webgl, 'low');
    const scene = new Scene();
    const material = new MeshStandardMaterial();
    const geometry = new PlaneGeometry();
    scene.add(new Mesh(geometry, material));
    const camera = new PerspectiveCamera();
    sceneRenderer.setShadowQuality('high');
    await sceneRenderer.prepare(scene, camera, menu);
    expect(rig.renderer.compileAsync).toHaveBeenCalledExactlyOnceWith(scene, camera);
    expect(rig.renderer.render).not.toHaveBeenCalled();
    const preparedVersion = material.version;
    expect(preparedVersion).toBeGreaterThan(0);
    sceneRenderer.render(scene, camera, menu);
    expect(material.version).toBe(preparedVersion);
    sceneRenderer.dispose();
    await sceneRenderer.prepare(scene, camera, menu);
    expect(rig.renderer.compileAsync).toHaveBeenCalledTimes(1);
    geometry.dispose();
    material.dispose();
    rig.initialTarget.dispose();
  });

  it('compiles scene and effect programs with their target settings without drawing', async () => {
    const rig = rendererRig();
    const pipeline = new PostProcessingPipeline(rig.webgl, 'high');
    const scene = new Scene();
    const material = new MeshStandardMaterial();
    const geometry = new PlaneGeometry();
    const mesh = new Mesh(geometry, material);
    scene.add(mesh);
    const camera = new PerspectiveCamera();
    camera.layers.enable(3);
    const originalLayerMask = camera.layers.mask;
    const gate = deferred();
    const capture = rig.renderer.compileAsync.getMockImplementation()!;
    rig.renderer.compileAsync.mockImplementation((value, view) => { void capture(value, view); return gate.promise; });
    let ready = false;
    const preparation = pipeline.prepare(scene, camera, menu).then(() => { ready = true; });
    expect(rig.renderer.getRenderTarget()).toBe(rig.initialTarget);
    expect(rig.renderer.setRenderTarget).toHaveBeenLastCalledWith(rig.initialTarget, 3, 2);
    expect(mesh.material).toBe(material);
    expect(camera.layers.mask).toBe(originalLayerMask);
    expect(rig.compilations[0]?.scene).toBe(scene);
    expect(rig.compilations[0]?.target?.texture.name).toBe('EffectComposer.rt2');
    expect(rig.compilations[0]?.materials).toContain(material);
    const sceneCompilations = rig.compilations.filter((entry) => entry.scene === scene);
    const normalCompilation = sceneCompilations.find((entry) => (
      entry.materials.some((value) => value.type === 'MeshNormalMaterial')
    ));
    expect(normalCompilation?.cameraLayerMask).toBe(1 << ITEM_AMBIENT_OCCLUSION_LAYER);
    expect(sceneCompilations.filter((entry) => entry !== normalCompilation).every((entry) => (
      entry.cameraLayerMask === originalLayerMask
    ))).toBe(true);
    const prepared = rig.compilations.flatMap((entry) => entry.materials);
    expect(prepared.some((value) => value.type === 'MeshNormalMaterial')).toBe(true);
    const output = prepared.find((value) => value.type === 'RawShaderMaterial');
    expect(output).toMatchObject({ defines: { SRGB_TRANSFER: '', ACES_FILMIC_TONE_MAPPING: '' } });
    expect(rig.compilations.find((entry) => entry.materials.includes(output!))?.target).toBeNull();
    expect(prepared.length).toBeGreaterThan(15);
    expect(rig.renderer.render).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(ready).toBe(false);
    gate.resolve();
    await preparation;
    expect(ready).toBe(true);
    pipeline.dispose();
    geometry.dispose();
    material.dispose();
    rig.initialTarget.dispose();
  });

  it('restores the target after a synchronous scheduling error', async () => {
    const rig = rendererRig();
    const pipeline = new PostProcessingPipeline(rig.webgl);
    const failure = new Error('compile failed');
    rig.renderer.compileAsync.mockImplementation(() => { throw failure; });
    const preparation = pipeline.prepare(new Scene(), new PerspectiveCamera(), menu);
    expect(rig.renderer.getRenderTarget()).toBe(rig.initialTarget);
    await expect(preparation).rejects.toBe(failure);
    expect(rig.renderer.render).not.toHaveBeenCalled();
    pipeline.dispose();
    rig.initialTarget.dispose();
  });

  it('waits for remaining programs before reporting a rejected compilation', async () => {
    const rig = rendererRig();
    const pipeline = new PostProcessingPipeline(rig.webgl);
    const failure = new Error('compile failed');
    const gate = deferred();
    rig.renderer.compileAsync.mockImplementation(() => gate.promise);
    rig.renderer.compileAsync.mockRejectedValueOnce(failure);
    const preparation = pipeline.prepare(new Scene(), new PerspectiveCamera(), menu);
    let settled = false;
    void preparation.catch(() => { settled = true; });
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(rig.renderer.getRenderTarget()).toBe(rig.initialTarget);
    gate.resolve();
    await expect(preparation).rejects.toBe(failure);
    pipeline.dispose();
    rig.initialTarget.dispose();
  });

  it('restores the camera layers and mesh material when AO scheduling throws', async () => {
    const rig = rendererRig();
    const pipeline = new PostProcessingPipeline(rig.webgl);
    const scene = new Scene();
    const mesh = new Mesh(new PlaneGeometry(), new MeshStandardMaterial());
    const material = mesh.material;
    scene.add(mesh);
    const camera = new PerspectiveCamera();
    camera.layers.enable(3);
    const originalLayerMask = camera.layers.mask;
    const failure = new Error('normal compile failed');
    const capture = rig.renderer.compileAsync.getMockImplementation()!;
    rig.renderer.compileAsync.mockImplementation((value, view) => {
      if (mesh.material.type === 'MeshNormalMaterial') {
        expect(view.layers.mask).toBe(1 << ITEM_AMBIENT_OCCLUSION_LAYER);
        throw failure;
      }
      return capture(value, view);
    });
    const preparation = pipeline.prepare(scene, camera, menu);
    expect(camera.layers.mask).toBe(originalLayerMask);
    expect(mesh.material).toBe(material);
    expect(rig.renderer.getRenderTarget()).toBe(rig.initialTarget);
    await expect(preparation).rejects.toBe(failure);
    pipeline.dispose();
    mesh.geometry.dispose();
    material.dispose();
    rig.initialTarget.dispose();
  });
});
