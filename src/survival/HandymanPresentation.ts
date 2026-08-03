import {
  Box3,
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Skeleton,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import type { ItemId, ItemInstanceId } from '../game/ItemState';
import {
  sampleWaveFieldInto,
  type WaveSample,
} from '../ocean/WaveField';
import {
  collectOwnedSkeletons,
  disposeRejectedModel as disposeModel,
  disposeSkeletons,
  hasRenderableBounds,
} from '../rendering/modelPresentation';
import {
  applyHandJointCurl,
  findImportedHandRig,
  type HandJoint,
} from '../rendering/RiggedHandRig';
import {
  collectMeshResources,
  disposeResourceSets,
} from '../world/SceneResources';
import type { MutableSupplyPose } from './BoatSupplyDisplay';
import {
  clamp01Unchecked as clamp01,
  smoothstepUnchecked as smoothstep,
  type TimedAnimation,
} from './animationMath';
import type {
  EventChoicePresentation,
  FocusedEventInteractionTarget,
  FocusedEventPresentation,
  FocusedEventPresentationDependencies,
} from './FocusedEventPresentation';
import type {
  ActionOutcome,
  EventResultPresentation,
} from './survivalTypes';
import { StationaryEventCamera } from './StationaryEventCamera';

type HandymanAnimationKind =
  | 'reveal'
  | 'choice-payment'
  | 'choice-touch'
  | 'choice-sleep'
  | 'result-reward'
  | 'result-touch'
  | 'result-sleep';

type ActiveAnimation = TimedAnimation<HandymanAnimationKind>;

const REVEAL_DURATION = 1.45;
const PAYMENT_DURATION = 1.08;
const TOUCH_CHOICE_DURATION = 0.82;
const SLEEP_CHOICE_DURATION = 0.38;
const RESULT_DURATION = 1.12;
const TOUCH_RESULT_DURATION = 1.05;
const SLEEP_RESULT_DURATION = 1.22;
const WRIST_BASE = new Vector3(-2.35, 0.45, -2.15);
const WRIST_HIDDEN = new Vector3(-2.35, -2.05, -2.15);
const WRIST_SUNK = new Vector3(-2.55, -2.4, -2.55);
const PALM_TARGET = new Vector3(0.05, 0.32, 0.05);
const PAYMENT_START = new Vector3(3.05, 0.38, 3.9);
const REWARD_END = new Vector3(2.85, 0.55, 3.6);
const CHEST_PALM_TARGET = new Vector3(-2.22, 0.9, -2.08);
const TOUCH_HELD_CAMERA_YAW = -0.22;
const TOUCH_HELD_CAMERA_PITCH = -0.2;
const TOUCH_HELD_CAMERA_X = -0.16;
const TOUCH_HELD_CAMERA_Z = -2.05;
const X_AXIS = new Vector3(1, 0, 0);
const Z_AXIS = new Vector3(0, 0, 1);
const PALM_SCALE = 1.34;
const PALM_FACING_DIRECTION = new Vector3(0, 0.88, 1.72)
  .sub(WRIST_BASE)
  .normalize();
const PALM_BASE_QUATERNION = new Quaternion().setFromUnitVectors(
  Z_AXIS,
  PALM_FACING_DIRECTION,
);

const HANDYMAN_REWARDS: Readonly<Partial<Record<string, ItemId | 'chest'>>> =
  Object.freeze({
    spyglass: 'flashlight',
    flashlight: 'spyglass',
    flareGun: 'harpoonGun',
    harpoonGun: 'flareGun',
    scubaSet: 'medicalKit',
    medicalKit: 'scubaSet',
    fishingNet: 'bucket',
    bucket: 'fishingNet',
    ductTape: 'energyBar',
    energyBar: 'ductTape',
    anchor: 'chest',
    chest: 'anchor',
  });

function keyedTravel(progress: number): number {
  if (progress < 0.14) return -0.035 * smoothstep(progress / 0.14);
  if (progress < 0.82) {
    return -0.035 + 1.08 * smoothstep((progress - 0.14) / 0.68);
  }
  return 1.045 + (1 - 1.045) * smoothstep((progress - 0.82) / 0.18);
}

function createMaterial(
  color: number,
  roughness: number,
  metalness = 0,
): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color,
    roughness,
    metalness,
    flatShading: true,
  });
}

function disposeRejectedModel(root: Group): void {
  disposeModel(root, true);
}

