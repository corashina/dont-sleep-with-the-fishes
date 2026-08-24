// Importance: 9/10. Protects MSAA on the post-processing scene buffers.

import { describe, expect, it, vi } from 'vitest';
import {
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import {
  HoverOutlinePass,
  PostProcessingPipeline,
} from '../src/rendering/PostProcessingPipeline';

function rendererWithMaximumSamples(maxSamples: number): WebGLRenderer {
  return {
    capabilities: { maxTextureSize: 4_096, maxSamples },
    getSize: (target: Vector2) => target.set(800, 600),
    getPixelRatio: () => 1,
  } as unknown as WebGLRenderer;
}

function composerTargets(pipeline: PostProcessingPipeline): readonly WebGLRenderTarget[] {
  const composer = (pipeline as unknown as {
    composer: {
      renderTarget1: WebGLRenderTarget;
      renderTarget2: WebGLRenderTarget;
    };
  }).composer;
  return [composer.renderTarget1, composer.renderTarget2];
}

describe('PostProcessingPipeline anti-aliasing', () => {
  it('uses the ocean shader while building outline depth', () => {
    const scene = new Scene();
    const camera = new PerspectiveCamera();
    const geometry = new PlaneGeometry();
    const oceanMaterial = new ShaderMaterial();
    const ocean = new Mesh(geometry, oceanMaterial);
    const selected = new Mesh(geometry, new ShaderMaterial());
    scene.add(ocean, selected);
    const pass = new HoverOutlinePass(new Vector2(16, 16), scene, camera);
    pass.selectedObjects = [selected];

    const depthRenders: Array<{
      colorWrite: boolean;
      overrideMaterial: Scene['overrideMaterial'];
    }> = [];
    const renderer = {
      autoClear: true,
      state: { buffers: { stencil: { setTest: vi.fn() } } },
      getClearColor: vi.fn((target) => target.setHex(0x000000)),
      getClearAlpha: vi.fn(() => 1),
      setClearColor: vi.fn(),
      setRenderTarget: vi.fn(),
      clear: vi.fn(),
      render: vi.fn(() => {
        depthRenders.push({
          colorWrite: oceanMaterial.colorWrite,
          overrideMaterial: scene.overrideMaterial,
        });
      }),
    } as unknown as WebGLRenderer;
    const internals = pass as unknown as {
      _fsQuad: { render: (renderer: WebGLRenderer) => void };
    };
    vi.spyOn(internals._fsQuad, 'render').mockImplementation(() => undefined);
    const writeBuffer = new WebGLRenderTarget(16, 16);
    const readBuffer = new WebGLRenderTarget(16, 16);

    pass.render(renderer, writeBuffer, readBuffer, 0, false);

    expect(depthRenders[0]).toEqual({
      colorWrite: false,
      overrideMaterial: null,
    });
    expect(depthRenders[1]?.overrideMaterial).toBe(pass.prepareMaskMaterial);
    expect(oceanMaterial.colorWrite).toBe(true);

    writeBuffer.dispose();
    readBuffer.dispose();
    pass.dispose();
    geometry.dispose();
    oceanMaterial.dispose();
    selected.material.dispose();
  });

  it('keeps the item outline pass in the MSAA pipeline', () => {
    const pipeline = new PostProcessingPipeline(
      rendererWithMaximumSamples(8),
      'low',
      'high',
      () => { throw new Error('AO disabled for test'); },
      () => undefined,
    );
    const internals = pipeline as unknown as {
      outlinePass: OutlinePass;
      composer: { passes: readonly unknown[] };
    };

    expect(internals.outlinePass).toBeInstanceOf(HoverOutlinePass);
    expect(internals.outlinePass).toBeInstanceOf(OutlinePass);
    expect(internals.composer.passes).toContain(internals.outlinePass);
    expect(internals.outlinePass.edgeStrength).toBe(5);
    expect(internals.outlinePass.edgeThickness).toBe(4);
    pipeline.dispose();
  });

  it('uses two samples on Low and rebuilds both targets with four on High', () => {
    const pipeline = new PostProcessingPipeline(
      rendererWithMaximumSamples(8),
      'low',
      'low',
      () => { throw new Error('AO disabled for test'); },
      () => undefined,
    );
    const targets = composerTargets(pipeline);
    const dispose = targets.map((target) => vi.spyOn(target, 'dispose'));

    expect(targets.map(({ samples }) => samples)).toEqual([2, 2]);

    pipeline.setAntiAliasingQuality('high');

    expect(targets.map(({ samples }) => samples)).toEqual([4, 4]);
    expect(dispose[0]).toHaveBeenCalledOnce();
    expect(dispose[1]).toHaveBeenCalledOnce();
    pipeline.dispose();
  });

  it('limits High to the GPU sample count', () => {
    const pipeline = new PostProcessingPipeline(
      rendererWithMaximumSamples(2),
      'low',
      'high',
      () => { throw new Error('AO disabled for test'); },
      () => undefined,
    );

    expect(composerTargets(pipeline).map(({ samples }) => samples)).toEqual([2, 2]);
    pipeline.dispose();
  });
});
