// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PropModelLibrary } from '../src/world/PropModelLibrary';
import type { ShipFurnitureLibrary } from '../src/world/ShipFurnitureLibrary';
import type { SkyAssets } from '../src/world/SkyAssets';

const constructionMocks = vi.hoisted(() => ({
  WebGLRenderer: vi.fn(),
}));

vi.mock('three', async (importOriginal) => ({
  ...await importOriginal<typeof import('three')>(),
  WebGLRenderer: constructionMocks.WebGLRenderer,
}));

describe('Game construction rollback', () => {
  beforeEach(() => {
    vi.resetModules();
    constructionMocks.WebGLRenderer.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('preserves the construction error while cleaning up direct rendering', async () => {
    const calls: string[] = [];
    const constructionError = new Error('matchMedia construction failed');
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'remove').mockImplementation(() => calls.push('canvas'));
    const renderer = {
      domElement: canvas,
      shadowMap: { enabled: false, type: 0 },
      dispose: vi.fn(() => calls.push('renderer')),
    };
    constructionMocks.WebGLRenderer.mockReturnValue(renderer);
    const { DirectSceneRenderer } = await import('../src/rendering/SceneRenderer');
    const disposeSceneRenderer = vi.spyOn(DirectSceneRenderer.prototype, 'dispose');
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
    expect(calls).toEqual(['renderer', 'canvas']);
    expect(disposeSceneRenderer).toHaveBeenCalledOnce();
    expect(renderer.dispose).toHaveBeenCalledOnce();
  });
});
