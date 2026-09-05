// @vitest-environment jsdom
// Importance: 8/10 (scaled from 4/5). Protects construction rollback and ownership.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PropModelLibrary } from '../src/world/PropModelLibrary';
import type { ShipFurnitureLibrary } from '../src/world/ShipFurnitureLibrary';
import type { SkyAssets } from '../src/world/SkyAssets';
import type { MenuPhaseContext } from '../src/app/GamePhase';
import type { MenuModelLibrary } from '../src/menu/MenuModelLibrary';
import type { MenuSandAssets } from '../src/menu/MenuSandAssets';
import { createTestGame, flushPhases } from './helpers/game';
import type { PhaseResourceSource } from '../src/app/PhaseResources';
import { AudioSystem } from '../src/audio/AudioSystem';
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

  it('classifies renderer construction errors as WebGL initialization failures', async () => {
    const cause = new Error('WebGL context failed');
    constructionMocks.WebGLRenderer.mockImplementation(() => { throw cause; });
    const { Game, WebGlInitializationError } = await import('../src/Game');

    expect(() => new Game(
      document.createElement('main'),
      {} as PhaseResourceSource,
    )).toThrow(WebGlInitializationError);
  }, 10_000);

  it('starts with default quality and preserves renderer setup errors during cleanup', async () => {
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
        { audio: AudioSystem.silent(), physicsMode: 'enabled' } as PhaseResourceSource,
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(TypeError);
    expect((thrown as Error).message).toContain('getMaxAnisotropy');
    expect(constructionMocks.createSceneRenderer).toHaveBeenCalledWith(
      renderer,
      'medium',
      'low',
      'high',
    );
    expect(calls).toEqual([
      'sceneRenderer',
      'renderer',
      'canvas',
    ]);
    expect(sceneRenderer.dispose).toHaveBeenCalledOnce();
    expect(renderer.dispose).toHaveBeenCalledOnce();
  }, 30_000);

  it('shares and disposes menu assets once', async () => {
    const canvas = document.createElement('canvas');
    const renderer = {
      domElement: canvas,
      capabilities: { getMaxAnisotropy: () => 1 },
      setPixelRatio: vi.fn(),
      setSize: vi.fn(),
      render: vi.fn(),
      dispose: vi.fn(),
      shadowMap: { enabled: true, type: 0 },
    };
    const menuModels = { dispose: vi.fn() } as unknown as MenuModelLibrary;
    const menuSandAssets = {
      configure: vi.fn(),
      dispose: vi.fn(),
    } as unknown as MenuSandAssets;
    let phaseContext: MenuPhaseContext | undefined;
    const game = createTestGame({
      createScavenge: () => { throw new Error("Unexpected ship"); },
      createMenu: (context) => {
        phaseContext = context;
        return {
          start: vi.fn(),
          update: vi.fn(),
          resize: vi.fn(),
          render: vi.fn(),
          dispose: vi.fn(),
        };
      },
      createSurvival: () => {
        throw new Error('Unexpected survival construction');
      },
    }, {
      propModels: { dispose: vi.fn() } as unknown as PropModelLibrary,
      shipFurniture: { dispose: vi.fn() } as unknown as ShipFurnitureLibrary,
      skyAssets: { dispose: vi.fn() } as unknown as SkyAssets,
      menuModels,
      menuSandAssets,
      physicsRuntime,
      mount: document.createElement('main'),
      renderer: renderer as never,
    });

    await flushPhases();
    expect(phaseContext?.menuModels).toBe(menuModels);
    expect(phaseContext?.menuSandAssets).toBe(menuSandAssets);
    expect(menuSandAssets.configure).toHaveBeenCalledWith(1);
    game.dispose();
    game.dispose();
    expect(menuModels.dispose).toHaveBeenCalledOnce();
    expect(menuSandAssets.dispose).toHaveBeenCalledOnce();
  });
});
