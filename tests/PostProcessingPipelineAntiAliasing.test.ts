// Importance: 9/10. Protects MSAA on the post-processing scene buffers.

import { describe, expect, it, vi } from 'vitest';
import { Vector2, type WebGLRenderer, type WebGLRenderTarget } from 'three';
import { PostProcessingPipeline } from '../src/rendering/PostProcessingPipeline';

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
