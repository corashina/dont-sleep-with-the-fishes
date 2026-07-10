import {
  Clock,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three';
import { ScavengeSession } from './game/ScavengeSession';
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
  private animationFrame = 0;
  private elapsed = 0;
  private ended = false;
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
      void this.input.requestPointerLock();
    };
    this.ui.onResume = () => {
      void this.input.requestPointerLock();
    };
    this.ui.onReplay = () => window.location.reload();
    window.addEventListener('resize', this.onResize);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.onResize();
  }

  start(): void {
    this.clock.start();
    this.animationFrame = requestAnimationFrame(this.animate);
  }

  dispose(): void {
    cancelAnimationFrame(this.animationFrame);
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.input.dispose();
    this.interaction.dispose();
    this.world.dispose();
    this.renderer.dispose();
  }

  private readonly animate = (): void => {
    this.animationFrame = requestAnimationFrame(this.animate);
    const delta = Math.min(this.clock.getDelta(), 0.05);
    const before = this.session.snapshot();
    const active = before.status === 'running' && this.input.pointerLocked && !document.hidden;
    if (active) {
      this.session.tick(delta);
      this.elapsed = RUN_SECONDS - this.session.snapshot().remainingSeconds;
    }

    const snapshot = this.session.snapshot();
    const sinking = getSinkingState(this.elapsed, RUN_SECONDS);
    this.world.update(
      this.elapsed,
      delta,
      sinking,
      this.camera.position,
      this.reducedMotion.matches,
    );
    if (active) {
      const shake = this.reducedMotion.matches
        ? 0
        : Math.sin(this.elapsed * 37) * sinking.cameraShake;
      this.player.update(delta, this.input, shake);
      this.updateInteraction(snapshot.savedCount);
      this.updateFlight(delta, sinking.waveAmplitudeScale);
    } else {
      this.input.consumeLook();
    }

    const next = this.session.snapshot();
    this.ui.render(next, sinking);
    this.ui.setPrompt(active ? this.contextAction.prompt : '');
    if ((next.status === 'success' || next.status === 'failure') && !this.ended) {
      this.ended = true;
      if (document.pointerLockElement) document.exitPointerLock();
      this.ui.showResult(next);
    }
    this.renderer.render(this.scene, this.camera);
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
          this.session.loseCarried();
          this.world.loseItem(id);
        },
        onLanded: (id) => {
          this.session.dropCarried();
          this.world.landItem(id);
        },
      },
    );
  }

  private readonly onPointerLockChange = (): void => {
    const locked = this.input.pointerLocked;
    const status = this.session.snapshot().status;
    if (locked && status === 'idle') {
      this.session.start();
      this.ui.hideStart();
    } else if (locked && status === 'paused') {
      this.session.resume();
      this.ui.setPaused(false);
    } else if (!locked && status === 'running') {
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
}
