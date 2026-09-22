import { Clock, PerspectiveCamera, SRGBColorSpace, WebGLRenderer } from 'three';
import { Game, type GameFactories } from '../Game';
import { MainMenuPhase } from '../phases/MainMenuPhase';
import { ScavengePhase } from '../phases/ScavengePhase';
import { SurvivalPhase } from '../survival/SurvivalPhase';
import { createSceneRenderer } from '../rendering/PostProcessingPipeline';
import type { SceneRenderer } from '../rendering/SceneRenderer';
import { createAntiAliasingQualityPreference } from '../rendering/antiAliasingQuality';
import { createShadowQualityPreference } from '../rendering/shadowQuality';
import { createVisualQualityPreference } from '../rendering/visualQuality';
import { createWaterQualityPreference } from '../rendering/waterQuality';
import { createSystemTuningPreference } from '../ui/systemTuningPreference';
import { browserStorage } from '../browser/storage';
import type { SurvivalSaveStorage } from '../browser/SurvivalSaveStore';
import { runCleanupSteps } from '../world/SceneResources';
import type { PhaseResourceSource } from './PhaseResources';
import type { BrowserPlaytestStartup } from './BrowserPlaytest';
import type { GameRuntimeDependencies } from './GameRuntimeDependencies';

const PRODUCTION_FACTORIES: GameFactories = {
  createMenu: (context, onComplete) => (
    new MainMenuPhase(context, onComplete)
  ),
  createScavenge: (context, onComplete, onRestart, onReturnToMenu, start) => (
    new ScavengePhase(context, onComplete, onRestart, onReturnToMenu, start)
  ),
  createSurvival: (
    context,
    start,
    onRestart,
    onCheckpointChange,
    onReturnToMenu,
  ) => (
    new SurvivalPhase(
      context,
      start,
      onRestart,
      onCheckpointChange,
      onReturnToMenu,
    )
  ),
};

export const GAME_CAMERA = Object.freeze({
  fov: 80,
  near: 0.08,
  far: 1000,
});

function createRandomSeed(): number {
  try {
    const values = new Uint32Array(1);
    globalThis.crypto.getRandomValues(values);
    return values[0]!;
  } catch {
    return Date.now() >>> 0;
  }
}

export class WebGlInitializationError extends Error {
  constructor(cause: unknown) {
    const message = cause instanceof Error ? cause.message : String(cause);
    super(message, { cause });
    this.name = 'WebGlInitializationError';
  }
}

export function createBrowserGame(mount: HTMLElement, resources: PhaseResourceSource,
  onFatalError: (error: unknown) => void, browserPlaytest: BrowserPlaytestStartup | null): Game {
  let renderer: WebGLRenderer;
  try { renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); }
  catch (error) { throw new WebGlInitializationError(error); }
  let sceneRenderer: SceneRenderer | null = null;
  let transferred = false;
  try {
    const visualQuality = createVisualQualityPreference((quality) => sceneRenderer?.setVisualQuality?.(quality));
    const antiAliasingQuality = createAntiAliasingQualityPreference((quality) => sceneRenderer?.setAntiAliasingQuality?.(quality));
    const shadowQuality = createShadowQualityPreference((quality) => sceneRenderer?.setShadowQuality?.(quality));
    const systemTuning = createSystemTuningPreference();
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    mount.prepend(renderer.domElement);
    sceneRenderer = createSceneRenderer(renderer, visualQuality.get(), antiAliasingQuality.get(), shadowQuality.get());
    const dependencies: GameRuntimeDependencies = {
      mount, renderer, sceneRenderer, visualQuality, antiAliasingQuality, shadowQuality, systemTuning,
      camera: new PerspectiveCamera(systemTuning.get().cameraFieldOfView, 1, GAME_CAMERA.near, GAME_CAMERA.far),
      clock: new Clock(), resources,
      saveStorage: browserPlaytest === null ? browserStorage() as SurvivalSaveStorage | null : null,
      factories: PRODUCTION_FACTORIES, createSeed: createRandomSeed, onFatalError, browserPlaytest,
      createWaterQuality: (apply) => createWaterQualityPreference(apply, browserStorage()),
    };
    transferred = true;
    return new Game(dependencies);
  } catch (error) {
    if (!transferred) {
      try { runCleanupSteps([() => sceneRenderer?.dispose(), () => renderer.dispose(), () => renderer.domElement.remove()]); }
      finally { throw error; }
    }
    throw error;
  }
}
