import {
  Clock,
  PerspectiveCamera,
  SRGBColorSpace,
  WebGLRenderer,
  Texture,
} from 'three';
import type { GamePhase, PhaseContext } from './app/GamePhase';
import {
  EVENT_TEST_OPTIONS,
  createEventTestResult,
} from './app/EventTest';
import type { ScavengeResult } from './game/ScavengeSession';
import { ScavengePhase } from './phases/ScavengePhase';
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
import type { PropModelLibrary } from './world/PropModelLibrary';
import { runCleanupSteps } from './world/SceneResources';
import type { ShipFurnitureLibrary } from './world/ShipFurnitureLibrary';
import type { SkyAssets } from './world/SkyAssets';
import { LifeboatAssets } from './world/LifeboatAssets';
import { ShipAssets } from './world/ShipAssets';
import type { PhysicsRuntime } from './physics/PhysicsRuntime';
import {
  scavengePhysicsDebugMeshes,
  setScavengePhysicsDebugMeshes,
  setScavengePhysicsEnabled,
  type PhysicsMode,
} from './physics/PhysicsOptions';
import type { PresentationWeatherId } from './weather/presentationWeather';
import { AudioSystem } from './audio/AudioSystem';
import type { MenuModelLibrary } from './menu/MenuModelLibrary';
import { MenuSandAssets } from './menu/MenuSandAssets';
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

export interface GameFactories {
  createMenu(
    context: PhaseContext,
    onComplete: () => void,
  ): GamePhase;
  createScavenge(
    context: PhaseContext,
    onComplete: (result: Readonly<ScavengeResult>) => void,
    onRestart: () => void,
  ): GamePhase;
  createSurvival(
    context: PhaseContext,
    start: SurvivalPhaseStart,
    onRestart: () => void,
    onCheckpointChange: SurvivalCheckpointChange,
  ): GamePhase;
}

const PRODUCTION_FACTORIES: GameFactories = {
  createMenu: (context, onComplete) => (
    new MainMenuPhase(context, onComplete)
  ),
  createScavenge: (context, onComplete, onRestart) => (
    new ScavengePhase(context, onComplete, onRestart)
  ),
  createSurvival: (
    context,
    start,
    onRestart,
    onCheckpointChange,
  ) => (
    new SurvivalPhase(
      context,
      start,
      onRestart,
      onCheckpointChange,
    )
  ),
};

type GameClock = Pick<Clock, 'start' | 'getDelta'>;

interface TestGameBase {
  readonly mount: HTMLElement;
  readonly renderer: WebGLRenderer;
  readonly clock: GameClock;
  readonly sceneRenderer: SceneRenderer;
  readonly visualQuality: VisualQualityPreference;
  readonly antiAliasingQuality: AntiAliasingQualityPreference;
  readonly shadowQuality: ShadowQualityPreference;
}

const disposedMenuModelLibraries = new WeakSet<MenuModelLibrary>();

export function disposeMenuModelLibrary(menuModels: MenuModelLibrary): void {
  if (disposedMenuModelLibraries.has(menuModels)) return;
  disposedMenuModelLibraries.add(menuModels);
  menuModels.dispose();
}

export const GAME_CAMERA = Object.freeze({
  fov: 80,
  near: 0.08,
  far: 1000,
});

