import { Box3, Scene, Vector3 } from 'three';
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
  ITEM_LABELS,
  type ItemInstance,
  type ItemInstanceId,
} from '../game/ItemState';
import { createScavengeItemInstances } from '../game/scavengeCatalog';
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
import type { ScavengeVisualState } from '../rendering/SceneRenderer';
import { projectScreenBounds } from '../rendering/projectScreenBounds';
import {
  GameUI,
  type ScavengeItemTooltip,
  type ScavengePresentation,
} from '../ui/GameUI';
import { World } from '../world/World';
import { commitBoatDeposit } from './scavengeDeposit';

const RUN_SECONDS = 120;
export const TITLE_CAMERA_POSITION = [33, 11.5, -4] as const;
export const TITLE_CAMERA_TARGET = [0, 5.5, 2] as const;
const titleCameraTarget = new Vector3(...TITLE_CAMERA_TARGET);

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
  private presentation: ScavengePresentation = 'title';
  private worldTime = 0;
  private readonly visualState: ScavengeVisualState = {
    kind: 'scavenge',
    elapsedSeconds: 0,
    sinkingProgress: 0,
  };
  private terminalPresentation: TerminalPresentation = {
    phase: 'playing',
    remainingSeconds: 0,
  };
  private contextAction: ContextAction = { type: 'none', prompt: '' };
  private itemTooltip: ScavengeItemTooltip | null = null;
  private readonly itemTooltipBounds = new Box3();
  private viewportWidth = 1;
  private viewportHeight = 1;
  private overlayActive = false;

  constructor(
    private readonly context: PhaseContext,
    private readonly onComplete: (result: Readonly<ScavengeResult>) => void,
    private readonly onRestart: () => void,
  ) {
    this.scene.add(context.camera);
    this.ui = new GameUI(context.mount, context.visualQuality);
    const instances = createScavengeItemInstances();
    this.session = new ScavengeSession(instances);
    this.world = new World(
      this.scene,
      context.propModels,
      context.shipFurniture,
      context.maxTextureAnisotropy,
      context.skyAssets.moonTexture,
      instances,
      Math.random,
      {},
      context.lifeboatAssets,
      context.shipAssets,
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
      this.world.arcColliders,
    );
    this.interaction = new InteractionSystem(context.camera, {
      root: this.world.ship,
      colliders: this.world.interactionOccluders,
      dropFloor: {
        y: this.world.deckY,
        bounds: this.world.playerNavigationBounds.safe,
        colliders: this.world.colliders,
      },
    });
    this.carry = new CarryController(this.scene, context.camera);

    this.ui.onStart = () => {
      void this.requestPointerLock();
    };
    this.ui.onResume = () => {
      void this.requestPointerLock();
    };
    this.ui.onReplay = this.onRestart;
    this.ui.setPresentation('title');
    this.applyTitleCamera();
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
    const sessionActive = before.status === 'running' && !document.hidden;
    const directControlActive = sessionActive && this.input.pointerLocked;
    const overlaySimulationActive = sessionActive && this.overlayActive;
    if (
      this.presentation === 'title'
      || directControlActive
      || overlaySimulationActive
    ) {
      this.worldTime += deltaSeconds;
    }
    let sinking = getSinkingState(this.elapsed, RUN_SECONDS);
    this.syncVisualState(sinking);
    const updateWorld = (worldDelta: number): void => {
      this.world.update(
        this.worldTime,
        worldDelta,
        sinking,
        this.context.camera.position,
      );
    };
    const synchronizeElapsed = (): boolean => {
      const nextElapsed = RUN_SECONDS - this.session.snapshot().remainingSeconds;
      if (nextElapsed === this.elapsed) return false;
      this.elapsed = nextElapsed;
      sinking = getSinkingState(this.elapsed, RUN_SECONDS);
      this.syncVisualState(sinking);
      return true;
    };

    if (directControlActive) {
      runGameplayFrame(true, {
        tick: () => this.session.tick(deltaSeconds),
        afterTick: () => {
          synchronizeElapsed();
          updateWorld(deltaSeconds);
        },
        move: () => {
          const shake = Math.sin(this.elapsed * 37) * sinking.cameraShake;
          this.player.update(deltaSeconds, this.input, shake);
        },
        afterMove: () => {
          if (synchronizeElapsed()) updateWorld(0);
        },
        interact: () => this.updateInteraction(),
        flight: () => this.updateFlight(deltaSeconds, sinking.waveAmplitudeScale),
        isRunning: () => this.session.snapshot().status === 'running',
      });
    } else if (overlaySimulationActive) {
      this.session.tick(deltaSeconds);
      synchronizeElapsed();
      updateWorld(deltaSeconds);
      if (this.session.snapshot().status === 'running') {
        const shake = Math.sin(this.elapsed * 37) * sinking.cameraShake;
        this.player.updatePassive(deltaSeconds, shake);
        this.updateFlight(deltaSeconds, sinking.waveAmplitudeScale);
      }
      this.input.consumeLook();
    } else {
      updateWorld(deltaSeconds);
      this.input.consumeLook();
    }

    const next = this.session.snapshot();
    this.ui.render(next, sinking);
    const stillActive = next.status === 'running' && this.input.pointerLocked && !document.hidden;
    const visibleItemTooltip = stillActive ? this.itemTooltip : null;
    this.ui.setPrompt(visibleItemTooltip === null && stillActive ? this.contextAction.prompt : '');
    this.ui.setItemTooltip?.(visibleItemTooltip);

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
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.context.camera.aspect = width / height;
    this.context.camera.updateProjectionMatrix();
  }

  setOverlayActive(active: boolean): void {
    if (this.disposed || this.overlayActive === active) return;
    this.overlayActive = active;
    if (
      !active
      && this.session.snapshot().status === 'running'
      && !this.input.pointerLocked
      && !document.hidden
    ) {
      void this.requestPointerLock();
    }
  }

  render(): void {
    if (this.disposed) return;
    this.context.sceneRenderer.render(this.scene, this.context.camera, this.visualState);
  }

  private syncVisualState(sinking: Readonly<ReturnType<typeof getSinkingState>>): void {
    this.visualState.elapsedSeconds = this.elapsed;
    this.visualState.sinkingProgress = sinking.progress;
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
    this.itemTooltip = null;
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
    const target = this.interaction.update(
      availableItems,
      this.world.lifeboat,
      this.world.boatDepositTarget,
      instances,
    );
    const distanceToEvacuation = this.player.localPosition.distanceTo(this.world.evacuationPoint);
    this.contextAction = this.carry.flightActive
      ? { type: 'none', prompt: '' }
      : chooseContextAction({
        ...target,
        carriedItem: this.carry.activeInstance,
        remainingCapacity: 3 - snapshot.carriedWeight,
        nearEvacuation: distanceToEvacuation <= 1.7,
      });
    if (target.target === 'item' && target.targetItem !== null) {
      const object = this.world.itemObjects.get(target.targetItem.instanceId);
      if (object !== undefined) {
        this.itemTooltipBounds.setFromObject(object, true);
        const projected = projectScreenBounds(
          this.itemTooltipBounds,
          this.context.camera,
          this.viewportWidth,
          this.viewportHeight,
        );
        if (projected.visible) {
          const placement = projected.y - projected.height / 2 >= 96 ? 'above' : 'below';
          this.itemTooltip = {
            text: ITEM_LABELS[target.targetItem.type],
            x: projected.x,
            y: placement === 'above'
              ? projected.y - projected.height / 2
              : projected.y + projected.height / 2,
            placement,
          };
        }
      }
    }
    if (this.input.consumeInteract()) this.performAction(this.contextAction);
  }

  private performAction(action: ContextAction): void {
    if (action.type === 'pickUp') {
      const object = this.world.itemObjects.get(action.item.instanceId);
      if (object && this.session.pickUp(action.item.instanceId)) {
        this.carry.pickUp(action.item, object);
      }
    } else if (action.type === 'depositBundle') {
      commitBoatDeposit(this.session, this.carry, this.world);
    } else if (action.type === 'drop') {
      const released = this.carry.releaseActive();
      if (!released || !this.session.dropCarried()) return;
      this.world.dropItem(released.instanceId, action.point);
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
      (x, z) => sampleWaveField(DEFAULT_WAVES, this.worldTime, x, z, amplitudeScale).height,
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

  private handlePointerLockChange(locked: boolean): void {
    if (this.overlayActive && !locked) return;
    const status = this.session.snapshot().status;
    const transition = pointerLockTransition(status, locked);
    if (transition === 'start') {
      this.player.placeCamera();
      this.presentation = 'playing';
      this.ui.setPresentation('playing');
      this.ui.clearPointerLockError();
      this.ui.hideStart();
      this.session.start();
    } else if (transition === 'resume') {
      this.session.resume();
      this.ui.clearPointerLockError();
      this.ui.setPaused(false);
    } else if (transition === 'pause') {
      this.session.pause();
      this.ui.setPaused(true);
    }
  }

  private applyTitleCamera(): void {
    this.context.camera.position.set(...TITLE_CAMERA_POSITION);
    this.context.camera.lookAt(titleCameraTarget);
    this.context.camera.updateMatrixWorld(true);
  }

  private readonly onPointerLockChange = (): void => {
    this.handlePointerLockChange(this.input.pointerLocked);
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
    if (acquired || this.disposed) return;
    this.ui.showPointerLockError();
    if (
      !this.overlayActive
      && this.session.snapshot().status === 'running'
    ) {
      this.session.pause();
      this.ui.setPaused(true);
    }
  }
}