export class HandymanPresentation implements FocusedEventPresentation {
  readonly root = new Group();
  private readonly wrist = new Group();
  private readonly handPose = new Group();
  private readonly handVisual = new Group();
  private readonly fingertips = new Group();
  private readonly drain = new Group();
  private readonly paymentActors = new Group();
  private readonly rewardActors = new Group();
  private readonly staticGeometries = new Set<BufferGeometry>();
  private readonly staticMaterials = new Set<Material>();
  private readonly staticSkeletons = new Set<Skeleton>();
  private readonly exchangeGeometries = new Set<BufferGeometry>();
  private readonly exchangeMaterials = new Set<Material>();
  private readonly fingerJoints: HandJoint[] = [];
  private readonly wristMotionBase = WRIST_BASE.clone();
  private readonly waveQuaternion = new Quaternion();
  private readonly boatQuaternion = new Quaternion();
  private readonly waveSample: WaveSample = {
    height: 0,
    displacementX: 0,
    displacementZ: 0,
    normal: { x: 0, y: 1, z: 0 },
  };
  private readonly supplyPose: MutableSupplyPose = {
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    pitch: 0,
    roll: 0,
    scaleX: 1,
    scaleY: 1,
    scaleZ: 1,
  };
  private readonly cameraLook: StationaryEventCamera;
  private readonly chestStartPosition = new Vector3();
  private readonly chestStartQuaternion = new Quaternion();
  private readonly chestStartScale = new Vector3(1, 1, 1);
  private activeAnimation: ActiveAnimation | null = null;
  private paymentActor: Group | null = null;
  private rewardActor: Group | null = null;
  private paymentInstanceId: ItemInstanceId | null = null;
  private activeChoiceId: string | null = null;
  private usingSupplyPayment = false;
  private usingChestPayment = false;
  private touchCameraHeld = false;
  private chestCaptured = false;
  private paymentVisible = false;
  private rewardVisible = false;
  private fingerBend = 0;
  private staged = false;
  private disposed = false;

  constructor(
    private readonly dependencies: FocusedEventPresentationDependencies,
  ) {
    this.cameraLook = new StationaryEventCamera(dependencies.camera);
    this.root.name = 'focused-event:handyman';
    this.root.visible = false;
    this.root.userData.motionSource = 'shared-wave-field';
    this.root.userData.hullTaps = 0;
    this.root.userData.exchangeOverlap = false;

    this.wrist.name = 'handyman-wrist';
    this.wrist.userData.motionSource = 'shared-wave-field';
    this.handPose.name = 'handyman-hand';
    this.handVisual.name = 'handyman-palm';
    this.handVisual.userData.facesPlayer = true;
    this.handVisual.userData.outsideHull = true;
    this.handVisual.userData.idleMotion = 'restrained';
    this.fingertips.name = 'handyman-fingertips';
    this.drain.name = 'handyman-joint-drain';
    this.paymentActors.name = 'handyman-payment-actors';
    this.rewardActors.name = 'handyman-reward-actors';

    this.buildHand();
    this.buildFingertips();
    this.buildDrain();
    this.handPose.add(
      this.handVisual,
      this.fingertips,
      this.drain,
      this.paymentActors,
      this.rewardActors,
    );
    this.wrist.add(this.handPose);
    this.root.add(this.wrist);
    collectMeshResources(
      this.root,
      this.staticGeometries,
      this.staticMaterials,
    );
    this.resetStaticActors();
  }

  stage(): void {
    if (this.disposed) return;
    this.cancelActiveAnimation(false);
    this.restoreCamera();
    this.captureCamera();
    this.dependencies.supplyDisplay.releaseEventActor();
    this.dependencies.supplyDisplay.clearEventPose();
    this.restoreChestPose();
    this.dependencies.chestDisplay.restorePose();
    this.captureChestPose();
    this.clearExchangeActors();
    this.staged = true;
    this.root.visible = true;
    this.wrist.visible = true;
    this.wristMotionBase.copy(WRIST_HIDDEN);
    this.resetStaticActors();
    this.root.userData.state = 'staged';
    this.root.userData.revealOrder = [];
    this.root.userData.hullTaps = 0;
    this.root.userData.paymentEnteredPalm = false;
    this.root.userData.paymentInPalm = false;
    this.root.userData.exchangeOverlap = false;
  }

  reveal(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (!this.staged) this.stage();
    this.root.userData.state = 'revealing';
    return this.startAnimation('reveal', REVEAL_DURATION);
  }

