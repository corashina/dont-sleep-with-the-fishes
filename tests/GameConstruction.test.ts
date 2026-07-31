// @vitest-environment jsdom
// Importance: 4/5. Protects construction rollback and ownership.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PropModelLibrary } from '../src/world/PropModelLibrary';
import type { ShipFurnitureLibrary } from '../src/world/ShipFurnitureLibrary';
import type { SkyAssets } from '../src/world/SkyAssets';
import type { LifeboatAssets } from '../src/world/LifeboatAssets';
import type { ShipAssets } from '../src/world/ShipAssets';
import type { PhaseContext } from '../src/app/GamePhase';
import type { EventModelLibrary } from '../src/survival/EventModelLibrary';
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
        {} as EventModelLibrary,
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

  it('shares and disposes the loaded event model library once', async () => {
    const canvas = document.createElement('canvas');
    const renderer = {
      domElement: canvas,
      capabilities: { getMaxAnisotropy: () => 1 },
      setPixelRatio: vi.fn(),
      setSize: vi.fn(),
      render: vi.fn(),
      dispose: vi.fn(),
    };
    const eventModels = {
      create: vi.fn(),
      animations: vi.fn(() => []),
      dispose: vi.fn(),
    } as unknown as EventModelLibrary;
    let phaseContext: PhaseContext | undefined;
    const { Game } = await import('../src/Game');
    const game = Game.forTest({
      createScavenge: (context) => {
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
      supernaturalEventModels: eventModels,
      shipFurniture: { dispose: vi.fn() } as unknown as ShipFurnitureLibrary,
      skyAssets: { dispose: vi.fn() } as unknown as SkyAssets,
      physicsRuntime,
      mount: document.createElement('main'),
      renderer: renderer as never,
    });

    expect(phaseContext?.supernaturalEventModels).toBe(eventModels);
    game.dispose();
    game.dispose();
    expect(eventModels.dispose).toHaveBeenCalledOnce();
  });
});
