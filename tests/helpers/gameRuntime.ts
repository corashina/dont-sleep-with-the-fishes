import { PerspectiveCamera, type Clock, type WebGLRenderer } from 'three';
import { Game, type GameFactories } from '../../src/Game';
import type { GameRuntimeDependencies } from '../../src/app/GameRuntimeDependencies';
import type { BrowserPlaytestStartup } from '../../src/app/BrowserPlaytest';
import type { PhaseResourceSource } from '../../src/app/PhaseResources';
import type { SurvivalSaveStorage } from '../../src/browser/SurvivalSaveStore';
import { DirectSceneRenderer, type SceneRenderer } from '../../src/rendering/SceneRenderer';
import { createAntiAliasingQualityPreference, type AntiAliasingQualityPreference } from '../../src/rendering/antiAliasingQuality';
import { createShadowQualityPreference, type ShadowQualityPreference } from '../../src/rendering/shadowQuality';
import { createVisualQualityPreference, type VisualQualityPreference } from '../../src/rendering/visualQuality';
import { createWaterQualityPreference, type WaterQuality } from '../../src/rendering/waterQuality';
import { createSystemTuningPreference, type SystemTuningPreference } from '../../src/ui/systemTuningPreference';

type GameClock = Pick<Clock, 'start' | 'getDelta'>;
export interface GameRuntimeTestOptions {
  resources: PhaseResourceSource;
  clock?: GameClock;
  createSeed?: () => number;
  mount?: HTMLElement;
  renderer?: WebGLRenderer;
  sceneRenderer?: SceneRenderer;
  antiAliasingQuality?: AntiAliasingQualityPreference;
  shadowQuality?: ShadowQualityPreference;
  visualQuality?: VisualQualityPreference;
  initialWaterQuality?: WaterQuality;
  systemTuning?: SystemTuningPreference;
  onFatalError?: (error: unknown) => void;
  saveStorage?: SurvivalSaveStorage | null;
  browserPlaytest?: BrowserPlaytestStartup | null;
}

function createTestRenderer(): WebGLRenderer {
  return {
    domElement: document.createElement('canvas'),
    setPixelRatio: () => undefined,
    setSize: () => undefined,
    render: () => undefined,
    initTexture: () => undefined,
    compileAsync: async () => undefined,
    dispose: () => undefined,
    shadowMap: { enabled: true, type: 0 },
    capabilities: { getMaxAnisotropy: () => 1 },
  } as unknown as WebGLRenderer;
}

function createTestClock(): GameClock {
  return {
    start: () => undefined,
    getDelta: () => 0.016,
  };
}

export function createGameRuntimeDependencies(factories: GameFactories, options: GameRuntimeTestOptions): GameRuntimeDependencies {
  const mount = options.mount ?? document.createElement('main');
  const renderer = options.renderer ?? createTestRenderer();
  mount.prepend(renderer.domElement);
  const sceneRenderer = options.sceneRenderer ?? new DirectSceneRenderer(renderer);
  const systemTuning = options.systemTuning ?? createSystemTuningPreference(null);
  return {
    mount, renderer, sceneRenderer, systemTuning, factories,
    resources: options.resources, clock: options.clock ?? createTestClock(),
    camera: new PerspectiveCamera(systemTuning.get().cameraFieldOfView, 1, 0.08, 1000),
    ...createRenderPreferences(sceneRenderer, options),
    createWaterQuality: (apply) => {
      const preference = createWaterQualityPreference(apply, null);
      if (options.initialWaterQuality !== undefined) preference.set(options.initialWaterQuality);
      return preference;
    },
    createSeed: options.createSeed ?? (() => 41),
    onFatalError: options.onFatalError ?? ((error) => { throw error; }),
    browserPlaytest: options.browserPlaytest ?? null,
    saveStorage: options.browserPlaytest == null ? options.saveStorage ?? null : null,
  };
}

export function createRuntimeTestGame(factories: GameFactories, options: GameRuntimeTestOptions): Game {
  return new Game(createGameRuntimeDependencies(factories, options));
}

function createRenderPreferences(sceneRenderer: SceneRenderer, options: GameRuntimeTestOptions) {
  return {
    antiAliasingQuality: options.antiAliasingQuality ?? createAntiAliasingQualityPreference((quality) => sceneRenderer.setAntiAliasingQuality?.(quality), null),
    shadowQuality: options.shadowQuality ?? createShadowQualityPreference((quality) => sceneRenderer.setShadowQuality?.(quality), null),
    visualQuality: options.visualQuality ?? createVisualQualityPreference((quality) => sceneRenderer.setVisualQuality?.(quality), null),
  };
}