  playChoice(choice: EventChoicePresentation): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.activeChoiceId = choice.choiceId;
    if (choice.choiceId === 'touch') {
      this.root.userData.state = 'reaching-for-hand';
      return this.startAnimation('choice-touch', TOUCH_CHOICE_DURATION);
    }
    if (choice.choiceId === 'sleep') {
      this.root.userData.state = 'waiting';
      return this.startAnimation('choice-sleep', SLEEP_CHOICE_DURATION);
    }
    if (HANDYMAN_REWARDS[choice.choiceId] === undefined) {
      throw new Error(`Unsupported Handyman choice: ${choice.choiceId}`);
    }
    this.preparePayment(choice);
    this.root.userData.state = 'taking-payment';
    return this.startAnimation('choice-payment', PAYMENT_DURATION);
  }

  react(
    result: EventResultPresentation,
    outcome: ActionOutcome,
  ): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (result.eventId !== 'handyman') {
      throw new Error(`Handyman received result for ${result.eventId}.`);
    }
    void outcome;
    this.activeChoiceId = result.choiceId;
    switch (result.resultId) {
      case 'handyman-reward': {
        const reward = HANDYMAN_REWARDS[result.choiceId];
        if (reward === undefined) {
          throw new Error(`Handyman has no reward for ${result.choiceId}.`);
        }
        this.hidePayment();
        this.prepareReward(reward, false);
        this.setFingerBend(1);
        this.root.userData.state = 'opening-reward';
        return this.startAnimation('result-reward', RESULT_DURATION);
      }
      case 'handyman-food-fallback':
        this.hidePayment();
        this.prepareReward('cannedFood', true);
        this.setFingerBend(1);
        this.root.userData.state = 'opening-food';
        return this.startAnimation('result-reward', RESULT_DURATION);
      case 'handyman-touch':
        this.hidePayment();
        this.root.userData.state = 'closing-around-camera';
        return this.startAnimation('result-touch', TOUCH_RESULT_DURATION);
      case 'handyman-sleep':
        this.hidePayment();
        this.root.userData.state = 'shrugging';
        return this.startAnimation('result-sleep', SLEEP_RESULT_DURATION);
      default:
        throw new Error(`Unsupported Handyman result: ${result.resultId}`);
    }
  }

  clear(): void {
    if (this.disposed) return;
    this.cancelActiveAnimation(false);
    this.dependencies.supplyDisplay.releaseEventActor();
    this.dependencies.supplyDisplay.clearEventPose();
    this.restoreChestPose();
    this.clearExchangeActors();
    this.restoreCamera();
    this.resetStaticActors();
    this.root.visible = false;
    this.root.userData.state = 'idle';
    this.staged = false;
  }

  update(time: number, delta: number): void {
    if (this.disposed || delta < 0) return;
    const animation = this.activeAnimation;
    if (animation !== null) {
      animation.elapsed = Math.min(
        animation.duration,
        animation.elapsed + Math.max(0, delta),
      );
      const progress = animation.duration <= 0
        ? 1
        : animation.elapsed / animation.duration;
      this.applyAnimation(animation.kind, progress);
      if (progress >= 1) {
        this.activeAnimation = null;
        this.finishAnimation(animation.kind);
        animation.resolve();
      }
    }
    if (this.touchCameraHeld) this.applyHeldTouchCameraPose();
    this.applySharedWave(time);
    this.applyRestrainedIdle(time);
  }

  settleForVisibilityChange(): void {
    if (this.disposed) return;
    this.cancelActiveAnimation(true);
  }

  interactionTargets(): readonly FocusedEventInteractionTarget[] {
    return [
      {
        id: 'handyman:hand',
        label: 'HAND',
        description: 'Reach toward the waiting hand.',
        choiceId: 'touch',
        root: this.handVisual,
        minimumHitWidth: 82,
        minimumHitHeight: 82,
      },
      {
        id: 'persistent-chest',
        label: 'CHEST',
        description: 'Offer the closed chest to the hand.',
        choiceId: 'chest',
        root: this.dependencies.chestDisplay.root,
        minimumHitWidth: 54,
        minimumHitHeight: 54,
      },
    ];
  }

  dispose(): void {
    if (this.disposed) return;
    this.cancelActiveAnimation(false);
    this.dependencies.supplyDisplay.releaseEventActor();
    this.dependencies.supplyDisplay.clearEventPose();
    this.restoreChestPose();
    this.restoreCamera();
    this.clearExchangeActors();
    this.disposed = true;
    this.staged = false;
    this.root.removeFromParent();
    disposeSkeletons(this.staticSkeletons);
    disposeResourceSets(this.staticGeometries, this.staticMaterials);
    this.root.clear();
  }

  private startAnimation(
    kind: HandymanAnimationKind,
    duration: number,
  ): Promise<void> {
    this.cancelActiveAnimation(true);
    return new Promise<void>((resolve) => {
      this.activeAnimation = { kind, elapsed: 0, duration, resolve };
      this.applyAnimation(kind, 0);
    });
  }

  private applyAnimation(
    kind: HandymanAnimationKind,
    progress: number,
  ): void {
    const normalized = clamp01(progress);
    switch (kind) {
      case 'reveal':
        this.applyReveal(normalized);
        break;
      case 'choice-payment':
        this.applyPaymentChoice(normalized);
        break;
      case 'choice-touch':
        this.applyTouchChoice(normalized);
        break;
      case 'choice-sleep':
        this.applySleepChoice(normalized);
        break;
      case 'result-reward':
        this.applyRewardResult(normalized);
        break;
      case 'result-touch':
        this.applyTouchResult(normalized);
        break;
      case 'result-sleep':
        this.applySleepResult(normalized);
        break;
    }
  }

  private finishAnimation(kind: HandymanAnimationKind): void {
    this.applyAnimation(kind, 1);
    switch (kind) {
      case 'reveal':
        this.root.userData.state = 'revealed';
        break;
      case 'choice-payment':
        this.root.userData.state = 'payment-held';
        break;
      case 'choice-touch':
        this.root.userData.state = 'camera-at-palm';
        break;
      case 'choice-sleep':
        this.root.userData.state = 'choice-sleep';
        break;
      case 'result-reward':
        this.root.userData.state = this.rewardActor?.userData.itemType === 'cannedFood'
          ? 'held-food'
          : 'held-reward';
        break;
      case 'result-touch':
        this.root.userData.state = 'held-touch';
        this.touchCameraHeld = true;
        this.applyHeldTouchCameraPose();
        break;
      case 'result-sleep':
        this.root.userData.state = 'held-sleep';
        break;
    }
  }

  private applyReveal(progress: number): void {
    if (progress > 0) {
      this.fingertips.visible = true;
      if ((this.root.userData.revealOrder as string[]).length === 0) {
        (this.root.userData.revealOrder as string[]).push('fingertips');
      }
    }
    if (progress < 0.28) {
      this.handVisual.visible = false;
      this.wristMotionBase.lerpVectors(
        WRIST_HIDDEN,
        WRIST_BASE,
        smoothstep(progress / 0.42) * 0.42,
      );
      return;
    }
    if (!this.handVisual.visible) {
      this.handVisual.visible = true;
      this.fingertips.visible = false;
      (this.root.userData.revealOrder as string[]).push('palm');
    }
    const rise = keyedTravel((progress - 0.28) / 0.54);
    this.wristMotionBase.lerpVectors(
      WRIST_HIDDEN,
      WRIST_BASE,
      rise,
    );
    this.drain.visible = progress > 0.36 && progress < 0.86;
    for (let index = 0; index < this.drain.children.length; index += 1) {
      const drop = this.drain.children[index]!;
      const local = clamp01((progress - 0.36 - index * 0.06) / 0.4);
      drop.position.y = 0.18 - local * (0.7 + index * 0.12);
      drop.scale.setScalar(Math.max(0.08, 1 - local));
    }
    const tapWindow = clamp01((progress - 0.82) / 0.18);
    const tap = Math.sin(tapWindow * Math.PI);
    this.handPose.rotation.z = -tap * 0.055;
    this.handPose.position.y = -tap * 0.04;
    if (progress >= 0.86) this.root.userData.hullTaps = 1;
  }

  private applyPaymentChoice(progress: number): void {
    const travel = smoothstep(progress / 0.58);
    if (this.usingChestPayment) {
      this.dependencies.chestDisplay.root.position.lerpVectors(
        this.chestStartPosition,
        CHEST_PALM_TARGET,
        travel,
      );
      this.dependencies.chestDisplay.root.quaternion
        .copy(this.chestStartQuaternion);
      this.dependencies.chestDisplay.root.rotateY(-0.42 * travel);
      this.dependencies.chestDisplay.root.scale.copy(this.chestStartScale);
      this.dependencies.chestDisplay.root.scale.multiplyScalar(
        Math.max(
          0.001,
          1 - smoothstep((progress - 0.78) / 0.12),
        ),
      );
    } else if (
      this.usingSupplyPayment
      && this.paymentInstanceId !== null
    ) {
      this.supplyPose.x = -2.95 * travel;
      this.supplyPose.y = 0.48 * travel;
      this.supplyPose.z = -2.2 * travel;
      this.supplyPose.yaw = 0.28 * travel;
      this.supplyPose.pitch = -0.18 * travel;
      this.supplyPose.roll = 0.14 * travel;
      const scale = Math.max(
        0.001,
        1 - smoothstep((progress - 0.78) / 0.12),
      );
      this.supplyPose.scaleX = scale;
      this.supplyPose.scaleY = scale;
      this.supplyPose.scaleZ = scale;
      this.dependencies.supplyDisplay.applyEventItemPose(
        this.paymentInstanceId,
        this.supplyPose,
      );
    } else if (this.paymentActor !== null) {
      this.paymentActor.position.lerpVectors(
        PAYMENT_START,
        PALM_TARGET,
        travel,
      );
      this.paymentActor.position.y += Math.sin(travel * Math.PI) * 0.32;
      this.paymentActor.rotation.y = travel * 0.62;
      const scale = Math.max(
        0.001,
        1 - smoothstep((progress - 0.78) / 0.12),
      );
      this.paymentActor.scale.setScalar(scale);
    }
    const close = smoothstep((progress - 0.42) / 0.34);
    this.setFingerBend(close);
    if (progress >= 0.9) {
      this.hidePayment();
      this.root.userData.paymentEnteredPalm = true;
      this.root.userData.paymentInPalm = true;
    }
  }

  private applyTouchChoice(progress: number): void {
    const travel = keyedTravel(progress);
    this.setFingerBend(0);
    this.applyCameraPose(
      -0.14 * travel,
      -0.08 * travel,
      -0.16 * travel,
      -1.5 * travel,
    );
  }

  private applySleepChoice(progress: number): void {
    const anticipation = Math.sin(progress * Math.PI);
    this.handPose.rotation.x = -anticipation * 0.05;
    this.handPose.position.y = anticipation * 0.025;
  }

  private applyRewardResult(progress: number): void {
    this.hidePayment();
    const actor = this.rewardActor;
    if (actor === null) return;
    const reopen = smoothstep((progress - 0.32) / 0.38);
    this.setFingerBend(1 - reopen);
    if (progress < 0.7) {
      actor.visible = false;
      this.rewardVisible = false;
      this.updateExchangeState();
      return;
    }
    actor.visible = true;
    this.rewardVisible = true;
    const travel = keyedTravel((progress - 0.7) / 0.3);
    actor.position.lerpVectors(PALM_TARGET, REWARD_END, travel);
    actor.position.y += Math.sin(clamp01(travel) * Math.PI) * 0.28;
    actor.rotation.y = -travel * 0.68;
    actor.rotation.z = Math.sin(progress * Math.PI) * 0.08;
    this.updateExchangeState();
  }

  private applyTouchResult(progress: number): void {
    const close = smoothstep((progress - 0.18) / 0.58);
    this.setFingerBend(close);
    const kickWindow = clamp01((progress - 0.65) / 0.35);
    const kick = Math.sin(kickWindow * Math.PI);
    this.applyCameraPose(
      -0.14 - close * 0.08,
      -0.08 - close * 0.12,
      -0.16 + kick * 0.12,
      -1.5 - close * 0.55,
    );
    this.handPose.position.x = -kick * 0.18;
    this.handPose.rotation.z = kick * 0.1;
    this.dependencies.supplyDisplay.applyEventAmbientPose(
      kick * 0.08,
      kick * 0.055,
    );
    if (progress >= 0.72) {
      this.root.userData.cameraEnclosed = true;
      this.root.userData.cameraGrabbed = true;
      this.root.userData.hullKicks = 1;
    }
  }

  private applySleepResult(progress: number): void {
    const shrugWindow = clamp01(progress / 0.48);
    const shrug = Math.sin(shrugWindow * Math.PI);
    this.handPose.position.y = shrug * 0.18;
    this.handPose.rotation.z = -shrug * 0.16;
    this.setFingerBend(shrug * 0.22);
    const sink = smoothstep((progress - 0.42) / 0.58);
    this.wristMotionBase.lerpVectors(WRIST_BASE, WRIST_SUNK, sink);
    if (progress >= 0.08) this.root.userData.shrugs = 1;
    if (progress >= 1) {
      this.wrist.visible = false;
      this.root.userData.sank = true;
    }
  }

  private applySharedWave(time: number): void {
    this.wrist.position.copy(this.wristMotionBase);
    if (this.dependencies.boatMotionRoot !== undefined) {
      this.dependencies.boatMotionRoot.localToWorld(this.wrist.position);
      this.dependencies.boatMotionRoot.getWorldQuaternion(this.boatQuaternion);
    } else {
      this.boatQuaternion.identity();
    }
    sampleWaveFieldInto(
      this.waveSample,
      this.dependencies.waves,
      time,
      this.wrist.position.x,
      this.wrist.position.z,
      1,
    );
    this.wrist.position.x += this.waveSample.displacementX * 0.12;
    this.wrist.position.y += this.waveSample.height * 0.1;
    this.wrist.position.z += this.waveSample.displacementZ * 0.12;
    this.waveQuaternion.setFromAxisAngle(
      X_AXIS,
      this.waveSample.normal.z * 0.1,
    );
    this.wrist.quaternion.copy(this.boatQuaternion).multiply(this.waveQuaternion);
    this.waveQuaternion.setFromAxisAngle(
      Z_AXIS,
      -this.waveSample.normal.x * 0.1,
    );
    this.wrist.quaternion.multiply(this.waveQuaternion);
    this.wrist.userData.waveHeight = this.waveSample.height;
    this.wrist.userData.waveSampleTime = time;
  }

  private applyRestrainedIdle(time: number): void {
    const wristDrift = Math.sin(time * 0.43) * 0.024
      + Math.sin(time * 0.19 + 0.7) * 0.009;
    this.handVisual.quaternion.copy(PALM_BASE_QUATERNION);
    this.handVisual.rotateX(wristDrift);
    this.handVisual.userData.wristDrift = wristDrift;

    const state = this.root.userData.state;
    if (state !== 'staged' && state !== 'revealed') return;
    const fingerTension = 0.055 + Math.sin(time * 0.71 + 0.35) * 0.025;
    this.setFingerBend(fingerTension);
    this.handVisual.userData.fingerTension = fingerTension;
  }

  private setFingerBend(amount: number): void {
    this.fingerBend = clamp01(amount);
    applyHandJointCurl(this.fingerJoints, this.fingerBend);
    this.handVisual.userData.fingerBend = this.fingerBend;
    this.handVisual.userData.fingerCurl = this.fingerBend;
    this.root.userData.fingerCurl = this.fingerBend;
  }

  private preparePayment(choice: EventChoicePresentation): void {
    this.dependencies.supplyDisplay.releaseEventActor();
    this.dependencies.supplyDisplay.clearEventPose();
    this.clearExchangeActors();
    this.paymentInstanceId = choice.instanceId;
    this.usingChestPayment = choice.choiceId === 'chest';
    this.usingSupplyPayment = !this.usingChestPayment
      && choice.instanceId !== null
      && this.dependencies.supplyDisplay.pinEventActor(choice.instanceId);
    if (this.usingChestPayment) {
      this.dependencies.chestDisplay.restorePose();
      this.captureChestPose();
      this.dependencies.chestDisplay.root.visible = true;
      this.root.userData.chestPaymentUsesPersistentChest = true;
    } else if (!this.usingSupplyPayment) {
      this.paymentActor = this.createItemActor(
        choice.choiceId as ItemId,
        'payment',
      );
      this.paymentActor.position.copy(PAYMENT_START);
    }
    this.paymentVisible = true;
    this.rewardVisible = false;
    this.setFingerBend(0);
    this.root.userData.paymentEnteredPalm = false;
    this.root.userData.paymentInPalm = false;
    this.updateExchangeState();
  }

  private prepareReward(
    reward: ItemId | 'chest',
    authoredFood: boolean,
  ): void {
    this.rewardActors.clear();
    if (authoredFood) {
      this.rewardActor = this.createFoodToken();
    } else if (reward === 'chest') {
      this.rewardActor = this.createChestReward();
    } else {
      this.rewardActor = this.createItemActor(reward, 'reward');
    }
    this.rewardActor.position.copy(PALM_TARGET);
    this.rewardActor.visible = false;
    this.rewardVisible = false;
    this.updateExchangeState();
  }

  private createItemActor(
    itemId: ItemId,
    role: 'payment' | 'reward',
  ): Group {
    const actor = new Group();
    actor.name = `handyman-${role}-${itemId}`;
    let selected: Group | null = null;
    try {
      selected = this.dependencies.propModels.create({
        instanceId: `handyman-${role}-${itemId}` as ItemInstanceId,
        type: itemId,
      });
    } catch {
      selected = null;
    }
    if (selected !== null && hasRenderableBounds(selected)) {
      selected.name = `handyman-${role}-${itemId}-model`;
      actor.add(selected);
      actor.userData.model = 'supply-clone';
    } else {
      if (selected !== null) disposeRejectedModel(selected);
      const fallback = new Mesh(
        new BoxGeometry(0.32, 0.17, 0.23),
        createMaterial(0x66513e, 0.95),
      );
      fallback.name = `handyman-${role}-${itemId}-fallback`;
      fallback.rotation.set(0.1, -0.18, 0.05);
      actor.add(fallback);
      actor.userData.model = 'procedural';
    }
    actor.userData.itemType = itemId;
    actor.scale.setScalar(0.82);
    const parent = role === 'payment'
      ? this.paymentActors
      : this.rewardActors;
    parent.add(actor);
    collectMeshResources(
      actor,
      this.exchangeGeometries,
      this.exchangeMaterials,
    );
    return actor;
  }

  private createFoodToken(): Group {
    const actor = new Group();
    actor.name = 'handyman-reward-food-token';
    actor.userData.itemType = 'cannedFood';
    actor.userData.tokenKind = 'food';
    const tin = createMaterial(0x69716e, 0.72, 0.28);
    const label = createMaterial(0x8a6845, 0.94);
    const body = new Mesh(
      new CylinderGeometry(0.17, 0.17, 0.06, 9),
      label,
    );
    body.name = 'handyman-food-token-body';
    body.rotation.x = Math.PI / 2;
    const rim = new Mesh(
      new TorusGeometry(0.168, 0.018, 5, 10),
      tin,
    );
    rim.name = 'handyman-food-token-rim';
    rim.rotation.x = Math.PI / 2;
    const seam = new Mesh(
      new BoxGeometry(0.21, 0.026, 0.026),
      tin,
    );
    seam.name = 'handyman-food-token-seam';
    seam.position.z = 0.04;
    seam.rotation.z = -0.17;
    actor.add(body, rim, seam);
    this.rewardActors.add(actor);
    collectMeshResources(
      actor,
      this.exchangeGeometries,
      this.exchangeMaterials,
    );
    return actor;
  }

  private createChestReward(): Group {
    const actor = new Group();
    actor.name = 'handyman-reward-chest';
    actor.userData.itemType = 'chest';
    let selected: Group | null = null;
    try {
      selected = this.dependencies.propModels.createEventModel(
        'chestClosed',
      )?.root ?? null;
    } catch {
      selected = null;
    }
    if (selected !== null && hasRenderableBounds(selected)) {
      selected.name = 'handyman-reward-chest-model';
      actor.add(selected);
      actor.userData.model = 'event-clone';
    } else {
      if (selected !== null) disposeRejectedModel(selected);
      const wood = createMaterial(0x5a402e, 0.96);
      const iron = createMaterial(0x505a58, 0.72, 0.3);
      const body = new Mesh(
        new BoxGeometry(0.78, 0.4, 0.55),
        wood,
      );
      body.name = 'handyman-reward-chest-fallback-body';
      const lid = new Mesh(
        new BoxGeometry(0.82, 0.19, 0.58),
        wood,
      );
      lid.name = 'handyman-reward-chest-fallback-lid';
      lid.position.y = 0.3;
      const band = new Mesh(
        new BoxGeometry(0.12, 0.68, 0.61),
        iron,
      );
      band.name = 'handyman-reward-chest-fallback-band';
      band.position.y = 0.08;
      actor.add(body, lid, band);
      actor.userData.model = 'procedural';
    }
    actor.scale.setScalar(0.78);
    this.rewardActors.add(actor);
    collectMeshResources(
      actor,
      this.exchangeGeometries,
      this.exchangeMaterials,
    );
    return actor;
  }

  private hidePayment(): void {
    this.paymentVisible = false;
    if (this.usingChestPayment) {
      this.dependencies.chestDisplay.root.visible = false;
      this.dependencies.chestDisplay.root.scale.setScalar(0.001);
    } else if (
      this.usingSupplyPayment
      && this.paymentInstanceId !== null
    ) {
      this.supplyPose.scaleX = 0.001;
      this.supplyPose.scaleY = 0.001;
      this.supplyPose.scaleZ = 0.001;
      this.dependencies.supplyDisplay.applyEventItemPose(
        this.paymentInstanceId,
        this.supplyPose,
      );
      this.dependencies.supplyDisplay.releaseEventActorOnNextSync();
    } else if (this.paymentActor !== null) {
      this.paymentActor.visible = false;
      this.paymentActor.scale.setScalar(0.001);
    }
    this.updateExchangeState();
  }

  private updateExchangeState(): void {
    const overlap = this.paymentVisible && this.rewardVisible;
    this.root.userData.paymentVisible = this.paymentVisible;
    this.root.userData.rewardVisible = this.rewardVisible;
    this.root.userData.exchangeOverlap = overlap;
  }

  private clearExchangeActors(): void {
    this.paymentActors.clear();
    this.rewardActors.clear();
    disposeResourceSets(
      this.exchangeGeometries,
      this.exchangeMaterials,
    );
    this.paymentActor = null;
    this.rewardActor = null;
    this.paymentInstanceId = null;
    this.activeChoiceId = null;
    this.usingSupplyPayment = false;
    this.usingChestPayment = false;
    this.paymentVisible = false;
    this.rewardVisible = false;
    this.updateExchangeState();
  }

  private captureCamera(): void {
    this.cameraLook.capture();
  }

  private restoreCamera(): void {
    this.cameraLook.restore();
  }

  private applyCameraPose(
    yaw: number,
    pitch: number,
    _x: number,
    _z: number,
  ): void {
    this.cameraLook.apply(yaw, pitch);
  }

  private applyHeldTouchCameraPose(): void {
    this.applyCameraPose(
      TOUCH_HELD_CAMERA_YAW,
      TOUCH_HELD_CAMERA_PITCH,
      TOUCH_HELD_CAMERA_X,
      TOUCH_HELD_CAMERA_Z,
    );
  }

  private captureChestPose(): void {
    this.chestStartPosition.copy(this.dependencies.chestDisplay.root.position);
    this.chestStartQuaternion.copy(
      this.dependencies.chestDisplay.root.quaternion,
    );
    this.chestStartScale.copy(this.dependencies.chestDisplay.root.scale);
    this.chestCaptured = true;
  }

  private restoreChestPose(): void {
    if (!this.chestCaptured) return;
    this.dependencies.chestDisplay.restorePose();
    this.dependencies.chestDisplay.root.position.copy(this.chestStartPosition);
    this.dependencies.chestDisplay.root.quaternion.copy(
      this.chestStartQuaternion,
    );
    this.dependencies.chestDisplay.root.scale.copy(this.chestStartScale);
    this.chestCaptured = false;
  }

  private resetStaticActors(): void {
    this.wrist.visible = true;
    this.wrist.position.copy(WRIST_HIDDEN);
    this.wrist.quaternion.identity();
    this.wristMotionBase.copy(WRIST_HIDDEN);
    this.handPose.position.set(0, 0, 0);
    this.handPose.rotation.set(0, 0, 0);
    this.handVisual.position.set(0, 0, 0);
    this.handVisual.quaternion.copy(PALM_BASE_QUATERNION);
    this.handVisual.scale.setScalar(PALM_SCALE);
    this.handVisual.userData.wristDrift = 0;
    this.handVisual.userData.fingerTension = 0;
    this.handVisual.visible = false;
    this.fingertips.visible = false;
    this.drain.visible = false;
    this.setFingerBend(0);
    this.root.userData.cameraEnclosed = false;
    this.root.userData.cameraGrabbed = false;
    this.touchCameraHeld = false;
    this.root.userData.hullKicks = 0;
    this.root.userData.shrugs = 0;
    this.root.userData.sank = false;
  }

  private buildHand(): void {
    let selected: Group | null = null;
    try {
      selected = this.dependencies.propModels.createEventModel(
        'riggedHand',
      )?.root ?? null;
    } catch {
      selected = null;
    }
    const importedRig = selected === null
      ? null
      : findImportedHandRig(selected);
    if (
      selected !== null
      && importedRig !== null
      && hasRenderableBounds(selected)
    ) {
      selected.name = 'event-model:riggedHand';
      selected.scale.setScalar(1.7);
      selected.rotation.set(0.08, -0.32, 0.04);
      selected.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        for (const material of materials) {
          if (!(material instanceof MeshStandardMaterial)) continue;
          material.color.setHex(0x9b8069);
          material.emissive.setHex(0x2c2018);
          material.emissiveIntensity = 0.42;
          material.roughness = Math.max(0.9, material.roughness);
          material.metalness = 0;
          material.flatShading = true;
          material.needsUpdate = true;
        }
      });
      this.handVisual.add(selected);
      for (const skeleton of importedRig.skeletons) {
        this.staticSkeletons.add(skeleton);
      }
      this.fingerJoints.push(...importedRig.joints);
      this.handVisual.userData.modelKind = 'imported';
      return;
    }
    if (selected !== null) disposeRejectedModel(selected);
    this.buildProceduralHand();
    this.handVisual.userData.modelKind = 'procedural';
  }

  private buildProceduralHand(): void {
    const skin = createMaterial(0x9b8069, 0.96);
    const joint = createMaterial(0x796555, 0.98);
    const cuff = createMaterial(0x263238, 0.92);
    const palm = new Mesh(
      new BoxGeometry(1.32, 0.34, 1.65),
      skin,
    );
    palm.name = 'handyman-procedural-palm';
    palm.position.set(0, 0.18, 0);
    palm.rotation.z = 0.035;
    this.handVisual.add(palm);
    const cuffMesh = new Mesh(
      new CylinderGeometry(0.55, 0.68, 0.78, 8),
      cuff,
    );
    cuffMesh.name = 'handyman-procedural-cuff';
    cuffMesh.position.set(0, 0.08, -1.15);
    cuffMesh.rotation.x = Math.PI / 2;
    cuffMesh.scale.x = 1.12;
    this.handVisual.add(cuffMesh);

    const fingerData = [
      [-0.56, 1.26, 0.88],
      [-0.2, 1.52, 1],
      [0.17, 1.62, 1.04],
      [0.52, 1.44, 0.96],
    ] as const;
    for (let index = 0; index < fingerData.length; index += 1) {
      const [x, length, bendScale] = fingerData[index]!;
      this.buildProceduralFinger(
        `handyman-procedural-finger-${index + 1}`,
        x,
        0.62,
        length,
        bendScale,
        skin,
        joint,
      );
    }
    const thumbRoot = new Group();
    thumbRoot.name = 'handyman-procedural-thumb-root';
    thumbRoot.position.set(-0.82, 0.25, 0.16);
    thumbRoot.rotation.z = 0.78;
    const thumbMesh = new Mesh(
      new CylinderGeometry(0.12, 0.15, 0.78, 7),
      skin,
    );
    thumbMesh.name = 'handyman-procedural-thumb';
    thumbMesh.position.y = 0.36;
    thumbRoot.add(thumbMesh);
    this.handVisual.add(thumbRoot);
    this.fingerJoints.push({
      object: thumbRoot,
      baseQuaternion: thumbRoot.quaternion.clone(),
      bend: 0.78,
    });
  }

  private buildProceduralFinger(
    name: string,
    x: number,
    z: number,
    length: number,
    bendScale: number,
    skin: Material,
    jointMaterial: Material,
  ): void {
    const root = new Group();
    root.name = `${name}-root`;
    root.position.set(x, 0.28, z);
    this.handVisual.add(root);
    this.fingerJoints.push({
      object: root,
      baseQuaternion: root.quaternion.clone(),
      bend: 0.68 * bendScale,
    });
    let parent = root;
    const segmentLengths = [length * 0.4, length * 0.34, length * 0.26];
    for (let index = 0; index < segmentLengths.length; index += 1) {
      const segmentLength = segmentLengths[index]!;
      const segment = new Mesh(
        new CylinderGeometry(
          0.105 - index * 0.015,
          0.13 - index * 0.014,
          segmentLength,
          7,
        ),
        skin,
      );
      segment.name = `${name}-segment-${index + 1}`;
      segment.position.y = segmentLength * 0.5;
      parent.add(segment);
      const pivot = new Group();
      pivot.name = `${name}-joint-${index + 1}`;
      pivot.position.y = segmentLength;
      const knuckle = new Mesh(
        new SphereGeometry(0.13 - index * 0.014, 7, 5),
        jointMaterial,
      );
      knuckle.name = `${name}-knuckle-${index + 1}`;
      pivot.add(knuckle);
      parent.add(pivot);
      this.fingerJoints.push({
        object: pivot,
        baseQuaternion: pivot.quaternion.clone(),
        bend: (index === 0 ? 0.72 : index === 1 ? 0.94 : 0.76)
          * bendScale,
      });
      parent = pivot;
    }
  }

  private buildFingertips(): void {
    const skin = createMaterial(0x9b8069, 0.96);
    const positions = [
      [-0.58, 0.08, 0.28],
      [-0.2, 0.12, 0.4],
      [0.18, 0.14, 0.44],
      [0.55, 0.1, 0.35],
    ] as const;
    for (let index = 0; index < positions.length; index += 1) {
      const [x, y, z] = positions[index]!;
      const tip = new Mesh(
        new SphereGeometry(0.16, 7, 5),
        skin,
      );
      tip.name = `handyman-fingertip-${index + 1}`;
      tip.position.set(x, y, z);
      tip.scale.set(0.82, 1.35, 0.9);
      this.fingertips.add(tip);
    }
  }

  private buildDrain(): void {
    const water = createMaterial(0x537b82, 0.68);
    for (let index = 0; index < 4; index += 1) {
      const drop = new Mesh(
        new SphereGeometry(0.055 + index * 0.008, 6, 4),
        water,
      );
      drop.name = `handyman-joint-drop-${index + 1}`;
      drop.position.set(
        -0.48 + index * 0.31,
        0.18,
        0.34 - index * 0.1,
      );
      drop.scale.set(0.72, 1.4, 0.72);
      this.drain.add(drop);
    }
  }

  private cancelActiveAnimation(settle: boolean): void {
    const animation = this.activeAnimation;
    this.activeAnimation = null;
    if (animation === null) return;
    if (settle) this.finishAnimation(animation.kind);
    animation.resolve();
  }
}
