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
      result.savedItems,
      seed,
      result.elapsedSeconds,
      onRestart,
    )
  ),
};

type GameClock = Pick<Clock, 'start' | 'getDelta'>;

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
    );
  }

  static forTest(factories: GameFactories): Game {
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
    const clock: GameClock = {
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
    this.exitPointerLock();
    this.activePhase?.dispose();
    this.resetCamera();
    this.elapsed = 0;
    this.seed = this.createSeed();
    this.activateScavenge(true);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.animationFrame !== 0) cancelAnimationFrame(this.animationFrame);
    window.removeEventListener('resize', this.onResize);
    this.exitPointerLock();
    this.activePhase?.dispose();
    this.activePhase = null;
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
  ): void {
    this.mount = mount;
    this.renderer = renderer;
    this.camera = camera;
    this.clock = clock;
    this.reducedMotion = reducedMotion;
    this.factories = factories;
    this.context = { mount, renderer, camera, reducedMotion };
    this.activePhase = null;
    this.animationFrame = 0;
    this.started = false;
    this.disposed = false;
    this.elapsed = 0;
    this.seed = this.createSeed();
    this.onResize = () => this.handleResize();
    this.animate = () => this.handleAnimationFrame();
    window.addEventListener('resize', this.onResize);
    this.activateScavenge(false);
    this.onResize();
  }

  private activateScavenge(start: boolean): void {
    let phase!: GamePhase;
    phase = this.factories.createScavenge(
      this.context,
      (result) => this.completeScavenge(phase, result),
      () => this.restart(),
    );
    this.activePhase = phase;
    if (start) {
      phase.resize(window.innerWidth, window.innerHeight);
      phase.start();
    }
  }

  private completeScavenge(
    scavenge: GamePhase,
    result: Readonly<ScavengeResult>,
  ): void {
    if (this.disposed || this.activePhase !== scavenge) return;
    this.exitPointerLock();
    scavenge.dispose();
    this.resetCamera();
    const copiedResult: Readonly<ScavengeResult> = Object.freeze({
      savedItems: Object.freeze([...result.savedItems]),
      elapsedSeconds: result.elapsedSeconds,
    });
    const survival = this.factories.createSurvival(
      this.context,
      copiedResult,
      this.seed,
      () => this.restart(),
    );
    this.activePhase = survival;
    survival.resize(window.innerWidth, window.innerHeight);
    survival.start();
  }

  private resetCamera(): void {
    this.camera.position.set(0, 0, 0);
    this.camera.quaternion.identity();
    this.camera.scale.set(1, 1, 1);
    this.camera.updateMatrixWorld(true);
  }

  private createSeed(): number {
    try {
      const values = new Uint32Array(1);
      globalThis.crypto.getRandomValues(values);
      return values[0]!;
    } catch {
      return Date.now() >>> 0;
    }
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
