import {
  Box3,
  Scene,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three';
import type { GamePhase, PhaseContext } from '../app/GamePhase';
import { pointerLockTransition } from '../game/GameLoop';
import {
  advanceScavengeEnding,
  createScavengeCinematicFrame,
  createScavengeEndingState,
  sampleScavengeCinematicFrameInto,
  SINKING_CINEMATIC_SECONDS,
} from '../game/scavengeEnding';
import {
  advanceScavengeIntroElapsed,
  createScavengeIntroFrame,
  crossedScavengeIntroTime,
  sampleScavengeIntroFrameInto,
  SCAVENGE_INTRO_CRASH_SECONDS,
} from '../game/scavengeIntro';
import { containsPointXZ, SCAVENGE_DURATION_SECONDS } from '../game/scavengeRules';
import {
  ScavengeSession,
  type ScavengeResult,
  type ScavengeSnapshot,
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
import { PlayerController } from '../player/PlayerController';
import {
  ScavengeHands,
  type ScavengeHandModelFactory,
} from '../player/ScavengeHands';
import type { ScavengeVisualState } from '../rendering/SceneRenderer';
import { projectScreenBounds } from '../rendering/projectScreenBounds';
import {
  GameUI,
  type ScavengeItemTooltip,
  type ScavengePresentation,
} from '../ui/GameUI';
import type { PresentationWeatherId } from '../weather/presentationWeather';
import type { WaterQuality } from '../rendering/waterQuality';
import { World } from '../world/World';
import {
  collectMeshResources,
  disposeMeshResources,
} from '../world/SceneResources';
import { commitBoatDeposit } from './scavengeDeposit';
import { ScavengeAudio } from '../audio/ScavengeAudio';
import type { PlayerMotionSample } from '../player/PlayerController';

export const TITLE_CAMERA_POSITION = [33, 11.5, -4] as const;
export const TITLE_CAMERA_TARGET = [0, 5.5, 2] as const;
const titleCameraTarget = new Vector3(...TITLE_CAMERA_TARGET);

function createScavengeHandModelFactory(
  propModels: PhaseContext['propModels'],
): ScavengeHandModelFactory {
  return {
    create(id) {
      const presentation = propModels.createEventModel(id);
      if (presentation === null) throw new Error(`Missing event model: ${id}`);
      const geometries = new Set<BufferGeometry>();
      const materials = new Set<Material>();
      collectMeshResources(presentation.root, geometries, materials);
      let disposed = false;
      return {
        root: presentation.root,
        dispose(): void {
          if (disposed) return;
          disposed = true;
          presentation.root.removeFromParent();
          disposeMeshResources(geometries, materials);
        },
      };
    },
  };
}

export class ScavengePhase implements GamePhase {
  private readonly scene = new Scene();
  private readonly session: ScavengeSession;
  private readonly world: World;
  private readonly input: InputController;
  private readonly player: PlayerController;
  private readonly hands: ScavengeHands;
  private readonly interaction: InteractionSystem;
  private readonly carry: CarryController;
  private readonly ui: GameUI;
  private readonly instancesById: ReadonlyMap<ItemInstanceId, ItemInstance>;
  private started = false;
  private disposed = false;
  private completionReported = false;
  private elapsed = 0;
  private presentation: ScavengePresentation = 'title';
  private introElapsed = 0;
  private introPaused = false;
  private pausedIntroExitCarry = false;
  private introCrashHandled = false;
  private readonly introFrame = createScavengeIntroFrame();
  private readonly introPose = {
    position: this.introFrame.cameraPosition,
    yaw: Math.PI,
    pitch: 0,
    floorEyeY: 0,
  };
  private worldTime = 0;
  private readonly visualState: ScavengeVisualState = {
    kind: 'scavenge',
    elapsedSeconds: 0,
    sinkingProgress: 0,
  };
  private ending = createScavengeEndingState();
  private endingStarted = false;
  private readonly cinematicFrame = createScavengeCinematicFrame();
  private readonly cinematicCameraTarget = new Vector3();
  private contextAction: ContextAction = { type: 'none', prompt: '' };
  private itemTooltip: ScavengeItemTooltip | null = null;
  private readonly itemTooltipBounds = new Box3();
  private viewportWidth = 1;
  private viewportHeight = 1;
  private overlayActive = false;
  private escapeResumeArmed = false;
  private presentationWeather: PresentationWeatherId = 'calm';
  private readonly audio: ScavengeAudio;

  constructor(
    private readonly context: PhaseContext,
    private readonly onComplete: (result: Readonly<ScavengeResult>) => void,
    private readonly onRestart: () => void,
  ) {
    this.scene.add(context.camera);
    this.ui = new GameUI(context.mount);
    const instances = createScavengeItemInstances();
    this.session = new ScavengeSession(instances);
    this.world = new World(
      this.scene,
      context.propModels,
      context.shipFurniture,
      context.maxTextureAnisotropy,
      context.skyAssets.moonTexture,
      context.physicsRuntime,
      instances,
      Math.random,
      { physicsMode: context.physicsMode },
      context.lifeboatAssets,
      context.shipAssets,
      context.waterQuality?.get() ?? 'low',
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
      this.world.climbZones,
    );
    this.hands = new ScavengeHands(
      context.camera,
      createScavengeHandModelFactory(context.propModels),
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
    this.audio = new ScavengeAudio(context.audio.createScope());

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
    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('keyup', this.onKeyUp);
    this.audio.start();
  }

  update(_time: number, deltaSeconds: number): void {
    if (this.disposed) return;
    const before = this.session.snapshot();
    let current = before;
    const sessionActive = this.ending.stage === 'playing'
      && before.status === 'running'
      && !document.hidden;
    const directControlActive = sessionActive && this.input.pointerLocked;
    const overlaySimulationActive = sessionActive && this.overlayActive === true;
    const introFrameStarted = this.presentation === 'intro';
    const introActive = introFrameStarted
      && !this.introPaused
      && this.input.pointerLocked
      && !document.hidden;
    const worldDeltaSeconds = (
      (introFrameStarted && !introActive) || this.pausedIntroExitCarry
    ) ? 0 : deltaSeconds;
    if (
      this.presentation === 'title'
      || introActive
      || directControlActive
      || overlaySimulationActive
      || this.ending.stage === 'sinking'
    ) {
      this.worldTime += deltaSeconds;
    }
    let sinking = getSinkingState(this.elapsed, SCAVENGE_DURATION_SECONDS);
    let motion: PlayerMotionSample | null = null;

    if (introActive) {
      this.updateIntro(deltaSeconds);
      current = this.session.snapshot();
      this.input.clearLook();
    } else if (directControlActive) {
      this.session.tick(deltaSeconds, containsPointXZ(
        this.world.evacuationBounds,
        this.player.localPosition,
      ));
      current = this.session.snapshot();
      this.synchronizeElapsed(current);
      if (current.status === 'running') {
        motion = this.player.update(deltaSeconds, this.input);
        current = this.session.snapshot();
        this.synchronizeElapsed(current);
        if (current.status === 'running') {
          this.updateInteraction();
          current = this.session.snapshot();
          if (current.status === 'running') {
            sinking = getSinkingState(this.elapsed, SCAVENGE_DURATION_SECONDS);
            this.updateFlight(deltaSeconds, sinking.waveAmplitudeScale);
            current = this.session.snapshot();
          }
        }
      }
    } else if (overlaySimulationActive) {
      this.session.tick(deltaSeconds, containsPointXZ(
        this.world.evacuationBounds,
        this.player.localPosition,
      ));
      current = this.session.snapshot();
      this.synchronizeElapsed(current);
      if (current.status === 'running') {
        motion = this.player.updatePassive(deltaSeconds);
        current = this.session.snapshot();
        sinking = getSinkingState(this.elapsed, SCAVENGE_DURATION_SECONDS);
        this.updateFlight(deltaSeconds, sinking.waveAmplitudeScale);
        current = this.session.snapshot();
      }
      this.input.clearLook();
    } else if (this.ending.stage === 'playing') {
      this.input.clearLook();
    }

    sinking = getSinkingState(this.elapsed, SCAVENGE_DURATION_SECONDS);
    const next = current;
    const failureStarted = !this.endingStarted && next.status === 'failure';
    this.ending = advanceScavengeEnding(
      this.ending,
      next.status,
      failureStarted ? 0 : deltaSeconds,
    );
    if (failureStarted) {
      this.endingStarted = true;
      this.hands.hideAndReset();
      this.audio.sink();
      this.world.attachPhysicsBarrelsToShip();
      if (this.input.pointerLocked) document.exitPointerLock();
      this.contextAction = { type: 'none', prompt: '' };
      this.itemTooltip = null;
    }

    let blackout = 0;
    if (this.endingStarted) {
      const cinematicElapsed = this.ending.stage === 'sinking'
        ? this.ending.elapsedSeconds
        : SINKING_CINEMATIC_SECONDS;
      sampleScavengeCinematicFrameInto(this.cinematicFrame, cinematicElapsed);
      sinking = this.cinematicFrame.sinking;
      blackout = this.cinematicFrame.blackout;
      this.context.camera.position.set(
        this.cinematicFrame.cameraPosition[0],
        this.cinematicFrame.cameraPosition[1],
        this.cinematicFrame.cameraPosition[2],
      );
      this.cinematicCameraTarget.set(
        this.cinematicFrame.cameraTarget[0],
        this.cinematicFrame.cameraTarget[1],
        this.cinematicFrame.cameraTarget[2],
      );
      this.context.camera.lookAt(this.cinematicCameraTarget);
      this.context.camera.updateMatrixWorld(true);
    }
    this.syncVisualState(sinking);
    this.audio.update(motion, directControlActive, this.elapsed);
    const simulatePhysics = this.ending.stage === 'playing'
      && (directControlActive || overlaySimulationActive)
      && next.status === 'running';
    this.world.update(
      this.worldTime,
      worldDeltaSeconds,
      sinking,
      this.context.camera.position,
      simulatePhysics,
    );
    if (simulatePhysics || introFrameStarted || this.pausedIntroExitCarry) {
      this.player.placeCamera();
    }
    const handsVisible = this.ending.stage === 'playing'
      && next.status === 'running'
      && this.input.pointerLocked
      && !this.overlayActive
      && !document.hidden;
    this.hands.update(
      deltaSeconds,
      motion?.movedDistance ?? 0,
      motion?.grounded ?? false,
      this.input.sprinting,
      handsVisible,
    );
    this.ui.render(next);
    const stillActive = this.ending.stage === 'playing'
      && next.status === 'running'
      && this.input.pointerLocked
      && !document.hidden;
    const visibleItemTooltip = stillActive ? this.itemTooltip : null;
    this.ui.setPrompt(visibleItemTooltip === null && stillActive ? this.contextAction.prompt : '');
    this.ui.setItemTooltip?.(visibleItemTooltip);
    this.ui.setPickupPointer?.(stillActive && this.contextAction.type === 'pickUp');
    this.ui.renderEnding(this.ending.stage, blackout);

    if (next.status === 'success' && !this.completionReported) {
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
    if (active) this.hands.hideAndReset();
    this.audio.setPaused(active);
    if (
      !active
      && this.session.snapshot().status === 'running'
      && !this.input.pointerLocked
      && !document.hidden
    ) {
      void this.requestPointerLock();
    }
  }

  setWeatherOverride(id: PresentationWeatherId | null): void {
    this.presentationWeather = id ?? 'calm';
    this.world.setPresentationWeather(this.presentationWeather);
  }

  setWaterQuality(value: WaterQuality): void {
    if (this.disposed) return;
    this.world.setWaterQuality(value);
  }

  getPresentationWeather(): PresentationWeatherId {
    return this.presentationWeather;
  }

  render(): void {
    if (this.disposed) return;
    this.context.sceneRenderer.render(this.scene, this.context.camera, this.visualState);
  }

  private syncVisualState(sinking: Readonly<ReturnType<typeof getSinkingState>>): void {
    this.visualState.elapsedSeconds = this.elapsed;
    this.visualState.sinkingProgress = sinking.progress;
  }

  private synchronizeElapsed(snapshot: ScavengeSnapshot): void {
    const nextElapsed = SCAVENGE_DURATION_SECONDS - snapshot.remainingSeconds;
    if (nextElapsed !== this.elapsed) this.elapsed = nextElapsed;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    document.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('keyup', this.onKeyUp);
    if (this.input.pointerLocked) document.exitPointerLock();
    this.carry.reset();
    this.audio.dispose();
    this.input.dispose();
    this.interaction.dispose();
    this.hands.dispose();
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
    const nearEvacuation = containsPointXZ(
      this.world.evacuationBounds,
      this.player.localPosition,
    );
    const target = this.interaction.update(
      availableItems,
      this.world.lifeboat,
      this.world.boatDepositTarget,
      instances,
      nearEvacuation,
    );
    this.contextAction = this.carry.flightActive
      ? { type: 'none', prompt: '' }
      : chooseContextAction({
        ...target,
        carriedItem: this.carry.activeInstance,
        remainingCapacity: 3 - snapshot.carriedWeight,
        nearEvacuation,
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
        this.world.showItemPickupSmoke(action.item.instanceId);
        this.carry.pickUp(action.item, object);
        this.hands.playGesture('pickup');
        this.audio.itemHandled();
      }
    } else if (action.type === 'depositBundle') {
      if (commitBoatDeposit(this.session, this.carry, this.world)) {
        this.hands.playGesture('boat-deposit');
        this.audio.itemHandled();
      }
    } else if (action.type === 'drop') {
      const released = this.carry.releaseActive();
      if (!released || !this.session.dropCarried()) return;
      this.world.dropItem(released.instanceId, action.point);
      this.hands.playGesture('ground-drop');
      this.audio.itemHandled();
    } else if (action.type === 'evacuate') {
      this.session.evacuate();
    } else if (action.type === 'capacityFull') {
      this.audio.deny();
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
      (x, z) => this.world.sampleFlightWaterHeight(this.worldTime, x, z, amplitudeScale),
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

  private beginIntro(): void {
    this.input.consumeJump();
    this.presentation = 'intro';
    this.ui.setPresentation('intro');
    this.ui.clearPointerLockError();
    this.ui.hideStart();
    this.audio.setPaused(false);
    this.introPaused = false;
    sampleScavengeIntroFrameInto(
      this.introFrame,
      this.introElapsed,
      this.world.scavengeIntroAnchors,
    );
    this.applyIntroFrame();
    this.player.placeCamera();
  }

  private updateIntro(deltaSeconds: number): void {
    const previousElapsed = this.introElapsed;
    this.introElapsed = advanceScavengeIntroElapsed(this.introElapsed, deltaSeconds);
    sampleScavengeIntroFrameInto(
      this.introFrame,
      this.introElapsed,
      this.world.scavengeIntroAnchors,
    );
    this.applyIntroFrame();
    if (!this.introCrashHandled && crossedScavengeIntroTime(
      previousElapsed,
      this.introElapsed,
      SCAVENGE_INTRO_CRASH_SECONDS,
    )) {
      this.introCrashHandled = true;
      this.audio.crash();
      this.world.triggerScavengeIntroCrash();
    }
    if (this.introFrame.complete) this.completeIntro();
  }

  private applyIntroFrame(): void {
    this.introPose.yaw = this.introFrame.cameraYaw;
    this.introPose.pitch = this.introFrame.cameraPitch;
    this.introPose.floorEyeY = this.introFrame.cameraPosition[1];
    this.player.setScriptedPose(this.introPose);
    this.world.setScavengeIntroImpact(
      this.introFrame.impactY,
      this.introFrame.impactPitch,
      this.introFrame.impactRoll,
    );
  }

  private completeIntro(): void {
    if (this.presentation !== 'intro') return;
    const resumeRequired = this.introPaused;
    this.input.consumeJump();
    const exit = this.world.scavengeIntroAnchors.exitPosition;
    this.world.setScavengeIntroImpact(0, 0, 0);
    this.player.setScriptedPose({
      position: exit,
      yaw: 0,
      pitch: 0,
      floorEyeY: exit[1],
    });
    this.player.placeCamera();
    this.introPaused = false;
    this.presentation = 'playing';
    this.ui.setPresentation('playing');
    this.session.start();
    this.audio.beginRun();
    if (resumeRequired) {
      this.pausedIntroExitCarry = true;
      this.session.pause();
    }
  }

  private handlePointerLockChange(locked: boolean): void {
    if (this.presentation === 'intro') {
      this.introPaused = !locked;
      this.escapeResumeArmed = false;
      this.ui.setPaused(!locked);
      this.audio.setPaused(!locked);
      return;
    }
    if (this.overlayActive && !locked) return;
    const status = this.session.snapshot().status;
    const transition = pointerLockTransition(status, locked);
    if (transition === 'start') {
      this.beginIntro();
    } else if (transition === 'resume') {
      this.escapeResumeArmed = false;
      this.session.resume();
      this.pausedIntroExitCarry = false;
      this.ui.clearPointerLockError();
      this.ui.setPaused(false);
      this.audio.setPaused(false);
    } else if (transition === 'pause') {
      this.escapeResumeArmed = false;
      this.session.pause();
      this.ui.setPaused(true);
      this.hands.hideAndReset();
      this.audio.setPaused(true);
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

  private handleVisibilityChange(): void {
    if (!document.hidden) return;
    if (this.presentation === 'intro') {
      this.introPaused = true;
      this.ui.setPaused(true);
      this.audio.setPaused(true);
      if (document.pointerLockElement) document.exitPointerLock();
    } else if (this.session.snapshot().status === 'running') {
      this.session.pause();
      this.ui.setPaused(true);
      this.hands.hideAndReset();
      this.audio.setPaused(true);
      if (document.pointerLockElement) document.exitPointerLock();
    }
  }

  private readonly onVisibilityChange = (): void => this.handleVisibilityChange();

  private handleKeyDown(event: KeyboardEvent): void {
    if (this.presentation === 'intro' && event.code === 'Space' && !event.repeat) {
      event.preventDefault();
      this.completeIntro();
      return;
    }
    if (
      event.key !== 'Escape'
      || event.repeat
      || !this.escapeResumeArmed
      || this.overlayActive
      || document.hidden
      || this.session.snapshot().status !== 'paused'
    ) return;
    event.preventDefault();
    void this.requestPointerLock();
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => this.handleKeyDown(event);

  private handleKeyUp(event: KeyboardEvent): void {
    if (
      event.key === 'Escape'
      && !this.overlayActive
      && !document.hidden
      && this.session.snapshot().status === 'paused'
    ) {
      this.escapeResumeArmed = true;
    }
  }

  private readonly onKeyUp = (event: KeyboardEvent): void => this.handleKeyUp(event);

  private async requestPointerLock(): Promise<void> {
    const acquired = await this.input.requestPointerLock();
    if (acquired || this.disposed) return;
    this.ui.showPointerLockError();
    this.audio.deny();
    if (
      !this.overlayActive
      && this.session.snapshot().status === 'running'
    ) {
      this.session.pause();
      this.ui.setPaused(true);
      this.hands.hideAndReset();
      this.audio.setPaused(true);
    }
  }
}
