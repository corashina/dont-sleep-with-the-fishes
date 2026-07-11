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
      result.savedItems.map(({ type }) => type),
      seed,
      result.elapsedSeconds,
      onRestart,
    )
  ),
};

type GameClock = Pick<Clock, 'start' | 'getDelta'>;

export interface GameTestOptions {
  clock?: GameClock;
  createSeed?: () => number;
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
  private context!: PhaseContext;
  private factories!: GameFactories;
  private activePhase: GamePhase | null = null;
  private animationFrame = 0;
  private started = false;
  private disposed = false;
  private elapsed = 0;
  private seed = 0;
  private phaseGeneration = 0;
  private createSeed!: () => number;
  private onResize!: () => void;
  private animate!: () => void;

  constructor(mount: HTMLElement) {
    const renderer = new WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    mount.prepend(renderer.domElement);

    this.initialize(
      mount,
      renderer,
      new PerspectiveCamera(65, 1, 0.08, 220),
      new Clock(),
      window.matchMedia('(prefers-reduced-motion: reduce)'),
      PRODUCTION_FACTORIES,
      createRandomSeed,
    );
  }

  static forTest(factories: GameFactories, options: GameTestOptions = {}): Game {
    const mount = document.createElement('main');
    const canvas = document.createElement('canvas');
    mount.prepend(canvas);
    const renderer = {
      domElement: canvas,
      setPixelRatio: () => undefined,
      setSize: () => undefined,
      render: () => undefined,
      dispose: () => undefined,
    } as unknown as WebGLRenderer;
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
    outgoing?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private initialize(
    mount: HTMLElement,
    renderer: WebGLRenderer,
    camera: PerspectiveCamera,
    clock: GameClock,
    reducedMotion: MediaQueryList,
    factories: GameFactories,
    createSeed: () => number,
  ): void {
    this.mount = mount;
    this.renderer = renderer;
    this.camera = camera;
    this.clock = clock;
    this.reducedMotion = reducedMotion;
    this.factories = factories;
    this.createSeed = createSeed;
    this.context = { mount, renderer, camera, reducedMotion };
    this.activePhase = null;
    this.animationFrame = 0;
    this.started = false;
    this.disposed = false;
    this.elapsed = 0;
    this.phaseGeneration = 0;
    this.seed = this.createSeed();
    this.onResize = () => this.handleResize();
    this.animate = () => this.handleAnimationFrame();
    window.addEventListener('resize', this.onResize);
    this.activateScavenge(false);
    this.onResize();
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
      savedItems: Object.freeze([...result.savedItems]),
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
    const deltaSeconds = Math.min(this.clock.getDelta(), 0.05);
    this.elapsed += deltaSeconds;
    this.activePhase?.update(this.elapsed, deltaSeconds);
    this.activePhase?.render();
    this.animationFrame = requestAnimationFrame(this.animate);
  }
}
