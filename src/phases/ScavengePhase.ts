import { Scene } from 'three';
import type { GamePhase, PhaseContext } from '../app/GamePhase';
import {
  advanceTerminalPresentation,
  pointerLockTransition,
  runGameplayFrame,
  type TerminalPresentation,
} from '../game/GameLoop';
import {
  ScavengeSession,
  type ScavengeResult,
} from '../game/ScavengeSession';
import {
  createItemInstances,
  type ItemInstance,
  type ItemInstanceId,
} from '../game/ItemState';
import { getSinkingState } from '../game/sinking';
import { InputController } from '../input/InputController';
import { CarryController } from '../interaction/CarryController';
import {
  chooseContextAction,
  InteractionSystem,
  type ContextAction,
} from '../interaction/InteractionSystem';
import { DEFAULT_WAVES, sampleWaveField } from '../ocean/WaveField';
import { PlayerController } from '../player/PlayerController';
import { GameUI } from '../ui/GameUI';
import { World } from '../world/World';

const RUN_SECONDS = 120;

export class ScavengePhase implements GamePhase {
  private readonly scene = new Scene();
  private readonly session: ScavengeSession;
  private readonly world: World;
  private readonly input: InputController;
  private readonly player: PlayerController;
  private readonly interaction: InteractionSystem;
  private readonly carry: CarryController;
  private readonly ui: GameUI;
  private readonly instancesById: ReadonlyMap<ItemInstanceId, ItemInstance>;
  private started = false;
  private disposed = false;
  private completionReported = false;
  private elapsed = 0;
  private terminalPresentation: TerminalPresentation = {
    phase: 'playing',
    remainingSeconds: 0,
  };
  private contextAction: ContextAction = { type: 'none', prompt: '' };

  constructor(
    private readonly context: PhaseContext,
    private readonly onComplete: (result: Readonly<ScavengeResult>) => void,
    private readonly onRestart: () => void,
  ) {
    this.scene.add(context.camera);
    this.ui = new GameUI(context.mount);
    const instances = createItemInstances();
    this.session = new ScavengeSession(instances);
    this.world = new World(
      this.scene,
      context.propModels,
      context.shipFurniture,
      context.maxTextureAnisotropy,
      context.skyAssets.moonTexture,
      instances,
    );
    this.instancesById = new Map(instances.map((instance) => [
      instance.instanceId,
      instance,
    ]));
    this.input = new InputController(context.renderer.domElement);
    this.player = new PlayerController(
      context.camera,
      this.world.ship,
      this.world.playerStart,
      this.world.colliders,
      this.world.playerNavigationBounds,
      () => this.session.penalize(5),
    );
    this.interaction = new InteractionSystem(context.camera);
    this.carry = new CarryController(this.scene, context.camera);

    this.ui.onStart = () => {
      void this.requestPointerLock();
    };
    this.ui.onResume = () => {
      void this.requestPointerLock();
    };
    this.ui.onReplay = this.onRestart;
  }

  start(): void {
    if (this.disposed || this.started) return;
    this.started = true;
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  update(_time: number, deltaSeconds: number): void {
    if (this.disposed) return;
    const before = this.session.snapshot();
    const active = before.status === 'running' && this.input.pointerLocked && !document.hidden;
    let sinking = getSinkingState(this.elapsed, RUN_SECONDS);
    const updateWorld = (worldDelta: number): void => {
      this.world.update(
        this.elapsed,
        worldDelta,
        sinking,
        this.context.camera.position,
        this.context.reducedMotion.matches,
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
        tick: () => this.session.tick(deltaSeconds),
        afterTick: () => {
          synchronizeElapsed();
          updateWorld(deltaSeconds);
        },
        move: () => {
          const shake = this.context.reducedMotion.matches
            ? 0
            : Math.sin(this.elapsed * 37) * sinking.cameraShake;
          this.player.update(deltaSeconds, this.input, shake);
        },
        afterMove: () => {
          if (synchronizeElapsed()) updateWorld(0);
        },
        interact: () => this.updateInteraction(),
        flight: () => this.updateFlight(deltaSeconds, sinking.waveAmplitudeScale),
        isRunning: () => this.session.snapshot().status === 'running',
      });
    } else {
      updateWorld(deltaSeconds);
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
      deltaSeconds,
    );
    if (this.terminalPresentation.phase === previousTerminalPhase) return;
    if (this.input.pointerLocked) document.exitPointerLock();
    if (this.terminalPresentation.phase === 'failureSequence') {
      this.ui.showFailureSequence();
    } else if (next.status === 'failure') {
      this.ui.showFailureResult(next);
    } else if (!this.completionReported) {
      const result = this.session.result();
      if (result !== null) {
        this.completionReported = true;
        this.onComplete(result);
      }
    }
  }

