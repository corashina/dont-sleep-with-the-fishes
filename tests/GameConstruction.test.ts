// @vitest-environment jsdom
// Importance: 8/10 (scaled from 4/5). Protects construction rollback and ownership.

import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import type { PhaseResourceSource } from '../src/app/PhaseResources';
import { AudioSystem } from '../src/audio/AudioSystem';

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
      'high',
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
});
