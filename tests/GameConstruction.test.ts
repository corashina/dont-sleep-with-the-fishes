// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PropModelLibrary } from '../src/world/PropModelLibrary';
import type { ShipFurnitureLibrary } from '../src/world/ShipFurnitureLibrary';
import type { SkyAssets } from '../src/world/SkyAssets';

const constructionMocks = vi.hoisted(() => ({
  createSceneRenderer: vi.fn(),
  WebGLRenderer: vi.fn(),
}));

vi.mock('three', async (importOriginal) => ({
  ...await importOriginal<typeof import('three')>(),
  WebGLRenderer: constructionMocks.WebGLRenderer,
}));

vi.mock('../src/rendering/PostProcessingPipeline', () => ({
  createSceneRenderer: constructionMocks.createSceneRenderer,
}));

describe('Game construction rollback', () => {
  beforeEach(() => {
    vi.resetModules();
    constructionMocks.createSceneRenderer.mockReset();
    constructionMocks.WebGLRenderer.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('preserves the construction error while continuing scene-renderer cleanup', async () => {
    const calls: string[] = [];
    const constructionError = new Error('matchMedia construction failed');
    const cleanupError = new Error('scene renderer cleanup failed');
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'remove').mockImplementation(() => calls.push('canvas'));
    const renderer = {
      domElement: canvas,
      shadowMap: { enabled: false, type: 0 },
      dispose: vi.fn(() => calls.push('renderer')),
    };
    const sceneRenderer = {
      render: vi.fn(),
      resize: vi.fn(),
      dispose: vi.fn(() => {
        calls.push('sceneRenderer');
        throw cleanupError;
      }),
    };
    constructionMocks.WebGLRenderer.mockReturnValue(renderer);
    constructionMocks.createSceneRenderer.mockReturnValue(sceneRenderer);
    const originalMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => {
        throw constructionError;
      }),
    });
    const { Game } = await import('../src/Game');

    let thrown: unknown;
    try {
      new Game(
        document.createElement('main'),
        {} as PropModelLibrary,
        {} as ShipFurnitureLibrary,
        {} as SkyAssets,
      );
    } catch (error) {
      thrown = error;
    } finally {
      if (originalMatchMedia) {
        Object.defineProperty(window, 'matchMedia', originalMatchMedia);
      } else {
        Reflect.deleteProperty(window, 'matchMedia');
      }
    }

    expect(thrown).toBe(constructionError);
    expect(calls).toEqual(['sceneRenderer', 'renderer', 'canvas']);
    expect(sceneRenderer.dispose).toHaveBeenCalledOnce();
    expect(renderer.dispose).toHaveBeenCalledOnce();
  });
});
