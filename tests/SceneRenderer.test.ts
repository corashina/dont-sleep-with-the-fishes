import { PerspectiveCamera, Scene, type WebGLRenderer } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { DirectSceneRenderer } from '../src/rendering/SceneRenderer';

describe('direct scene renderer', () => {
  it('renders directly until disposal and ignores resize and quality calls', () => {
    const renderer = { render: vi.fn() } as unknown as WebGLRenderer;
    const sceneRenderer = new DirectSceneRenderer(renderer);
    const scene = new Scene();
    const camera = new PerspectiveCamera();

    sceneRenderer.resize(1280, 720, 2);
    sceneRenderer.setVisualQuality?.('high');
    sceneRenderer.render(scene, camera, {
      kind: 'scavenge', elapsedSeconds: 0, sinkingProgress: 0,
    });
    expect(renderer.render).toHaveBeenCalledWith(scene, camera);

    sceneRenderer.dispose();
    sceneRenderer.resize(1, 1, 1);
    sceneRenderer.setVisualQuality?.('low');
    sceneRenderer.render(scene, camera, {
      kind: 'scavenge', elapsedSeconds: 1, sinkingProgress: 0,
    });
    expect(renderer.render).toHaveBeenCalledOnce();
  });
});
