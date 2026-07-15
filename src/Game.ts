import {
  Clock,
  PCFSoftShadowMap,
  PerspectiveCamera,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three';
import type { GamePhase, PhaseContext } from './app/GamePhase';
import type { ScavengeResult } from './game/ScavengeSession';
import { ScavengePhase } from './phases/ScavengePhase';
import { SurvivalPhase } from './survival/SurvivalPhase';
import { PerformanceStats } from './ui/PerformanceStats';
import type { PropModelLibrary } from './world/PropModelLibrary';
import type { ShipFurnitureLibrary } from './world/ShipFurnitureLibrary';
import type { SkyAssets } from './world/SkyAssets';

export interface GameFactories {
  createScavenge(
    context: PhaseContext,
    onComplete: (result: Readonly<ScavengeResult>) => void,
    onRestart: () => void,
  ): GamePhase;
  createSurvival(
    context: PhaseContext,
    result: Readonly<ScavengeResult>,
    seed: number,
    onRestart: () => void,
  ): GamePhase;
}

const PRODUCTION_FACTORIES: GameFactories = {
  createScavenge: (context, onComplete, onRestart) => (
    new ScavengePhase(context, onComplete, onRestart)
  ),
  createSurvival: (context, result, seed, onRestart) => (
    new SurvivalPhase(
      context,
      result.savedItems,
      seed,
      result.elapsedSeconds,
      onRestart,
    )
  ),
};

type GameClock = Pick<Clock, 'start' | 'getDelta'>;

export interface GameTestOptions {
  propModels: PropModelLibrary;
  shipFurniture: ShipFurnitureLibrary;
  skyAssets: SkyAssets;
  clock?: GameClock;
  createSeed?: () => number;
  mount?: HTMLElement;
  renderer?: WebGLRenderer;
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

export class Game {
  private mount!: HTMLElement;
  private renderer!: WebGLRenderer;
  private camera!: PerspectiveCamera;
  private clock!: GameClock;
  private reducedMotion!: MediaQueryList;
  private propModels!: PropModelLibrary;
  private shipFurniture!: ShipFurnitureLibrary;
  private skyAssets!: SkyAssets;
  private context!: PhaseContext;
  private factories!: GameFactories;
  private activePhase: GamePhase | null = null;
  private performanceStats: PerformanceStats | null = null;
  private animationFrame = 0;
  private started = false;
  private disposed = false;
  private elapsed = 0;
  private seed = 0;
  private phaseGeneration = 0;
  private createSeed!: () => number;
  private onResize!: () => void;
  private animate!: () => void;

  constructor(
    mount: HTMLElement,
    propModels: PropModelLibrary,
    shipFurniture: ShipFurnitureLibrary,
    skyAssets: SkyAssets,
  ) {
    const renderer = new WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    let initializationStarted = false;
    try {
      renderer.outputColorSpace = SRGBColorSpace;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = PCFSoftShadowMap;
      mount.prepend(renderer.domElement);
      const camera = new PerspectiveCamera(65, 1, 0.08, 220);
      const clock = new Clock();
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
      initializationStarted = true;
      this.initialize(
        mount,
        renderer,
        camera,
        clock,
        reducedMotion,
        propModels,
        shipFurniture,
        skyAssets,
        PRODUCTION_FACTORIES,
        createRandomSeed,
      );
    } catch (error) {
      if (!initializationStarted) {
        try {
          renderer.dispose();
        } finally {
          renderer.domElement.remove();
        }
      }
      throw error;
    }
  }

  static forTest(factories: GameFactories, options: GameTestOptions): Game {
    const mount = options.mount ?? document.createElement('main');
    const renderer = options.renderer ?? {
      domElement: document.createElement('canvas'),
      setPixelRatio: () => undefined,
      setSize: () => undefined,
      render: () => undefined,
      dispose: () => undefined,
      capabilities: { getMaxAnisotropy: () => 1 },
    } as unknown as WebGLRenderer;
    mount.prepend(renderer.domElement);
    const clock: GameClock = options.clock ?? {
      start: () => undefined,
      getDelta: () => 0.016,
    };
    const reducedMotion = { matches: false } as MediaQueryList;
    const game = Object.create(Game.prototype) as Game;
    game.initialize(
      mount,
      renderer,
      new PerspectiveCamera(65, 1, 0.08, 220),
      clock,
      reducedMotion,
      options.propModels,
      options.shipFurniture,
      options.skyAssets,
      factories,
      options.createSeed ?? createRandomSeed,
    );
    return game;
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
    let firstCleanupError: unknown;
    let cleanupFailed = false;
    const preserveFirstCleanupError = (error: unknown): void => {
      if (cleanupFailed) return;
      cleanupFailed = true;
      firstCleanupError = error;
    };
    try {
      outgoing?.dispose();
    } catch (error) {
      preserveFirstCleanupError(error);
    } finally {
      try {
        this.performanceStats?.dispose();
      } catch (error) {
        preserveFirstCleanupError(error);
      } finally {
        this.performanceStats = null;
        try {
          this.propModels.dispose();
        } catch (error) {
          preserveFirstCleanupError(error);
        } finally {
          try {
            this.shipFurniture.dispose();
          } catch (error) {
            preserveFirstCleanupError(error);
          } finally {
            try {
              this.skyAssets.dispose();
            } catch (error) {
              preserveFirstCleanupError(error);
            } finally {
              try {
                this.renderer.dispose();
              } catch (error) {
                preserveFirstCleanupError(error);
              } finally {
                try {
                  this.renderer.domElement.remove();
                } catch (error) {
                  preserveFirstCleanupError(error);
                }
              }
            }
          }
        }
      }
    }
    if (cleanupFailed) throw firstCleanupError;
  }

  private initialize(
    mount: HTMLElement,
    renderer: WebGLRenderer,
    camera: PerspectiveCamera,
    clock: GameClock,
    reducedMotion: MediaQueryList,
    propModels: PropModelLibrary,
    shipFurniture: ShipFurnitureLibrary,
    skyAssets: SkyAssets,
    factories: GameFactories,
    createSeed: () => number,
  ): void {
    this.mount = mount;
    this.renderer = renderer;
    this.camera = camera;
    this.clock = clock;
    this.reducedMotion = reducedMotion;
    this.propModels = propModels;
    this.shipFurniture = shipFurniture;
    this.skyAssets = skyAssets;
    this.factories = factories;
    this.createSeed = createSeed;
    const maxTextureAnisotropy = Math.max(
      1,
      renderer.capabilities.getMaxAnisotropy(),
    );
    this.context = {
      mount,
      renderer,
      camera,
      reducedMotion,
      propModels,
      shipFurniture,
      maxTextureAnisotropy,
      skyAssets,
    };
    this.activePhase = null;
    this.performanceStats = null;
    this.animationFrame = 0;
    this.started = false;
    this.disposed = false;
    this.elapsed = 0;
    this.phaseGeneration = 0;
    let resizeListenerRegistered = false;
    try {
      this.performanceStats = new PerformanceStats(mount);
      this.seed = this.createSeed();
      this.onResize = () => this.handleResize();
      this.animate = () => this.handleAnimationFrame();
      window.addEventListener('resize', this.onResize);
      resizeListenerRegistered = true;
      this.activateScavenge(false);
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
    try {
      if (resizeListenerRegistered) {
        window.removeEventListener('resize', this.onResize);
      }
    } finally {
      try {
        activePhase?.dispose();
      } finally {
        try {
          this.performanceStats?.dispose();
          this.performanceStats = null;
        } finally {
          try {
            this.renderer.dispose();
          } finally {
            this.renderer.domElement.remove();
          }
        }
      }
    }
  }

  private activateScavenge(start: boolean): void {
    const generation = ++this.phaseGeneration;
    const phase = this.factories.createScavenge(
      this.context,
      (result) => this.completeScavenge(generation, result),
      () => this.restartFrom(generation),
    );
    if (!this.ownsGeneration(generation)) {
      phase.dispose();
      return;
    }
    this.activePhase = phase;
    if (start) {
      phase.resize(window.innerWidth, window.innerHeight);
      phase.start();
    }
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
    this.activateSurvival(copiedResult);
  }

  private activateSurvival(result: Readonly<ScavengeResult>): void {
    const generation = ++this.phaseGeneration;
    const survival = this.factories.createSurvival(
      this.context,
      result,
      this.seed,
      () => this.restartFrom(generation),
    );
    if (!this.ownsGeneration(generation)) {
      survival.dispose();
      return;
    }
    this.activePhase = survival;
    survival.resize(window.innerWidth, window.innerHeight);
    survival.start();
  }

  private restartFrom(generation: number): void {
    if (!this.ownsGeneration(generation)) return;
    this.restartCurrentPhase();
  }

  private restartCurrentPhase(): void {
    const outgoing = this.detachActivePhase();
    this.exitPointerLock();
    outgoing?.dispose();
    this.resetCamera();
    this.elapsed = 0;
    this.seed = this.createSeed();
    this.activateScavenge(true);
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

  private handleResize(): void {
    if (this.disposed) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height, false);
    this.activePhase?.resize(width, height);
  }

  private handleAnimationFrame(): void {
    if (this.disposed) return;
    const rawDeltaSeconds = this.clock.getDelta();
    this.performanceStats?.recordFrame(rawDeltaSeconds);
    const deltaSeconds = Math.min(rawDeltaSeconds, 0.05);
    this.elapsed += deltaSeconds;
    this.activePhase?.update(this.elapsed, deltaSeconds);
    this.activePhase?.render();
    this.animationFrame = requestAnimationFrame(this.animate);
  }
}