  resize(width: number, height: number): void {
    if (this.disposed || width <= 0 || height <= 0) return;
    this.context.camera.aspect = width / height;
    this.context.camera.updateProjectionMatrix();
  }

  render(): void {
    if (this.disposed) return;
    this.context.renderer.render(this.scene, this.context.camera);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    if (this.input.pointerLocked) document.exitPointerLock();
    this.carry.reset();
    this.input.dispose();
    this.interaction.dispose();
    this.world.dispose();
    this.ui.dispose();
  }

  private updateInteraction(): void {
    const snapshot = this.session.snapshot();
    const availableItems = [];
    const instances = new Map<ItemInstanceId, ItemInstance>();
    for (const [instanceId, object] of this.world.itemObjects) {
      const instance = this.instancesById.get(instanceId);
      if (
        !instance
        || object.userData.instanceId !== instanceId
        || object.userData.itemType !== instance.type
      ) continue;
      const state = snapshot.items[instanceId];
      if (!state || state.status !== 'available') continue;
      availableItems.push(object);
      instances.set(instance.instanceId, instance);
    }
    const target = this.interaction.update(availableItems, this.world.lifeboat, instances);
    const distanceToEvacuation = this.player.localPosition.distanceTo(this.world.evacuationPoint);
    this.contextAction = this.carry.flightActive
      ? { type: 'none', prompt: '' }
      : chooseContextAction({
        ...target,
        carriedItem: this.carry.activeInstance,
        remainingCapacity: 3 - snapshot.carriedWeight,
        nearEvacuation: distanceToEvacuation <= 1.7,
      });
    if (this.input.consumeInteract()) this.performAction(this.contextAction);
  }

  private performAction(action: ContextAction): void {
    if (action.type === 'pickUp') {
      const object = this.world.itemObjects.get(action.item.instanceId);
      if (object && this.session.pickUp(action.item.instanceId)) {
        this.carry.pickUp(action.item, object);
      }
    } else if (action.type === 'throwToBoat') {
      this.carry.throw();
    } else if (action.type === 'drop') {
      this.carry.drop();
    } else if (action.type === 'evacuate') {
      this.session.evacuate();
    } else if (action.type === 'capacityFull') {
      return;
    }
  }

  private updateFlight(deltaSeconds: number, amplitudeScale: number): void {
    this.world.lifeboat.updateMatrixWorld(true);
    const boatBox = this.world.lifeboatAcceptance
      .clone()
      .applyMatrix4(this.world.lifeboat.matrixWorld);
    this.carry.update(
      deltaSeconds,
      boatBox,
      (x, z) => sampleWaveField(DEFAULT_WAVES, this.elapsed, x, z, amplitudeScale).height,
      {
        onSaved: (instance) => {
          if (!this.session.saveCarried()) return;
          this.world.saveItem(instance);
        },
        onLost: (instance) => {
          if (!this.session.loseCarried()) return;
          this.world.loseItem(instance.instanceId);
        },
        onLanded: (instance) => {
          if (!this.session.dropCarried()) return;
          this.world.landItem(instance.instanceId);
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

  private async requestPointerLock(): Promise<void> {
    const acquired = await this.input.requestPointerLock();
    if (!acquired && !this.disposed) this.ui.showPointerLockError();
  }
}
