// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PropModelLibrary } from '../src/world/PropModelLibrary';
import type { ShipFurnitureLibrary } from '../src/world/ShipFurnitureLibrary';
import type { SkyAssets } from '../src/world/SkyAssets';
import type { LifeboatAssets } from '../src/world/LifeboatAssets';
import type { ShipAssets } from '../src/world/ShipAssets';
import { testPhysicsRuntime } from './helpers/physics';

const physicsRuntime = await testPhysicsRuntime();

const constructionMocks = vi.hoisted(() => ({
  WebGLRenderer: vi.fn(),
  createSceneRenderer: vi.fn(),
}));

vi.mock('three', async (importOriginal) => ({
  ...await importOriginal<typeof import('three')>(),
  WebGLRenderer: constructionMocks.WebGLRenderer,
}));

vi.mock('../src/rendering/PostProcessingPipeline', async (importOriginal) => ({
  ...await importOriginal<typeof import('../src/rendering/PostProcessingPipeline')>(),
  createSceneRenderer: constructionMocks.createSceneRenderer,
}));

describe('Game construction rollback', () => {
  beforeEach(() => {
    vi.resetModules();
    constructionMocks.WebGLRenderer.mockReset();
    constructionMocks.createSceneRenderer.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts with low visual quality and preserves renderer setup errors during cleanup', async () => {
    const calls: string[] = [];
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'remove').mockImplementation(() => calls.push('canvas'));
    const renderer = {
      domElement: canvas,
      shadowMap: { enabled: false, type: 0 },
      dispose: vi.fn(() => calls.push('renderer')),
    };
    constructionMocks.WebGLRenderer.mockReturnValue(renderer);
    const sceneRenderer = {
      render: vi.fn(),
      resize: vi.fn(),
      setVisualQuality: vi.fn(),
      dispose: vi.fn(() => calls.push('sceneRenderer')),
    };
    constructionMocks.createSceneRenderer.mockReturnValue(sceneRenderer);
    const { Game } = await import('../src/Game');

    let thrown: unknown;
    try {
      new Game(
        document.createElement('main'),
        {} as PropModelLibrary,
        {} as ShipFurnitureLibrary,
        {} as SkyAssets,
        {} as LifeboatAssets,
        {} as ShipAssets,
        physicsRuntime,
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(TypeError);
    expect((thrown as Error).message).toContain('getMaxAnisotropy');
    expect(constructionMocks.createSceneRenderer).toHaveBeenCalledWith(renderer, 'low');
    expect(calls).toEqual(['sceneRenderer', 'renderer', 'canvas']);
    expect(sceneRenderer.dispose).toHaveBeenCalledOnce();
    expect(renderer.dispose).toHaveBeenCalledOnce();
  });
});
