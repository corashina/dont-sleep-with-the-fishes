import {
  Clock,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three';
import { ScavengeSession } from './game/ScavengeSession';
import {
  GameLifecycle,
  advanceTerminalPresentation,
  pointerLockTransition,
  runGameplayFrame,
  type TerminalPresentation,
} from './game/GameLoop';
import { getSinkingState } from './game/sinking';
import { InputController } from './input/InputController';
import { CarryController } from './interaction/CarryController';
import {
  chooseContextAction,
  InteractionSystem,
  type ContextAction,
} from './interaction/InteractionSystem';
import { DEFAULT_WAVES, sampleWaveField } from './ocean/WaveField';
import { PlayerController } from './player/PlayerController';
import { GameUI } from './ui/GameUI';
import { World } from './world/World';

const RUN_SECONDS = 120;

export class Game {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(65, 1, 0.08, 220);
  private readonly clock = new Clock();
  private readonly session = new ScavengeSession();
  private readonly world: World;
  private readonly input: InputController;
  private readonly player: PlayerController;
  private readonly interaction: InteractionSystem;
  private readonly carry: CarryController;
  private readonly ui: GameUI;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private readonly lifecycle = new GameLifecycle();
  private animationFrame = 0;
  private started = false;
  private elapsed = 0;
  private terminalPresentation: TerminalPresentation = {
    phase: 'playing',
    remainingSeconds: 0,
  };
  private contextAction: ContextAction = { type: 'none', prompt: '' };

  constructor(private readonly mount: HTMLElement) {
    this.renderer = new WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.mount.prepend(this.renderer.domElement);
    this.scene.add(this.camera);

    this.ui = new GameUI(mount);
    this.world = new World(this.scene);
    this.input = new InputController(this.renderer.domElement);
    this.player = new PlayerController(
      this.camera,
      this.world.ship,
      this.world.playerStart,
      this.world.colliders,
      () => this.session.penalize(5),
    );
    this.interaction = new InteractionSystem(this.camera);
    this.carry = new CarryController(this.scene, this.camera);

    this.ui.onStart = () => {
      void this.requestPointerLock();
    };
    this.ui.onResume = () => {
      void this.requestPointerLock();
    };
    this.ui.onReplay = () => window.location.reload();
    window.addEventListener('resize', this.onResize);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.onResize();
  }

  start(): void {
    if (this.lifecycle.isDisposed || this.started) return;
    this.started = true;
    this.clock.start();
    this.animationFrame = requestAnimationFrame(this.animate);
  }

  dispose(): void {
    this.lifecycle.dispose(this.input.pointerLocked, {
      cancelAnimation: () => cancelAnimationFrame(this.animationFrame),
      removeGlobalListeners: () => {
        window.removeEventListener('resize', this.onResize);
        document.removeEventListener('pointerlockchange', this.onPointerLockChange);
        document.removeEventListener('visibilitychange', this.onVisibilityChange);
      },
      exitPointerLock: () => document.exitPointerLock(),
      resetCarry: () => this.carry.reset(),
      disposeInput: () => this.input.dispose(),
      disposeInteraction: () => this.interaction.dispose(),
      disposeWorld: () => this.world.dispose(),
      disposeUI: () => this.ui.dispose(),
      disposeRenderer: () => this.renderer.dispose(),
      removeCanvas: () => this.renderer.domElement.remove(),
    });
  }

  private readonly animate = (): void => {
    if (this.lifecycle.isDisposed) return;
    const delta = Math.min(this.clock.getDelta(), 0.05);
    const before = this.session.snapshot();
    const active = before.status === 'running' && this.input.pointerLocked && !document.hidden;
    let sinking = getSinkingState(this.elapsed, RUN_SECONDS);
    const updateWorld = (worldDelta: number): void => {
      this.world.update(
        this.elapsed,
        worldDelta,
        sinking,
        this.camera.position,
        this.reducedMotion.matches,
      );
    };
    const synchronizeElapsed = (): boolean => {
      const nextElapsed = RUN_SECONDS - this.session.snapshot().remainingSeconds;
      if (nextElapsed === this.elapsed) return false;
      this.elapsed = nextElapsed;
      sinking = getSinkingState(this.elapsed, RUN_SECONDS);
      return true;
    };

    if (active) {
      runGameplayFrame(true, {
        tick: () => this.session.tick(delta),
        afterTick: () => {
          synchronizeElapsed();
          updateWorld(delta);
        },
        move: () => {
          const shake = this.reducedMotion.matches
            ? 0
            : Math.sin(this.elapsed * 37) * sinking.cameraShake;
          this.player.update(delta, this.input, shake);
        },
        afterMove: () => {
          if (synchronizeElapsed()) updateWorld(0);
        },
        interact: () => this.updateInteraction(this.session.snapshot().savedCount),
        flight: () => this.updateFlight(delta, sinking.waveAmplitudeScale),
        isRunning: () => this.session.snapshot().status === 'running',
      });
    } else {
      updateWorld(delta);
      this.input.consumeLook();
    }

    const next = this.session.snapshot();
    this.ui.render(next, sinking);
    const stillActive = next.status === 'running' && this.input.pointerLocked && !document.hidden;
    this.ui.setPrompt(stillActive ? this.contextAction.prompt : '');

    const previousTerminalPhase = this.terminalPresentation.phase;
    this.terminalPresentation = advanceTerminalPresentation(
      this.terminalPresentation,
      next.status,
      delta,
    );
    if (this.terminalPresentation.phase !== previousTerminalPhase) {
      if (this.input.pointerLocked) document.exitPointerLock();
      if (this.terminalPresentation.phase === 'failureSequence') {
        this.ui.showFailureSequence();
      } else if (this.terminalPresentation.phase === 'result') {
        this.ui.showResult(next);
      }
    }
    this.renderer.render(this.scene, this.camera);
    this.animationFrame = requestAnimationFrame(this.animate);
  };

  private updateInteraction(savedCount: number): void {
    const snapshot = this.session.snapshot();
    const availableItems = [...this.world.itemObjects.entries()]
      .filter(([id]) => snapshot.items[id] === 'available')
      .map(([, object]) => object);
    const target = this.interaction.update(availableItems, this.world.lifeboat);
    const distanceToEvacuation = this.player.localPosition.distanceTo(this.world.evacuationPoint);
    this.contextAction = chooseContextAction({
      ...target,
      carriedItem: snapshot.carriedItem,
      savedCount,
      nearEvacuation: distanceToEvacuation <= 1.7,
    });
    if (this.input.consumeInteract()) this.performAction(this.contextAction);
  }

  private performAction(action: ContextAction): void {
    if (action.type === 'pickUp') {
      const object = this.world.itemObjects.get(action.itemId);
      if (object && this.session.pickUp(action.itemId)) {
        this.carry.pickUp(action.itemId, object);
      }
    } else if (action.type === 'throwToBoat') {
      this.carry.throw();
    } else if (action.type === 'drop') {
      this.carry.drop();
    } else if (action.type === 'evacuate') {
      this.session.evacuate();
    }
  }

  private updateFlight(delta: number, amplitudeScale: number): void {
    this.world.lifeboat.updateMatrixWorld(true);
    const boatBox = this.world.lifeboatAcceptance
      .clone()
      .applyMatrix4(this.world.lifeboat.matrixWorld);
    this.carry.update(
      delta,
      boatBox,
      (x, z) => sampleWaveField(DEFAULT_WAVES, this.elapsed, x, z, amplitudeScale).height,
      {
        onSaved: (id) => {
          if (!this.session.saveCarried()) return;
          this.world.saveItem(id, this.session.snapshot().savedCount - 1);
        },
        onLost: (id) => {
          if (!this.session.loseCarried()) return;
          this.world.loseItem(id);
        },
        onLanded: (id) => {
          if (!this.session.dropCarried()) return;
          this.world.landItem(id);
        },
      },
    );
  }

  private readonly onPointerLockChange = (): void => {
    const locked = this.input.pointerLocked;
    const status = this.session.snapshot().status;
    const transition = pointerLockTransition(status, locked);
    if (transition === 'start') {
      this.session.start();
      this.ui.clearPointerLockError();
      this.ui.hideStart();
    } else if (transition === 'resume') {
      this.session.resume();
      this.ui.clearPointerLockError();
      this.ui.setPaused(false);
    } else if (transition === 'pause') {
      this.session.pause();
      this.ui.setPaused(true);
    }
  };

  private readonly onVisibilityChange = (): void => {
    if (document.hidden && this.session.snapshot().status === 'running') {
      this.session.pause();
      this.ui.setPaused(true);
      if (document.pointerLockElement) document.exitPointerLock();
    }
  };

  private readonly onResize = (): void => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height, false);
  };

  private async requestPointerLock(): Promise<void> {
    const acquired = await this.input.requestPointerLock();
    if (!acquired && !this.lifecycle.isDisposed) this.ui.showPointerLockError();
  }
}
