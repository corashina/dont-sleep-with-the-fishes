import { onLanguageChange } from '../i18n/language';
import {
  Box3,
  Group,
  Quaternion,
  Scene,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three';
import type { GamePhase, PhaseContext } from '../app/GamePhase';
import type { VisualQuality } from '../rendering/visualQuality';
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
import type { EndingRecord } from '../game/ending';
import { scavengeSpeedMultiplier } from '../game/scavengeMovement';
import {
  createShipAlarmPhase,
  createShipDangerState,
  resetShipAlarmPhase,
  sampleShipDangerStateInto,
} from '../game/shipDanger';
import { getSinkingState } from '../game/sinking';
import { InputController } from '../input/InputController';
import { CarryController } from '../interaction/CarryController';
import {
  chooseContextAction,
  InteractionSystem,
  type ContextAction,
  type InteractionTarget,
} from '../interaction/InteractionSystem';
import { PlayerController } from '../player/PlayerController';
import {
  ScavengeHands,
  type ScavengeHandModelFactory,
} from '../player/ScavengeHands';
import type { ScavengeVisualState } from '../rendering/SceneRenderer';
import { HoverOutline } from '../rendering/HoverOutline';
import { sampleMenuFade } from '../menu/menuChoreography';
import { projectScreenBounds } from '../rendering/projectScreenBounds';
import {
  GameUI,
  type ScavengeItemTooltip,
  type ScavengePresentation,
} from '../ui/GameUI';
import type { PresentationWeatherId } from '../weather/presentationWeather';
import type { SkyPhase } from '../world/skyPalette';
import type { WaterQuality } from '../rendering/waterQuality';
import { World } from '../world/World';
import {
  collectMeshResources,
  disposeMeshResources,
} from '../world/SceneResources';
import { commitBoatDeposit } from './scavengeDeposit';
import { ScavengeAudio } from '../audio/ScavengeAudio';
import type {
  AudioListenerPose,
  SpatialAudioEmitter,
} from '../audio/AudioBackend';
import type { PlayerMotionSample } from '../player/PlayerController';
import { SHIP_DANGER_LAYOUT } from '../world/ShipDangerLayout';

const ALARM_AUDIO_EMITTERS: readonly SpatialAudioEmitter[] = Object.freeze(
  SHIP_DANGER_LAYOUT.alarms.map(({ position }) => Object.freeze({ position })),
);

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

export type ScavengePhaseStart = 'intro' | 'ending-preview';

export class ScavengePhase implements GamePhase {
  private readonly scene = new Scene();
  private readonly session: ScavengeSession;
  private readonly world: World;
  private readonly input: InputController;
  private readonly player: PlayerController;
  private readonly hands: ScavengeHands;
  private readonly interaction: InteractionSystem;
  private readonly itemHoverOutline = new HoverOutline();
  private readonly carry: CarryController;
  private readonly ui: GameUI;
  private readonly instancesById: ReadonlyMap<ItemInstanceId, ItemInstance>;
  private started = false;
  private disposed = false;
  private completionReported = false;
  private elapsed = 0;
  private readonly dangerState = createShipDangerState();
  private readonly alarmPhase = createShipAlarmPhase();
  private presentation: ScavengePresentation = 'intro';
  private introBegun = false;
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
  private endingBlackout = 0;
  private dorothyEnding: Extract<EndingRecord, { id: 'dorothy' }> | null = null;
  private readonly cinematicFrame = createScavengeCinematicFrame();
  private readonly cinematicCameraTarget = new Vector3();
  private contextAction: ContextAction = { type: 'none', prompt: '' };
  private itemTooltip: ScavengeItemTooltip | null = null;
  private readonly itemTooltipBounds = new Box3();
  private viewportWidth = 1;
  private viewportHeight = 1;
  private overlayActive = false;
  private escapeResumeArmed = false;
  private escapeKeyHeld = false;
  private presentationWeather: PresentationWeatherId = 'calm';
  private presentationPhase: SkyPhase = 'day';
  private readonly audio: ScavengeAudio;
  private readonly audioForward = new Vector3(0, 0, -1);
  private readonly audioUp = new Vector3(0, 1, 0);
  private readonly audioLocalQuaternion = new Quaternion();
  private readonly audioListenerPose: AudioListenerPose;
  private unsubscribeLanguage: () => void = () => undefined;

  constructor(
    private readonly context: PhaseContext,
    private readonly onComplete: (result: Readonly<ScavengeResult>) => void,
    private readonly onRestart: () => void,
    private readonly onReturnToMenu: () => void,
    private readonly phaseStart: ScavengePhaseStart = 'intro',
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
      context.visualQuality.get(),
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
      this.world.resolvePlayerMovement,
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
    this.audioListenerPose = {
      position: this.player.localPosition,
      forward: this.audioForward,
      up: this.audioUp,
    };
    this.audio = new ScavengeAudio(
      context.audio.createScope(),
      ALARM_AUDIO_EMITTERS,
    );

    this.ui.onResume = () => {
      void this.requestPointerLock();
    };
    this.ui.onRestart = this.onRestart;
    this.ui.onReturnToMenu = this.onReturnToMenu;
    this.ui.setPresentation('intro');
    this.ui.setIntroFadeProgress(1);
  }

  start(): void {
    if (this.disposed || this.started) return;
    this.started = true;
    this.unsubscribeLanguage = onLanguageChange(() => this.renderInterface(this.session.snapshot()));
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('keyup', this.onKeyUp);
    this.world.revealPhysicsObjects();
    this.audio.start();
    if (this.phaseStart === 'ending-preview') {
      this.startEndingPreview();
      return;
    }
    if (this.input.pointerLocked) {
      this.beginIntro();
    } else {
      void this.requestPointerLock();
    }
  }

  private startEndingPreview(): void {
    this.presentation = 'playing';
    this.ui.setPresentation('playing');
    this.ui.setIntroFadeProgress(0);
    this.session.start();
    this.session.tick(SCAVENGE_DURATION_SECONDS);
    this.synchronizeElapsed(this.session.snapshot());
    this.update(0, 0);
  }

  update(_time: number, deltaSeconds: number): void {
    if (this.disposed) return;
    const before = this.session.snapshot();
    const directControlActive = this.hasDirectControl(before);
    const introFrameStarted = this.presentation === 'intro';
    const introActive = this.hasActiveIntro(introFrameStarted);
    const worldDeltaSeconds = this.worldDeltaSeconds(
      deltaSeconds,
      introFrameStarted,
      introActive,
    );
    this.advanceWorldTime(
      deltaSeconds,
      introActive,
      directControlActive,
    );
    if (!directControlActive) this.itemHoverOutline.setTarget(null);
    const motion = this.updateSimulation(
      deltaSeconds,
      introActive,
      directControlActive,
    );
    const next = this.session.snapshot();
    const sinking = this.updateEnding(this.overlayActive ? 0 : deltaSeconds, next);
    this.syncVisualState(sinking);
    this.audio.update(
      motion,
      directControlActive,
      this.elapsed,
      this.updateAudioListenerPose(),
    );
    const simulatePhysics = this.shouldSimulatePhysics(next, directControlActive);
    this.updateWorldFrame(worldDeltaSeconds, sinking, simulatePhysics, introFrameStarted);
    this.updateHands(deltaSeconds, motion, next);
    this.renderInterface(next);
    this.reportCompletion(next);
  }

  private hasDirectControl(snapshot: ScavengeSnapshot): boolean {
    return this.hasActiveSession(snapshot) && this.input.pointerLocked;
  }

  private hasActiveSession(snapshot: ScavengeSnapshot): boolean {
    return this.ending.stage === 'playing'
      && snapshot.status === 'running'
      && !this.overlayActive
      && !document.hidden;
  }

  private hasActiveIntro(introFrameStarted: boolean): boolean {
    return introFrameStarted
      && !this.introPaused
      && this.input.pointerLocked
      && !this.overlayActive
      && !document.hidden;
  }

  private worldDeltaSeconds(
    deltaSeconds: number,
    introFrameStarted: boolean,
    introActive: boolean,
  ): number {
    return this.overlayActive || (introFrameStarted && !introActive) || this.pausedIntroExitCarry
      ? 0
      : deltaSeconds;
  }

  private advanceWorldTime(
    deltaSeconds: number,
    introActive: boolean,
    directControlActive: boolean,
  ): void {
    if (this.overlayActive) return;
    if (
      introActive
      || directControlActive
      || this.ending.stage === 'sinking'
    ) {
      this.worldTime += deltaSeconds;
    }
  }

  private updateSimulation(
    deltaSeconds: number,
    introActive: boolean,
    directControlActive: boolean,
  ): PlayerMotionSample | null {
    if (introActive) return this.updateIntroSimulation(deltaSeconds);
    if (directControlActive) return this.updateDirectControl(deltaSeconds);
    if (this.ending.stage === 'playing') this.input.clearLook();
    return null;
  }

  private updateIntroSimulation(deltaSeconds: number): null {
    this.updateIntro(deltaSeconds);
    this.input.clearLook();
    return null;
  }

  private updateDirectControl(deltaSeconds: number): PlayerMotionSample | null {
    let snapshot = this.tickSession(deltaSeconds);
    if (snapshot.status !== 'running') return null;
    const motion = this.player.update(
      deltaSeconds,
      this.input,
      scavengeSpeedMultiplier(snapshot.carriedWeight),
    );
    snapshot = this.session.snapshot();
    this.synchronizeElapsed(snapshot);
    if (snapshot.status !== 'running') return motion;
    this.updateInteraction();
    snapshot = this.session.snapshot();
    if (snapshot.status === 'running') {
      this.updateFlight(
        deltaSeconds,
        getSinkingState(this.elapsed, SCAVENGE_DURATION_SECONDS).waveAmplitudeScale,
      );
    }
    return motion;
  }

  private tickSession(deltaSeconds: number): ScavengeSnapshot {
    this.session.tick(deltaSeconds, containsPointXZ(
      this.world.evacuationBounds,
      this.player.localPosition,
    ));
    const snapshot = this.session.snapshot();
    this.synchronizeElapsed(snapshot);
    return snapshot;
  }

  private updateEnding(
    deltaSeconds: number,
    snapshot: ScavengeSnapshot,
  ): Readonly<ReturnType<typeof getSinkingState>> {
    this.recordDorothyEnding(snapshot);
    const failureStarted = !this.endingStarted && snapshot.status === 'failure';
    this.ending = advanceScavengeEnding(
      this.ending,
      snapshot.status,
      failureStarted ? 0 : deltaSeconds,
    );
    if (failureStarted) this.startSinking();
    this.endingBlackout = 0;
    if (!this.endingStarted) {
      return getSinkingState(this.elapsed, SCAVENGE_DURATION_SECONDS);
    }
    return this.updateCinematicFrame();
  }

  private recordDorothyEnding(snapshot: ScavengeSnapshot): void {
    if (snapshot.status !== 'failure' || this.dorothyEnding !== null) return;
    this.dorothyEnding = Object.freeze({
      id: 'dorothy', day: 0, savedPickupCount: snapshot.savedCount,
    });
  }

  private startSinking(): void {
    this.endingStarted = true;
    this.hands.hideAndReset();
    this.audio.sink();
    this.world.attachPhysicsObjectsToShip();
    if (this.input.pointerLocked) document.exitPointerLock?.();
    this.contextAction = { type: 'none', prompt: '' };
    this.itemTooltip = null;
  }

  private updateCinematicFrame(): Readonly<ReturnType<typeof getSinkingState>> {
    const elapsed = this.ending.stage === 'sinking'
      ? this.ending.elapsedSeconds
      : SINKING_CINEMATIC_SECONDS;
    sampleScavengeCinematicFrameInto(this.cinematicFrame, elapsed);
    this.endingBlackout = this.cinematicFrame.blackout;
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
    return this.cinematicFrame.sinking;
  }

  private shouldSimulatePhysics(
    snapshot: ScavengeSnapshot,
    directControlActive: boolean,
  ): boolean {
    return this.ending.stage === 'playing'
      && directControlActive
      && snapshot.status === 'running';
  }

  private updateWorldFrame(
    worldDeltaSeconds: number,
    sinking: Readonly<ReturnType<typeof getSinkingState>>,
    simulatePhysics: boolean,
    introFrameStarted: boolean,
  ): void {
    sampleShipDangerStateInto(
      this.dangerState,
      this.elapsed,
      SCAVENGE_DURATION_SECONDS,
      this.alarmPhase.elapsedAt(this.elapsed),
    );
    this.world.update(
      this.worldTime,
      worldDeltaSeconds,
      sinking,
      this.context.camera.position,
      simulatePhysics,
      this.dangerState,
    );
    if (simulatePhysics || introFrameStarted || this.pausedIntroExitCarry) {
      this.player.placeCamera();
    }
  }

  private updateHands(
    deltaSeconds: number,
    motion: PlayerMotionSample | null,
    snapshot: ScavengeSnapshot,
  ): void {
    this.hands.update(
      deltaSeconds,
      motion?.movedDistance ?? 0,
      motion?.grounded ?? false,
      this.input.sprinting,
      this.isHandsVisible(snapshot),
    );
  }

  private isHandsVisible(snapshot: ScavengeSnapshot): boolean {
    return this.isVisibleSession(snapshot) && !this.overlayActive;
  }

  private renderInterface(snapshot: ScavengeSnapshot): void {
    const stillActive = this.isVisibleSession(snapshot);
    const itemTooltip = stillActive ? this.itemTooltip : null;
    this.ui.render(snapshot);
    this.ui.setPrompt(itemTooltip === null && stillActive ? this.contextAction.prompt : '');
    this.ui.setItemTooltip?.(itemTooltip);
    this.ui.setPickupPointer?.(stillActive && this.contextAction.type === 'pickUp');
    this.ui.renderEnding(this.ending.stage, this.endingBlackout, this.dorothyEnding);
  }

  private isVisibleSession(snapshot: ScavengeSnapshot): boolean {
    return this.ending.stage === 'playing'
      && snapshot.status === 'running'
      && this.input.pointerLocked
      && !this.overlayActive
      && !document.hidden;
  }

  private reportCompletion(snapshot: ScavengeSnapshot): void {
    if (snapshot.status !== 'success' || this.completionReported) return;
    const result = this.session.result();
    if (result === null) return;
    this.completionReported = true;
    this.audio.complete();
    this.onComplete(result);
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
    if (active) this.prepareOpenOverlay();
    const snapshot = this.session.snapshot();
    this.audio.setPaused(this.overlayPausesAudio(active, snapshot));
    if (this.shouldRestoreOverlayControl(active, snapshot)) void this.requestPointerLock();
  }

  private prepareOpenOverlay(): void {
    this.hands.hideAndReset();
    this.itemHoverOutline.setTarget(null);
    if (this.input.pointerLocked) document.exitPointerLock?.();
  }

  private overlayPausesAudio(active: boolean, snapshot: ScavengeSnapshot): boolean {
    return active
      || snapshot.status !== 'running'
      || document.hidden
      || (this.presentation === 'intro' && this.introPaused);
  }

  private shouldRestoreOverlayControl(
    active: boolean,
    snapshot: ScavengeSnapshot,
  ): boolean {
    return !active
      && (snapshot.status === 'running' || this.presentation === 'intro')
      && !this.input.pointerLocked
      && !document.hidden;
  }

  setWeatherOverride(id: PresentationWeatherId | null): void {
    this.presentationWeather = id ?? 'calm';
    this.world.setPresentationWeather(this.presentationWeather);
  }

  setTimeOfDayOverride(phase: SkyPhase | null): void {
    this.presentationPhase = phase ?? 'day';
    this.world.setPresentationPhase(this.presentationPhase);
  }

  setWaterQuality(value: WaterQuality): void {
    if (this.disposed) return;
    this.world.setWaterQuality(value);
  }

  setVisualQuality(value: VisualQuality): void {
    if (this.disposed) return;
    this.world.setVisualQuality(value);
  }

  setVolumetricCloudsEnabled(enabled: boolean): void {
    if (this.disposed) return;
    this.world.setVolumetricCloudsEnabled(enabled);
  }

  getVolumetricCloudsAvailable(): boolean {
    return !this.disposed && this.world.getVolumetricCloudsAvailable();
  }

  getPresentationWeather(): PresentationWeatherId {
    return this.presentationWeather;
  }

  getPresentationPhase(): SkyPhase {
    return this.presentationPhase;
  }

  render(): void {
    if (this.disposed) return;
    this.context.sceneRenderer.render(this.scene, this.context.camera, this.visualState);
  }

  private updateAudioListenerPose(): AudioListenerPose | null {
    if (
      this.audioLocalQuaternion === undefined
      || this.audioForward === undefined
      || this.audioUp === undefined
      || this.audioListenerPose === undefined
      || this.world?.ship === undefined
      || this.context?.camera === undefined
    ) {
      return null;
    }
    this.audioLocalQuaternion
      .copy(this.world.ship.quaternion)
      .invert()
      .multiply(this.context.camera.quaternion);
    this.audioForward.set(0, 0, -1).applyQuaternion(this.audioLocalQuaternion);
    this.audioUp.set(0, 1, 0).applyQuaternion(this.audioLocalQuaternion);
    return this.audioListenerPose;
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
    this.unsubscribeLanguage();
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    document.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('keyup', this.onKeyUp);
    if (this.input.pointerLocked) document.exitPointerLock?.();
    this.carry.reset();
    this.audio.dispose();
    this.input.dispose();
    this.hands.dispose();
    this.itemHoverOutline.dispose();
    this.world.dispose();
    this.ui.dispose();
  }

  private updateInteraction(): void {
    this.itemTooltip = null;
    const snapshot = this.session.snapshot();
    const availableItems: Group[] = [];
    const instances = new Map<ItemInstanceId, ItemInstance>();
    this.collectAvailableInteractionItems(snapshot, availableItems, instances);
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
    this.itemHoverOutline.setTarget(
      target.targetItem === null
        ? null
        : this.world.itemObjects.get(target.targetItem.instanceId) ?? null,
    );
    this.contextAction = this.carry.flightActive
      ? { type: 'none', prompt: '' }
      : chooseContextAction({
        ...target,
        carriedItem: this.carry.activeInstance,
        remainingCapacity: 3 - snapshot.carriedWeight,
        nearEvacuation,
      });
    this.updateItemTooltip(target);
    if (this.input.consumeInteract()) this.performAction(this.contextAction);
  }

  private collectAvailableInteractionItems(
    snapshot: ScavengeSnapshot,
    availableItems: Group[],
    instances: Map<ItemInstanceId, ItemInstance>,
  ): void {
    for (const [instanceId, object] of this.world.itemObjects) {
      const instance = this.instancesById.get(instanceId);
      if (instance === undefined) continue;
      if (object.userData.instanceId !== instanceId) continue;
      if (object.userData.itemType !== instance.type) continue;
      const state = snapshot.items[instanceId];
      if (state?.status !== 'available') continue;
      availableItems.push(object);
      instances.set(instance.instanceId, instance);
    }
  }

  private updateItemTooltip(target: InteractionTarget): void {
    if (target.target !== 'item' || target.targetItem === null) return;
    const object = this.world.itemObjects.get(target.targetItem.instanceId);
    if (object === undefined) return;
    this.itemTooltipBounds.setFromObject(object, true);
    const projected = projectScreenBounds(
      this.itemTooltipBounds,
      this.context.camera,
      this.viewportWidth,
      this.viewportHeight,
    );
    if (!projected.visible) return;
    const placement = projected.y - projected.height / 2 >= 96 ? 'above' : 'below';
    this.itemTooltip = {
      get text() { return ITEM_LABELS[target.targetItem!.type]; },
      x: projected.x,
      y: placement === 'above'
        ? projected.y - projected.height / 2
        : projected.y + projected.height / 2,
      placement,
    };
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
      this.ui.showHandsFullNotice();
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
    if (this.introBegun) return;
    this.introBegun = true;
    this.input.consumeJump();
    this.presentation = 'intro';
    this.ui.setPresentation('intro');
    this.ui.clearPointerLockError();
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
    this.ui.setIntroFadeProgress(1 - sampleMenuFade(this.introElapsed));
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
    this.ui.setIntroFadeProgress(0);
    this.ui.setPresentation('playing');
    this.session.start();
    resetShipAlarmPhase(this.alarmPhase, this.elapsed);
    this.audio.beginRun();
    if (resumeRequired) {
      this.pausedIntroExitCarry = true;
      this.session.pause();
    }
  }

  private handlePointerLockChange(locked: boolean): void {
    if (this.overlayActive && !locked) return;
    if (this.presentation === 'intro') {
      if (locked && !this.introBegun) this.beginIntro();
      this.introPaused = !locked;
      this.escapeResumeArmed = !locked && !this.escapeKeyHeld;
      this.ui.setPaused(!locked);
      this.audio.setPaused(!locked);
      return;
    }
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
      this.escapeResumeArmed = !this.escapeKeyHeld;
      this.session.pause();
      this.ui.setPaused(true);
      this.hands.hideAndReset();
      this.audio.setPaused(true);
    }
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
    if (event.key === 'Escape' && !event.repeat) this.escapeKeyHeld = true;
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
    this.escapeResumeArmed = false;
    void this.requestPointerLock();
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => this.handleKeyDown(event);

  private handleKeyUp(event: KeyboardEvent): void {
    if (event.key === 'Escape') this.escapeKeyHeld = false;
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
    if (this.presentation === 'intro') {
      this.introPaused = true;
      this.ui.setPaused(true);
      this.audio.setPaused(true);
      return;
    }
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
