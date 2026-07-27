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

  it('preserves the renderer setup error while cleaning up direct rendering', async () => {
    const calls: string[] = [];
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
    expect(calls).toEqual(['renderer', 'canvas']);
    expect(disposeSceneRenderer).toHaveBeenCalledOnce();
    expect(renderer.dispose).toHaveBeenCalledOnce();
  });
});
