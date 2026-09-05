import {
  Clock,
  PerspectiveCamera,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three';
import type { GamePhase, PhaseContext, MenuPhaseContext, ShipPhaseContext, SurvivalPhaseContext } from './app/GamePhase';
import {
  EVENT_TEST_OPTIONS,
  createEventTestResult,
} from './app/EventTest';
import type { ScavengeResult } from './game/ScavengeSession';
import { ScavengePhase, type ScavengePhaseStart } from './phases/ScavengePhase';
import {
  DirectSceneRenderer,
  type SceneRenderer,
} from './rendering/SceneRenderer';
import { createSceneRenderer } from './rendering/PostProcessingPipeline';
import {
  createAntiAliasingQualityPreference,
  type AntiAliasingQualityPreference,
} from './rendering/antiAliasingQuality';
import {
  createShadowQualityPreference,
  type ShadowQualityPreference,
} from './rendering/shadowQuality';
import {
  createVisualQualityPreference,
  type VisualQualityPreference,
} from './rendering/visualQuality';
import {
  createWaterQualityPreference,
  type WaterQualityPreference,
} from './rendering/waterQuality';
import { SurvivalPhase } from './survival/SurvivalPhase';
import { PerformanceStats } from './ui/PerformanceStats';
import { PostProcessingConsole } from './ui/PostProcessingConsole';
import { SettingsMenu } from './ui/SettingsMenu';
import {
  createSystemTuningPreference,
  type SystemTuningPreference,
} from './ui/systemTuningPreference';
import {
  clampPostProcessingSetting,
  type PostProcessingControls,
  type PostProcessingNumericSetting,
} from './rendering/postProcessingControls';
import type { ItemAmbientOcclusionMode } from './rendering/ItemAmbientOcclusion';
import { runCleanupSteps } from './world/SceneResources';
import {
  scavengePhysicsDebugMeshes,
  setScavengePhysicsDebugMeshes,
  setScavengePhysicsEnabled,
} from './physics/PhysicsOptions';
import type { PresentationWeatherId } from './weather/presentationWeather';
import { MainMenuPhase } from './phases/MainMenuPhase';
import type { SkyPhase } from './world/skyPalette';
import { browserStorage } from './browser/storage';
import {
  SurvivalSaveStore,
  type SurvivalSaveStorage,
} from './browser/SurvivalSaveStore';
import type {
  SurvivalCheckpointChange,
  SurvivalPhaseStart,
} from './survival/SurvivalPhase';
import type { BrowserPlaytestStartup } from './app/BrowserPlaytest';
import type { PhaseResourceSource, ResourceLease } from './app/PhaseResources';
import { createSystemScreen } from './ui/SystemScreen';

export interface GameFactories {
  createMenu(
    context: MenuPhaseContext,
    onComplete: () => void,
  ): GamePhase;
  createScavenge(
    context: ShipPhaseContext,
    onComplete: (result: Readonly<ScavengeResult>) => void,
    onRestart: () => void,
    onReturnToMenu: () => void,
    start: ScavengePhaseStart,
  ): GamePhase;
  createSurvival(
    context: SurvivalPhaseContext,
    start: SurvivalPhaseStart,
    onRestart: () => void,
    onCheckpointChange: SurvivalCheckpointChange,
    onReturnToMenu: () => void,
  ): GamePhase;
}

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

type GameClock = Pick<Clock, 'start' | 'getDelta'>;

interface TestGameBase {
  readonly mount: HTMLElement;
  readonly renderer: WebGLRenderer;
  readonly clock: GameClock;
  readonly sceneRenderer: SceneRenderer;
  readonly antiAliasingQuality: AntiAliasingQualityPreference;
  readonly shadowQuality: ShadowQualityPreference;
}

export const GAME_CAMERA = Object.freeze({
  fov: 80,
  near: 0.08,
  far: 1000,
});

export interface GameTestOptions {
  resources: PhaseResourceSource;
  clock?: GameClock;
  createSeed?: () => number;
  mount?: HTMLElement;
  renderer?: WebGLRenderer;
  sceneRenderer?: SceneRenderer;
  antiAliasingQuality?: AntiAliasingQualityPreference;
  shadowQuality?: ShadowQualityPreference;
  visualQuality?: VisualQualityPreference;
  waterQuality?: WaterQualityPreference;
  systemTuning?: SystemTuningPreference;
  onFatalError?: (error: unknown) => void;
  saveStorage?: SurvivalSaveStorage | null;
  browserPlaytest?: BrowserPlaytestStartup | null;
}

function rethrowFatalError(error: unknown): never {
  throw error;
}

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

function createTestGameBase(options: GameTestOptions): TestGameBase {
  const mount = options.mount ?? document.createElement('main');
  const renderer = options.renderer ?? createTestRenderer();
  mount.prepend(renderer.domElement);
  const sceneRenderer = options.sceneRenderer ?? new DirectSceneRenderer(renderer);
  return {
    mount,
    renderer,
    clock: options.clock ?? createTestClock(),
    sceneRenderer,
    antiAliasingQuality: options.antiAliasingQuality
      ?? createAntiAliasingQualityPreference(
        (quality) => sceneRenderer.setAntiAliasingQuality?.(quality),
        null,
      ),
    shadowQuality: options.shadowQuality ?? createShadowQualityPreference(
      (quality) => sceneRenderer.setShadowQuality?.(quality),
      null,
    ),
  };
}

function createTestRenderer(): WebGLRenderer {
  return {
    domElement: document.createElement('canvas'),
    setPixelRatio: () => undefined,
    setSize: () => undefined,
    render: () => undefined,
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

function valueOrCreate<T>(value: T | undefined, create: () => T): T {
  return value ?? create();
}

export class Game {
  ready!: Promise<void>;
  private renderer!: WebGLRenderer;
  private sceneRenderer!: SceneRenderer;
  private camera!: PerspectiveCamera;
  private clock!: GameClock;
  private resources!: PhaseResourceSource;
  private loading: HTMLElement | null = null;
  private systemTuning!: SystemTuningPreference;
  private context!: PhaseContext;
  private factories!: GameFactories;
  private activePhase: GamePhase | null = null;
  private activeLease: ResourceLease<unknown> | null = null;
  private performanceStats: PerformanceStats | null = null;
  private settingsMenu: SettingsMenu | null = null;
  private postProcessingConsole: PostProcessingConsole | null = null;
  private saveStore!: SurvivalSaveStore;
  private weatherOverride: PresentationWeatherId | null = null;
  private timeOfDayOverride: SkyPhase | null = null;
  private volumetricCloudsEnabled = false;
  private animationFrame = 0;
  private started = false;
  private disposed = false;
  private elapsed = 0;
  private seed = 0;
  private phaseGeneration = 0;
  private createSeed!: () => number;
  private onFatalError!: (error: unknown) => void;
  private fatalErrorReported = false;
  private onResize!: () => void;
  private animate!: () => void;

  constructor(
    mount: HTMLElement,
    resources: PhaseResourceSource,
    onFatalError: (error: unknown) => void = rethrowFatalError,
    browserPlaytest: BrowserPlaytestStartup | null = null,
  ) {
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance',
      });
    } catch (error) {
      throw new WebGlInitializationError(error);
    }
    let sceneRenderer: SceneRenderer | null = null;
    const visualQuality = createVisualQualityPreference((quality) => {
      sceneRenderer?.setVisualQuality?.(quality);
      this.activePhase?.setVisualQuality?.(quality);
    });
    const antiAliasingQuality = createAntiAliasingQualityPreference((quality) => {
      sceneRenderer?.setAntiAliasingQuality?.(quality);
    });
    const shadowQuality = createShadowQualityPreference((quality) => {
      sceneRenderer?.setShadowQuality?.(quality);
    });
    const waterQuality = createWaterQualityPreference((quality) => {
      this.activePhase?.setWaterQuality?.(quality);
    });
    const systemTuning = createSystemTuningPreference();
    const tuningState = systemTuning.get();
    let initializationStarted = false;
    try {
      renderer.outputColorSpace = SRGBColorSpace;
      renderer.shadowMap.enabled = true;
      mount.prepend(renderer.domElement);
      sceneRenderer = createSceneRenderer(
        renderer,
        visualQuality.get(),
        antiAliasingQuality.get(),
        shadowQuality.get(),
      );
      const camera = new PerspectiveCamera(
        tuningState.cameraFieldOfView,
        1,
        GAME_CAMERA.near,
        GAME_CAMERA.far,
      );
      const clock = new Clock();
      initializationStarted = true;
      this.initialize(
        mount,
        renderer,
        sceneRenderer,
        antiAliasingQuality,
        shadowQuality,
        visualQuality,
        waterQuality,
        systemTuning,
        camera,
        clock,
        resources,
        browserPlaytest === null
          ? browserStorage() as SurvivalSaveStorage | null
          : null,
        PRODUCTION_FACTORIES,
        createRandomSeed,
        onFatalError,
        browserPlaytest,
      );
    } catch (error) {
      if (!initializationStarted) {
        try {
          runCleanupSteps([
            () => sceneRenderer?.dispose(),
            () => renderer.dispose(),
            () => renderer.domElement.remove(),
          ]);
        } finally {
          throw error;
        }
      }
      throw error;
    }
  }

  static forTest(factories: GameFactories, options: GameTestOptions): Game {
    const game = Object.create(Game.prototype) as Game;
    game.initializeForTest(factories, options, createTestGameBase(options));
    return game;
  }

  private initializeForTest(
    factories: GameFactories,
    options: GameTestOptions,
    base: TestGameBase,
  ): void {
    const waterQuality = valueOrCreate(
      options.waterQuality,
      () => createWaterQualityPreference(
        (quality) => this.activePhase?.setWaterQuality?.(quality),
        null,
      ),
    );
    const systemTuning = valueOrCreate(
      options.systemTuning,
      () => createSystemTuningPreference(null),
    );
    const tuningState = systemTuning.get();
    const visualQuality = valueOrCreate(
      options.visualQuality,
      () => createVisualQualityPreference(
        (quality) => {
          base.sceneRenderer.setVisualQuality?.(quality);
          this.activePhase?.setVisualQuality?.(quality);
        },
        null,
      ),
    );
    const browserPlaytest = options.browserPlaytest ?? null;
    const saveStorage = browserPlaytest === null ? options.saveStorage ?? null : null;
    this.initialize(
      base.mount,
      base.renderer,
      base.sceneRenderer,
      base.antiAliasingQuality,
      base.shadowQuality,
      visualQuality,
      waterQuality,
      systemTuning,
      new PerspectiveCamera(
        tuningState.cameraFieldOfView,
        1,
        GAME_CAMERA.near,
        GAME_CAMERA.far,
      ),
      base.clock,
      options.resources,
      saveStorage,
      factories,
      valueOrCreate(options.createSeed, () => createRandomSeed),
      valueOrCreate(options.onFatalError, () => rethrowFatalError),
      browserPlaytest,
    );
  }

  start(): void {
    if (this.disposed || this.started) return;
    this.started = true;
    this.clock.start();
    this.activePhase?.start();
    this.animationFrame = requestAnimationFrame(this.animate);
  }

  restart(): void {
    if (this.disposed) return;
    this.restartCurrentPhase();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.animationFrame !== 0) cancelAnimationFrame(this.animationFrame);
    window.removeEventListener('resize', this.onResize);
    const outgoing = this.detachActivePhase();
    this.exitPointerLock();
    const performanceStats = this.performanceStats;
    this.performanceStats = null;
    const postProcessingConsole = this.postProcessingConsole;
    this.postProcessingConsole = null;
    runCleanupSteps([
      () => outgoing?.dispose(),
      () => postProcessingConsole?.dispose(),
      () => { this.settingsMenu?.dispose(); this.settingsMenu = null; },
      () => performanceStats?.dispose(),
      () => this.resources.dispose(),
      () => this.sceneRenderer.dispose(),
      () => this.renderer.dispose(),
      () => this.renderer.domElement.remove(),
    ]);
  }

  private initialize(
    mount: HTMLElement,
    renderer: WebGLRenderer,
    sceneRenderer: SceneRenderer,
    antiAliasingQuality: AntiAliasingQualityPreference,
    shadowQuality: ShadowQualityPreference,
    visualQuality: VisualQualityPreference,
    waterQuality: WaterQualityPreference,
    systemTuning: SystemTuningPreference,
    camera: PerspectiveCamera,
    clock: GameClock,
    resources: PhaseResourceSource,
    saveStorage: SurvivalSaveStorage | null,
    factories: GameFactories,
    createSeed: () => number,
    onFatalError: (error: unknown) => void,
    browserPlaytest: BrowserPlaytestStartup | null,
  ): void {
    this.renderer = renderer;
    this.sceneRenderer = sceneRenderer;
    this.camera = camera;
    this.clock = clock;
    this.resources = resources;
    const audioSystem = resources.audio;
    const physicsMode = resources.physicsMode;
    this.saveStore = new SurvivalSaveStore(saveStorage);
    this.systemTuning = systemTuning;
    this.factories = factories;
    this.createSeed = createSeed;
    this.onFatalError = onFatalError;
    let maxTextureAnisotropy = 1;
    let resizeListenerRegistered = false;
    try {
      maxTextureAnisotropy = Math.max(
        1,
        renderer.capabilities.getMaxAnisotropy(),
      );
      this.context = {
        mount,
        renderer,
        sceneRenderer,
        visualQuality,
        waterQuality,
        camera,
        maxTextureAnisotropy,
        audio: audioSystem,
        onFatalError: (error) => this.reportFatalError(error),
      };
      this.activePhase = null;
      this.activeLease = null;
      this.performanceStats = null;
      this.postProcessingConsole = null;
      const tuningState = systemTuning.get();
      this.weatherOverride = tuningState.weatherOverride;
      this.timeOfDayOverride = tuningState.phaseOverride;
      this.volumetricCloudsEnabled = tuningState.volumetricCloudsEnabled;
      this.animationFrame = 0;
      this.started = false;
      this.disposed = false;
      this.elapsed = 0;
      this.phaseGeneration = 0;
      this.loading = null;
      this.fatalErrorReported = false;
      this.performanceStats = new PerformanceStats(
        mount,
        tuningState.performanceStatsVisible,
      );
      if (sceneRenderer.postProcessingControls !== undefined) {
        const controls = sceneRenderer.postProcessingControls;
        controls.setAmbientOcclusionMode(tuningState.ambientOcclusionMode);
        controls.setNumeric(
          'ambientOcclusionIntensity',
          tuningState.ambientOcclusionIntensity,
        );
        controls.setNumeric(
          'ambientOcclusionRadius',
          tuningState.ambientOcclusionRadius,
        );
        const persistedPostProcessingControls: PostProcessingControls = Object.freeze({
          getState: () => controls.getState(),
          setAmbientOcclusionMode: (mode: ItemAmbientOcclusionMode) => {
            this.systemTuning.set('ambientOcclusionMode', mode);
            controls.setAmbientOcclusionMode(mode);
          },
          setNumeric: (setting: PostProcessingNumericSetting, value: number) => {
            this.systemTuning.set(
              setting,
              clampPostProcessingSetting(setting, value),
            );
            controls.setNumeric(setting, value);
          },
        });
        this.postProcessingConsole = new PostProcessingConsole(
          mount,
          persistedPostProcessingControls,
          (open) => this.activePhase?.setOverlayActive?.(open),
          {
            enabled: physicsMode !== 'off',
            debugMeshes: scavengePhysicsDebugMeshes(),
            setEnabled: (enabled) => {
              if (enabled === (physicsMode !== 'off')) return;
              setScavengePhysicsEnabled(enabled);
              window.location.reload();
            },
            setDebugMeshes: (enabled) => {
              if (enabled === scavengePhysicsDebugMeshes()) return;
              setScavengePhysicsDebugMeshes(enabled);
              window.location.reload();
            },
          },
          {
            selected: tuningState.weatherOverride ?? 'calm',
            source: tuningState.weatherOverride === null ? 'normal' : 'forced',
            setWeather: (id) => this.setWeatherOverride(id),
          },
          {
            selected: tuningState.phaseOverride ?? 'day',
            setTimeOfDay: (phase) => this.setTimeOfDayOverride(phase),
          },
          {
            options: EVENT_TEST_OPTIONS,
            enterEvent: (id) => this.enterTestEvent(id),
          },
        );
      }
      this.settingsMenu = new SettingsMenu(mount, {
        visualQuality, waterQuality, antiAliasingQuality, shadowQuality,
        performance: {
          visible: this.performanceStats.isVisible(),
          setVisible: (visible) => {
            this.systemTuning.set('performanceStatsVisible', visible);
            this.performanceStats?.setVisible(visible);
          },
        },
        audio: {
          volume: audioSystem.getPreference().volume,
          setVolume: (volume) => audioSystem.setVolume(volume),
        },
        camera: {
          fieldOfView: camera.fov,
          setFieldOfView: (fieldOfView) => {
            this.systemTuning.set('cameraFieldOfView', fieldOfView);
            if (camera.fov === fieldOfView) return;
            camera.fov = fieldOfView;
            camera.updateProjectionMatrix();
          },
        },
        save: {
          enabled: this.saveStore.getState().enabled,
          savedDay: this.saveStore.getState().checkpoint?.session.day ?? null,
          setEnabled: (enabled) => this.setSaveEnabled(enabled),
          continueSavedRun: () => this.continueSavedRun(),
        },
        clouds: {
          enabled: this.volumetricCloudsEnabled,
          available: true,
          setEnabled: (enabled) => this.setVolumetricCloudsEnabled(enabled),
        },
      });
      this.onResize = () => this.handleResize();
      this.animate = () => this.handleAnimationFrame();
      window.addEventListener('resize', this.onResize);
      resizeListenerRegistered = true;
      if (browserPlaytest === null) {
        this.ready = this.activateMenu();
      } else {
        this.seed = browserPlaytest.seed;
        this.ready = this.activateSurvival(Object.freeze({
          kind: 'fresh',
          savedItems: browserPlaytest.savedItems,
          seed: browserPlaytest.seed,
          scavengeElapsedSeconds: 0,
        }));
      }
      this.onResize();
    } catch (error) {
      try {
        this.rollbackConstruction(resizeListenerRegistered);
      } finally {
        throw error;
      }
    }
  }

  private rollbackConstruction(resizeListenerRegistered: boolean): void {
    this.disposed = true;
    const activePhase = this.detachActivePhase();
    const performanceStats = this.performanceStats;
    this.performanceStats = null;
    const postProcessingConsole = this.postProcessingConsole;
    this.postProcessingConsole = null;
    runCleanupSteps([
      () => {
        if (resizeListenerRegistered) window.removeEventListener('resize', this.onResize);
      },
      () => activePhase?.dispose(),
      () => postProcessingConsole?.dispose(),
      () => { this.settingsMenu?.dispose(); this.settingsMenu = null; },
      () => performanceStats?.dispose(),
      () => this.sceneRenderer.dispose(),
      () => this.renderer.dispose(),
      () => this.renderer.domElement.remove(),
    ]);
  }

  private activateScavenge(phaseStart: ScavengePhaseStart = 'intro'): Promise<void> {
    return this.acquirePhase(() => this.resources.acquireShip(), (assets, generation) => {
      assets.shipAssets.configure(this.context.maxTextureAnisotropy);
      assets.lifeboatAssets.configure(this.context.maxTextureAnisotropy);
      return this.factories.createScavenge(
        { ...this.context, ...assets },
        result => this.completeScavenge(generation, result),
        () => this.restartFrom(generation),
        () => this.returnToMenuFrom(generation),
        phaseStart,
      );
    });
  }

  private activateMenu(): Promise<void> {
    return this.acquirePhase(() => this.resources.acquireMenu(), (assets, generation) => {
      assets.menuSandAssets.configure(this.context.maxTextureAnisotropy);
      return this.factories.createMenu(
        { ...this.context, ...assets },
        () => this.startScavengeFromMenu(generation),
      );
    });
  }

  private startScavengeFromMenu(generation: number): void {
    if (!this.ownsGeneration(generation)) return;
    this.seed = this.createSeed();
    this.elapsed = 0;
    this.activateScavenge();
  }

  private acquirePhase<T>(
    acquire: () => Promise<ResourceLease<T>>,
    create: (assets: T, generation: number) => GamePhase,
  ): Promise<void> {
    const generation = ++this.phaseGeneration;
    let loading: HTMLElement | null = null;
    return Promise.resolve().then(() => {
      this.settingsMenu?.close();
      this.activePhase?.setOverlayActive?.(true);
      this.loading?.remove();
      loading = createSystemScreen({ kind: 'loading' });
      loading.querySelector('progress')?.removeAttribute('value');
      this.loading = loading;
      this.context.mount.append(loading);
      return acquire();
    }).then(lease => {
      if (!this.ownsGeneration(generation)) { lease.dispose(); return; }
      const outgoing = this.takeActivePhase();
      let phase: GamePhase | null = null;
      let transferred = false;
      try {
        // Phase objects release their clones and scopes before the backing lease.
        outgoing?.dispose();
        this.resetCamera();
        phase = create(lease.assets, generation);
        if (!this.ownsGeneration(generation)) { const stale = phase; phase = null; stale.dispose(); return; }
        this.applyPresentationOverrides(phase);
        if (!this.ownsGeneration(generation)) { const stale = phase; phase = null; stale.dispose(); return; }
        this.activePhase = phase;
        this.activeLease = lease;
        transferred = true;
        this.synchronizePresentationControls();
        phase.resize(window.innerWidth, window.innerHeight);
        if (this.started && this.ownsGeneration(generation)) phase.start();
      } catch (error) {
        if (!transferred) {
          try { phase?.dispose(); } catch { /* Keep the constructor error. */ }
        }
        throw error;
      } finally {
        if (!transferred) lease.dispose();
      }
    }).catch(error => {
      if (this.ownsGeneration(generation)) this.reportFatalError(error);
    }).finally(() => {
      loading?.remove();
      if (this.loading === loading) this.loading = null;
    });
  }

  private reportFatalError(error: unknown): void {
    if (this.disposed || this.fatalErrorReported) return;
    this.fatalErrorReported = true;
    this.onFatalError(error);
  }

  private completeScavenge(
    generation: number,
    result: Readonly<ScavengeResult>,
  ): void {
    if (!this.ownsGeneration(generation)) return;
    this.exitPointerLock();
    const copiedResult: Readonly<ScavengeResult> = Object.freeze({
      savedItems: Object.freeze(
        result.savedItems.map((item) => Object.freeze({ ...item })),
      ),
      elapsedSeconds: result.elapsedSeconds,
    });
    this.activateSurvival(Object.freeze({
      kind: 'fresh',
      savedItems: copiedResult.savedItems,
      seed: this.seed,
      scavengeElapsedSeconds: copiedResult.elapsedSeconds,
    }));
  }

  private activateSurvival(start: SurvivalPhaseStart): Promise<void> {
    return this.acquirePhase(() => this.resources.acquireSurvival(), (assets, generation) => {
      assets.lifeboatAssets.configure(this.context.maxTextureAnisotropy);
      const onCheckpointChange: SurvivalCheckpointChange = checkpoint => {
        if (!this.ownsGeneration(generation)) return;
        if (checkpoint === null) this.saveStore.clearCheckpoint();
        else this.saveStore.writeCheckpoint(checkpoint);
        this.syncSaveControls();
      };
      return this.factories.createSurvival(
        { ...this.context, ...assets }, start,
        () => this.restartFrom(generation), onCheckpointChange,
        () => this.returnToMenuFrom(generation),
      );
    });
  }

  private enterTestEvent(id: string): void {
    if (this.disposed) return;
    const option = EVENT_TEST_OPTIONS.find((candidate) => candidate.id === id);
    if (option === undefined) throw new Error(`Unknown event test scene: ${id}`);
    this.exitPointerLock();
    this.elapsed = 0;
    this.seed = this.createSeed();
    const result = createEventTestResult();
    if (option.phase === 'ending') {
      if (option.endingId === 'dorothy') {
        this.activateScavenge('ending-preview');
      } else {
        this.activateSurvival({
          kind: 'ending-preview',
          endingId: option.endingId,
          savedItems: result.savedItems,
          seed: this.seed,
          scavengeElapsedSeconds: result.elapsedSeconds,
        });
      }
      return;
    }
    this.activateSurvival({
      kind: 'fresh',
      savedItems: result.savedItems,
      seed: this.seed,
      scavengeElapsedSeconds: result.elapsedSeconds,
      initialEventId: option.eventId,
      initialEventResultId: option.resultId,
    });
  }

  private restartFrom(generation: number): void {
    if (!this.ownsGeneration(generation)) return;
    this.restartCurrentPhase();
  }

  private returnToMenuFrom(generation: number): void {
    if (!this.ownsGeneration(generation)) return;
    this.exitPointerLock();
    this.elapsed = 0;
    void this.activateMenu();
  }

  private restartCurrentPhase(): void {
    this.exitPointerLock();
    this.elapsed = 0;
    this.seed = this.createSeed();
    void this.activateScavenge();
  }

  private takeActivePhase(): Pick<GamePhase, 'dispose'> | null {
    const phase = this.activePhase;
    const lease = this.activeLease;
    this.activePhase = null;
    this.activeLease = null;
    if (phase === null && lease === null) return null;
    return { dispose: () => runCleanupSteps([() => phase?.dispose(), () => lease?.dispose()]) };
  }

  private detachActivePhase(): Pick<GamePhase, 'dispose'> | null {
    this.settingsMenu?.close();
    this.loading?.remove();
    this.loading = null;
    const outgoing = this.takeActivePhase();
    this.phaseGeneration += 1;
    return outgoing;
  }

  private ownsGeneration(generation: number): boolean {
    return !this.disposed && this.phaseGeneration === generation;
  }

  private resetCamera(): void {
    this.camera.position.set(0, 0, 0);
    this.camera.quaternion.identity();
    this.camera.scale.set(1, 1, 1);
    this.camera.updateMatrixWorld(true);
  }

  private exitPointerLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  private setSaveEnabled(enabled: boolean): void {
    this.saveStore.setEnabled(enabled);
    if (enabled) {
      const checkpoint = this.activePhase?.getSurvivalCheckpoint?.() ?? null;
      if (checkpoint !== null) this.saveStore.writeCheckpoint(checkpoint);
    }
    this.syncSaveControls();
  }

  private continueSavedRun(): void {
    const checkpoint = this.saveStore.getState().checkpoint;
    if (this.disposed || checkpoint === null) return;
    this.exitPointerLock();
    this.elapsed = 0;
    this.seed = checkpoint.session.seed;
    void this.activateSurvival({ kind: 'restored', checkpoint });
  }

  private syncSaveControls(): void {
    const state = this.saveStore.getState();
    this.settingsMenu?.setSaveState(
      state.enabled,
      state.checkpoint?.session.day ?? null,
    );
  }

  private setWeatherOverride(id: PresentationWeatherId): void {
    this.systemTuning.set('weatherOverride', id);
    this.weatherOverride = id;
    this.postProcessingConsole?.setWeatherState(id, 'forced');
    this.activePhase?.setWeatherOverride?.(id);
  }

  private setTimeOfDayOverride(phase: SkyPhase): void {
    this.systemTuning.set('phaseOverride', phase);
    this.timeOfDayOverride = phase;
    this.postProcessingConsole?.setTimeOfDayState(phase);
    this.activePhase?.setTimeOfDayOverride?.(phase);
  }

  private setVolumetricCloudsEnabled(enabled: boolean): void {
    this.volumetricCloudsEnabled = enabled;
    this.systemTuning.set('volumetricCloudsEnabled', enabled);
    this.activePhase?.setVolumetricCloudsEnabled?.(enabled);
  }

  private applyPresentationOverrides(phase: GamePhase): void {
    if (this.weatherOverride !== null) phase.setWeatherOverride?.(this.weatherOverride);
    if (this.timeOfDayOverride !== null) phase.setTimeOfDayOverride?.(this.timeOfDayOverride);
    phase.setVolumetricCloudsEnabled?.(this.volumetricCloudsEnabled);
  }

  private synchronizePresentationControls(): void {
    this.settingsMenu?.setVolumetricCloudAvailability(this.volumetricCloudsAvailable());
    const console = this.postProcessingConsole;
    if (console === null) return;
    console.setTimeOfDayState(this.presentationPhase());
    this.synchronizeWeatherControl(console);
  }

  private volumetricCloudsAvailable(): boolean {
    return this.activePhase?.getVolumetricCloudsAvailable?.() ?? true;
  }

  private presentationPhase(): SkyPhase {
    return this.timeOfDayOverride
      ?? this.activePhase?.getPresentationPhase?.()
      ?? 'day';
  }

  private synchronizeWeatherControl(console: PostProcessingConsole): void {
    if (this.weatherOverride !== null) {
      console.setWeatherState(this.weatherOverride, 'forced');
      return;
    }
    const weather = this.activePhase?.getPresentationWeather?.() ?? 'calm';
    console.setWeatherState(
      weather,
      weather === 'calm' ? 'normal' : 'event',
    );
  }

  private handleResize(): void {
    if (this.disposed) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const pixelRatio = Math.min(window.devicePixelRatio, 2);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.sceneRenderer.resize(width, height, pixelRatio);
    this.activePhase?.resize(width, height);
  }

  private handleAnimationFrame(): void {
    if (this.disposed) return;
    const rawDeltaSeconds = this.clock.getDelta();
    this.performanceStats?.recordFrame(rawDeltaSeconds);
    const deltaSeconds = Math.min(rawDeltaSeconds, 0.05);
    this.elapsed += deltaSeconds;
    this.activePhase?.update(this.elapsed, deltaSeconds);
    this.synchronizePresentationControls();
    this.activePhase?.render();
    if (!this.disposed) {
      this.animationFrame = requestAnimationFrame(this.animate);
    }
  }
}
