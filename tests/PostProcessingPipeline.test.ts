import { describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera, Scene, type WebGLRenderer } from 'three';
import { createSceneRenderer } from '../src/rendering/PostProcessingPipeline';
import { PrintShader } from '../src/rendering/PrintShader';

describe('post-processing pipeline construction', () => {
  it('falls back to direct rendering when pipeline construction throws', () => {
    const render = vi.fn();
    const renderer = { render } as unknown as WebGLRenderer;
    const failure = new Error('composer unavailable');
    const reportFallback = vi.fn();
    const sceneRenderer = createSceneRenderer(
      renderer,
      () => { throw failure; },
      reportFallback,
    );
    const scene = new Scene();
    const camera = new PerspectiveCamera();

    sceneRenderer.render(scene, camera, {
      kind: 'scavenge', elapsedSeconds: 0, sinkingProgress: 0, reducedMotion: false,
    });

    expect(reportFallback).toHaveBeenCalledWith(failure);
    expect(render).toHaveBeenCalledWith(scene, camera);
    sceneRenderer.dispose();
    sceneRenderer.render(scene, camera, {
      kind: 'scavenge', elapsedSeconds: 1, sinkingProgress: 0, reducedMotion: false,
    });
    expect(render).toHaveBeenCalledOnce();
  });

  it('returns the constructed pipeline when setup succeeds', () => {
    const pipeline = { render: vi.fn(), resize: vi.fn(), dispose: vi.fn() };
    const renderer = {} as WebGLRenderer;
    expect(createSceneRenderer(renderer, () => pipeline, vi.fn())).toBe(pipeline);
  });

  it('defines CSS-pixel screen-space sampling without remote textures', () => {
    expect(PrintShader.uniforms.uPixelRatio.value).toBe(1);
    expect(PrintShader.fragmentShader).toContain('gl_FragCoord.xy / uPixelRatio');
    expect(PrintShader.fragmentShader).toContain('uChromaticAberrationCssPixels * uPixelRatio');
    expect(PrintShader.fragmentShader).not.toMatch(/https?:\/\//);
  });
});
