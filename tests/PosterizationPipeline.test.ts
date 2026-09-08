import { Camera, Scene, Vector2, type WebGLRenderer } from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { HoverOutlinePass, OutlineMaskCapturePass } from '../src/rendering/HoverOutlinePass';
import { ItemAmbientOcclusionPass } from '../src/rendering/ItemAmbientOcclusion';
import { expect, it, vi } from 'vitest';
import { PostProcessingPipeline } from '../src/rendering/PostProcessingPipeline';
import { BinocularMaskPass } from '../src/rendering/BinocularMaskPass';
import { PosterizationPass } from '../src/rendering/PosterizationPass';

vi.mock('three/addons/postprocessing/EffectComposer.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three/addons/postprocessing/EffectComposer.js')>();
  return { EffectComposer: vi.fn(function (renderer, target) {
    const composer = new actual.EffectComposer(renderer, target);
    vi.spyOn(composer, 'render').mockImplementation(() => undefined);
    return composer;
  }) };
});

it('defaults to 25 percent and preserves posterization through scene and quality changes', () => {
  const renderer = {
    capabilities: { maxTextureSize: 4096, maxSamples: 4 },
    getSize: (target: Vector2) => target.set(640, 360),
    getPixelRatio: () => 1,
  } as unknown as WebGLRenderer;
  const pipeline = new PostProcessingPipeline(renderer, 'high');
  const composer = vi.mocked(EffectComposer).mock.results.at(-1)!.value as EffectComposer;
  const bloom = composer.passes.find((pass) => pass instanceof UnrealBloomPass) as UnrealBloomPass;
  const outputIndex = composer.passes.findIndex((pass) => pass instanceof OutputPass);
  const filters = composer.passes.slice(outputIndex + 1, -1);
  const controls = pipeline.postProcessingControls;
  const scene = new Scene();
  const camera = new Camera();
  try {
    expect(filters).toHaveLength(1);
    const posterization = filters[0] as PosterizationPass;
    expect(posterization).toBeInstanceOf(PosterizationPass);
    expect(posterization.uniforms.strength!.value).toBe(.25);
    expect(composer.passes.at(-1)).toBeInstanceOf(BinocularMaskPass);
    expect(posterization.enabled).toBe(true);
    pipeline.render(scene, camera, { kind: 'menu', elapsedSeconds: 0 });
    const originalMenuBloom = bloom.strength;
    expect(bloom.enabled).toBe(true);
    controls.setPosterization({ enabled: true, strength: .7 });
    expect(bloom.strength).toBe(originalMenuBloom);
    pipeline.render(scene, camera, { kind: 'survival', elapsedSeconds: 2, phase: 'night', weather: 'squall' });
    pipeline.setVisualQuality('low');
    pipeline.resize(1280, 720, 1);
    expect(bloom.enabled).toBe(false);
    expect(filters[0]!.enabled).toBe(true);
    expect(controls.getState().posterization).toEqual({ enabled: true, strength: .7 });
    controls.setPosterization({ enabled: false, strength: .7 });
    expect(bloom.enabled).toBe(false);
    expect(filters.every((pass) => !pass.enabled)).toBe(true);
    controls.setPosterization({ enabled: true, strength: 0 });
    expect(posterization.enabled).toBe(false);
    pipeline.setVisualQuality('high');
    pipeline.render(scene, camera, { kind: 'menu', elapsedSeconds: 3 });
    expect(bloom.enabled).toBe(true);
    expect(bloom.strength).toBe(originalMenuBloom);
  } finally {
    const disposal = filters.map((pass) => vi.spyOn(pass, 'dispose'));
    pipeline.dispose();
    pipeline.dispose();
    for (const dispose of disposal) expect(dispose).toHaveBeenCalledOnce();
  }
});

it.each([true, false])('keeps capture before AO through resize (AO available: %s)', (aoAvailable) => {
  const renderer = {
    capabilities: { maxTextureSize: 4096, maxSamples: 4 },
    getSize: (target: Vector2) => target.set(640, 360),
    getPixelRatio: () => 1,
  } as unknown as WebGLRenderer;
  const pipeline = new PostProcessingPipeline(renderer, 'high', 'low', (mode, quality) => {
    if (!aoAvailable) throw new Error('AO unavailable');
    return new ItemAmbientOcclusionPass(mode, quality);
  }, vi.fn());
  const composer = vi.mocked(EffectComposer).mock.results.at(-1)!.value as EffectComposer;
  const checkOrder = () => {
    expect(composer.passes[0]).toBeInstanceOf(RenderPass);
    expect(composer.passes[1]).toBeInstanceOf(OutlineMaskCapturePass);
    if (aoAvailable) expect(composer.passes[2]).toBeInstanceOf(ItemAmbientOcclusionPass);
    expect(composer.passes[aoAvailable ? 3 : 2]).toBeInstanceOf(HoverOutlinePass);
    expect(composer.renderTarget1.resolveDepthBuffer).toBe(true);
    expect(composer.renderTarget2.resolveDepthBuffer).toBe(true);
    expect(composer.renderTarget1.depthTexture).toBe(null);
    expect(composer.renderTarget2.depthTexture).toBe(null);
  };
  try {
    checkOrder();
    pipeline.resize(1280, 720, 1);
    checkOrder();
    pipeline.setAntiAliasingQuality('high');
    pipeline.resize(640, 360, 2);
    checkOrder();
  } finally { pipeline.dispose(); }
});