export interface GameTestOptions {
  propModels: PropModelLibrary;
  menuModels: MenuModelLibrary;
  menuSandAssets?: MenuSandAssets;
  shipFurniture: ShipFurnitureLibrary;
  skyAssets: SkyAssets;
  lifeboatAssets?: LifeboatAssets;
  shipAssets?: ShipAssets;
  physicsRuntime: PhysicsRuntime | null;
  physicsMode?: PhysicsMode;
  clock?: GameClock;
  createSeed?: () => number;
  mount?: HTMLElement;
  renderer?: WebGLRenderer;
  sceneRenderer?: SceneRenderer;
  antiAliasingQuality?: AntiAliasingQualityPreference;
  shadowQuality?: ShadowQualityPreference;
  visualQuality?: VisualQualityPreference;
  waterQuality?: WaterQualityPreference;
  audioSystem?: AudioSystem;
  onFatalError?: (error: unknown) => void;
  saveStorage?: SurvivalSaveStorage | null;
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
    visualQuality: options.visualQuality ?? createVisualQualityPreference(
      (quality) => sceneRenderer.setVisualQuality?.(quality),
      null,
    ),
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

export class Game {
  private renderer!: WebGLRenderer;
  private sceneRenderer!: SceneRenderer;
  private camera!: PerspectiveCamera;
  private clock!: GameClock;
  private propModels!: PropModelLibrary;
  private menuModels!: MenuModelLibrary;
  private menuSandAssets!: MenuSandAssets;
  private shipFurniture!: ShipFurnitureLibrary;
  private skyAssets!: SkyAssets;
  private lifeboatAssets!: LifeboatAssets;
  private shipAssets!: ShipAssets;
  private audio!: AudioSystem;
  private context!: PhaseContext;
  private factories!: GameFactories;
  private activePhase: GamePhase | null = null;
  private performanceStats: PerformanceStats | null = null;
  private postProcessingConsole: PostProcessingConsole | null = null;
  private saveStore!: SurvivalSaveStore;
  private weatherOverride: PresentationWeatherId | null = null;
  private timeOfDayOverride: SkyPhase | null = null;
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
    propModels: PropModelLibrary,
    shipFurniture: ShipFurnitureLibrary,
    skyAssets: SkyAssets,
    lifeboatAssets: LifeboatAssets,
    shipAssets: ShipAssets,
    menuModels: MenuModelLibrary,
    menuSandAssets: MenuSandAssets,
    physicsRuntime: PhysicsRuntime | null,
    physicsMode: PhysicsMode = 'enabled',
    audioSystem: AudioSystem = AudioSystem.silent(),
    onFatalError: (error: unknown) => void = rethrowFatalError,
  ) {
    const renderer = new WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    let sceneRenderer: SceneRenderer | null = null;
    const visualQuality = createVisualQualityPreference((quality) => {
      sceneRenderer?.setVisualQuality?.(quality);
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
        GAME_CAMERA.fov,
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
        camera,
        clock,
        propModels,
        shipFurniture,
        skyAssets,
        lifeboatAssets,
        shipAssets,
        menuModels,
        menuSandAssets,
        physicsRuntime,
        physicsMode,
        audioSystem,
        browserStorage() as SurvivalSaveStorage | null,
        PRODUCTION_FACTORIES,
        createRandomSeed,
        onFatalError,
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
    const waterQuality = options.waterQuality ?? createWaterQualityPreference(
      (quality) => this.activePhase?.setWaterQuality?.(quality),
      null,
    );
    this.initialize(
      base.mount,
      base.renderer,
      base.sceneRenderer,
      base.antiAliasingQuality,
      base.shadowQuality,
      base.visualQuality,
      waterQuality,
      new PerspectiveCamera(
        GAME_CAMERA.fov,
        1,
        GAME_CAMERA.near,
        GAME_CAMERA.far,
      ),
      base.clock,
      options.propModels,
      options.shipFurniture,
      options.skyAssets,
      options.lifeboatAssets ?? LifeboatAssets.fromTextures(
        new Texture(),
        new Texture(),
        new Texture(),
      ),
      options.shipAssets ?? ShipAssets.fromTextures(
        new Texture(),
        new Texture(),
        new Texture(),
      ),
      options.menuModels,
      options.menuSandAssets ?? MenuSandAssets.fromTexture(new Texture()),
      options.physicsRuntime,
      options.physicsMode ?? 'enabled',
      options.audioSystem ?? AudioSystem.silent(),
      options.saveStorage ?? null,
      factories,
      options.createSeed ?? createRandomSeed,
      options.onFatalError ?? rethrowFatalError,
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
      () => disposeMenuModelLibrary(this.menuModels),
      () => this.menuSandAssets.dispose(),
      () => postProcessingConsole?.dispose(),
      () => performanceStats?.dispose(),
      () => this.propModels.dispose(),
      () => this.shipFurniture.dispose(),
      () => this.skyAssets.dispose(),
      () => this.lifeboatAssets.dispose(),
      () => this.shipAssets.dispose(),
      () => this.audio.dispose(),
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
    camera: PerspectiveCamera,
    clock: GameClock,
    propModels: PropModelLibrary,
    shipFurniture: ShipFurnitureLibrary,
    skyAssets: SkyAssets,
    lifeboatAssets: LifeboatAssets,
    shipAssets: ShipAssets,
    menuModels: MenuModelLibrary,
    menuSandAssets: MenuSandAssets,
    physicsRuntime: PhysicsRuntime | null,
    physicsMode: PhysicsMode,
    audioSystem: AudioSystem,
    saveStorage: SurvivalSaveStorage | null,
    factories: GameFactories,
    createSeed: () => number,
    onFatalError: (error: unknown) => void,
  ): void {
    this.renderer = renderer;
    this.sceneRenderer = sceneRenderer;
    this.camera = camera;
    this.clock = clock;
    this.propModels = propModels;
    this.shipFurniture = shipFurniture;
    this.skyAssets = skyAssets;
    this.lifeboatAssets = lifeboatAssets;
    this.shipAssets = shipAssets;
    this.menuModels = menuModels;
    this.menuSandAssets = menuSandAssets;
    this.audio = audioSystem;
    this.saveStore = new SurvivalSaveStore(saveStorage);
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
      this.lifeboatAssets.configure(maxTextureAnisotropy);
      this.shipAssets.configure(maxTextureAnisotropy);
      this.menuSandAssets.configure(maxTextureAnisotropy);
      this.context = {
        mount,
        renderer,
        sceneRenderer,
        visualQuality,
        waterQuality,
        camera,
        propModels,
        shipFurniture,
        maxTextureAnisotropy,
        skyAssets,
        lifeboatAssets,
        shipAssets,
        menuModels,
        menuSandAssets,
        physicsRuntime,
        physicsMode,
        audio: audioSystem,
        onFatalError: (error) => this.reportFatalError(error),
      };
      this.activePhase = null;
      this.performanceStats = null;
      this.postProcessingConsole = null;
      this.weatherOverride = null;
      this.timeOfDayOverride = null;
      this.animationFrame = 0;
      this.started = false;
      this.disposed = false;
      this.elapsed = 0;
      this.phaseGeneration = 0;
      this.fatalErrorReported = false;
      const showDevelopmentStats = import.meta.env.DEV
        && new URLSearchParams(window.location.search).has('stats');
      this.performanceStats = new PerformanceStats(mount, showDevelopmentStats);
      if (sceneRenderer.postProcessingControls !== undefined) {
        this.postProcessingConsole = new PostProcessingConsole(
          mount,
          sceneRenderer.postProcessingControls,
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
          visualQuality,
          {
            selected: 'calm',
            source: 'normal',
            setWeather: (id) => this.setWeatherOverride(id),
          },
          {
            selected: 'day',
            setTimeOfDay: (phase) => this.setTimeOfDayOverride(phase),
          },
          {
            options: EVENT_TEST_OPTIONS,
            enterEvent: (id) => this.enterTestEvent(id),
          },
          waterQuality,
          {
            visible: this.performanceStats.isVisible(),
            setVisible: (visible) => this.performanceStats?.setVisible(visible),
          },
          {
            volume: audioSystem.getPreference().volume,
            muted: audioSystem.getPreference().muted,
            setVolume: (volume) => audioSystem.setVolume(volume),
            setMuted: (muted) => audioSystem.setMuted(muted),
          },
          {
            fieldOfView: camera.fov,
            setFieldOfView: (fieldOfView) => {
              if (camera.fov === fieldOfView) return;
              camera.fov = fieldOfView;
              camera.updateProjectionMatrix();
            },
          },
          antiAliasingQuality,
          shadowQuality,
          {
            enabled: this.saveStore.getState().enabled,
            savedDay: this.saveStore.getState().checkpoint?.session.day ?? null,
            setEnabled: (enabled) => this.setSaveEnabled(enabled),
            continueSavedRun: () => this.continueSavedRun(),
          },
        );
      }
      this.onResize = () => this.handleResize();
      this.animate = () => this.handleAnimationFrame();
      window.addEventListener('resize', this.onResize);
      resizeListenerRegistered = true;
      this.activateMenu(false);
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
      () => disposeMenuModelLibrary(this.menuModels),
      () => this.menuSandAssets.dispose(),
      () => postProcessingConsole?.dispose(),
      () => performanceStats?.dispose(),
      () => this.sceneRenderer.dispose(),
      () => this.renderer.dispose(),
      () => this.renderer.domElement.remove(),
    ]);
  }

  private activateScavenge(start: boolean): void {
    const generation = ++this.phaseGeneration;
    const phase = this.createScavengePhase(generation);
    if (!this.ownsGeneration(generation)) {
      phase.dispose();
      return;
    }
    this.applyPresentationOverridesOrDispose(phase);
    this.activePhase = phase;
    this.synchronizePresentationControls();
    if (start) {
      phase.resize(window.innerWidth, window.innerHeight);
      phase.start();
    }
  }

  private activateMenu(start: boolean): void {
    const generation = ++this.phaseGeneration;
    const phase = this.factories.createMenu(
      this.context,
      () => this.startScavengeFromMenu(generation),
    );
    if (!this.ownsGeneration(generation)) {
      phase.dispose();
      return;
    }
    this.applyPresentationOverridesOrDispose(phase);
    this.activePhase = phase;
    this.synchronizePresentationControls();
    if (start) {
      phase.resize(window.innerWidth, window.innerHeight);
      phase.start();
    }
  }

  private startScavengeFromMenu(generation: number): void {
    if (!this.ownsGeneration(generation)) return;
    const nextGeneration = this.phaseGeneration + 1;
    let nextSeed: number;
    let scavenge: GamePhase;
    try {
      nextSeed = this.createSeed();
      scavenge = this.createScavengePhase(nextGeneration);
      this.applyPresentationOverridesOrDispose(scavenge);
    } catch (error) {
      this.reportFatalError(error);
      return;
    }
    if (!this.ownsGeneration(generation)) {
      scavenge.dispose();
      return;
    }
    const menu = this.detachActivePhase();
    this.resetCamera();
    this.elapsed = 0;
    this.seed = nextSeed;
    this.activePhase = scavenge;
    this.synchronizePresentationControls();
    try {
      menu?.dispose();
      scavenge.resize(window.innerWidth, window.innerHeight);
      scavenge.start();
    } catch (error) {
      this.reportFatalError(error);
    }
  }

  private createScavengePhase(generation: number): GamePhase {
    return this.factories.createScavenge(
      this.context,
      (result) => this.completeScavenge(generation, result),
      () => this.restartFrom(generation),
    );
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
    const scavenge = this.detachActivePhase();
    this.exitPointerLock();
    scavenge?.dispose();
    this.resetCamera();
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

  private activateSurvival(start: SurvivalPhaseStart): void {
    const generation = ++this.phaseGeneration;
    const onCheckpointChange: SurvivalCheckpointChange = (checkpoint) => {
      if (!this.ownsGeneration(generation)) return;
      if (checkpoint === null) this.saveStore.clearCheckpoint();
      else this.saveStore.writeCheckpoint(checkpoint);
      this.syncSaveControls();
    };
    const survival = this.factories.createSurvival(
      this.context,
      start,
      () => this.restartFrom(generation),
      onCheckpointChange,
    );
    if (!this.ownsGeneration(generation)) {
      survival.dispose();
      return;
    }
    this.applyPresentationOverridesOrDispose(survival);
    this.activePhase = survival;
    this.synchronizePresentationControls();
    survival.resize(window.innerWidth, window.innerHeight);
    survival.start();
  }

  private enterTestEvent(id: string): void {
    if (this.disposed) return;
    const option = EVENT_TEST_OPTIONS.find((candidate) => candidate.id === id);
    if (option === undefined) throw new Error(`Unknown event test scene: ${id}`);
    const outgoing = this.detachActivePhase();
    this.exitPointerLock();
    outgoing?.dispose();
    this.resetCamera();
    this.elapsed = 0;
    this.seed = this.createSeed();
    const result = createEventTestResult();
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

  private restartCurrentPhase(): void {
    const outgoing = this.detachActivePhase();
    try {
      runCleanupSteps([
        () => this.exitPointerLock(),
        () => outgoing?.dispose(),
        () => this.resetCamera(),
        () => { this.elapsed = 0; },
        () => { this.seed = this.createSeed(); },
        () => this.activateScavenge(true),
      ]);
    } catch (error) {
      this.reportFatalError(error);
    }
  }

  private detachActivePhase(): GamePhase | null {
    const outgoing = this.activePhase;
    this.activePhase = null;
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
    const outgoing = this.detachActivePhase();
    try {
      this.exitPointerLock();
      outgoing?.dispose();
      this.resetCamera();
      this.elapsed = 0;
      this.seed = checkpoint.session.seed;
      this.activateSurvival({ kind: 'restored', checkpoint });
    } catch (error) {
      this.reportFatalError(error);
    }
  }

  private syncSaveControls(): void {
    const state = this.saveStore.getState();
    this.postProcessingConsole?.setSaveState(
      state.enabled,
      state.checkpoint?.session.day ?? null,
    );
  }

  private setWeatherOverride(id: PresentationWeatherId): void {
    this.weatherOverride = id;
    this.postProcessingConsole?.setWeatherState(id, 'forced');
    this.activePhase?.setWeatherOverride?.(id);
  }

  private setTimeOfDayOverride(phase: SkyPhase): void {
    this.timeOfDayOverride = phase;
    this.postProcessingConsole?.setTimeOfDayState(phase);
    this.activePhase?.setTimeOfDayOverride?.(phase);
  }

  private applyPresentationOverridesOrDispose(phase: GamePhase): void {
    if (this.weatherOverride === null && this.timeOfDayOverride === null) return;
    try {
      if (this.weatherOverride !== null) {
        phase.setWeatherOverride?.(this.weatherOverride);
      }
      if (this.timeOfDayOverride !== null) {
        phase.setTimeOfDayOverride?.(this.timeOfDayOverride);
      }
    } catch (error) {
      try {
        phase.dispose();
      } catch {
        // Preserve the override failure that prevented phase ownership.
      }
      throw error;
    }
  }

  private synchronizePresentationControls(): void {
    if (this.postProcessingConsole === null) return;
    const effectivePhase = this.activePhase?.getPresentationPhase?.() ?? 'day';
    this.postProcessingConsole.setTimeOfDayState(
      this.timeOfDayOverride ?? effectivePhase,
    );
    const effectiveWeather = this.activePhase?.getPresentationWeather?.() ?? 'calm';
    if (this.weatherOverride !== null) {
      this.postProcessingConsole.setWeatherState(this.weatherOverride, 'forced');
      return;
    }
    this.postProcessingConsole.setWeatherState(
      effectiveWeather,
      effectiveWeather === 'calm' ? 'normal' : 'event',
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
