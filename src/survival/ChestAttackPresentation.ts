import {
  BufferGeometry,
  CylinderGeometry,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  TorusGeometry,
  Vector3,
} from 'three';
import {
  collectMeshResources,
  disposeResourceSets,
} from '../world/SceneResources';
import type { ChestEventPose } from './ChestDisplay';
import type {
  EventChoicePresentation,
  FocusedEventPresentation,
  FocusedEventPresentationDependencies,
} from './FocusedEventPresentation';
import type {
  ActionOutcome,
  EventResultPresentation,
} from './survivalTypes';

type ChestAttackAnimationKind =
  | 'reveal'
  | 'choice-net'
  | 'choice-hide'
  | 'result-bound'
  | 'result-hide';

interface ActiveAnimation {
  readonly kind: ChestAttackAnimationKind;
  elapsed: number;
  readonly duration: number;
  readonly resolve: () => void;
}

interface MutableChestEventPose {
  rattle: number;
  mouthOpen: number;
  bite: number;
  bound: number;
  broken: number;
  overboard: number;
}

interface MutableSupplyPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
}

const REVEAL_DURATION = 1.35;
const CHOICE_DURATION = 0.85;
const RESULT_DURATION = 0.9;
const X_AXIS = new Vector3(1, 0, 0);

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(value: number): number {
  const clamped = clamp01(value);
  return clamped * clamped * (3 - 2 * clamped);
}

function createMaterial(color: number, roughness: number, metalness = 0): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color,
    roughness,
    metalness,
    flatShading: true,
  });
}

export class ChestAttackPresentation implements FocusedEventPresentation {
  readonly root = new Group();
  private readonly net = new Group();
  private readonly geometries = new Set<BufferGeometry>();
  private readonly materials = new Set<Material>();
  private readonly cameraBasePosition = new Vector3();
  private readonly cameraBaseQuaternion = new Quaternion();
  private readonly cameraKickQuaternion = new Quaternion();
  private readonly netStart = new Vector3(-1.55, 1.45, -1.75);
  private readonly netEnd = new Vector3(-0.72, 0.67, -1.06);
  private readonly supplyNetPose: MutableSupplyPose = {
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
  private readonly pose: MutableChestEventPose = {
    rattle: 0,
    mouthOpen: 0,
    bite: 0,
    bound: 0,
    broken: 0,
    overboard: 0,
  };
  private activeAnimation: ActiveAnimation | null = null;
  private cameraCaptured = false;
  private netInstanceId: EventChoicePresentation['instanceId'] = null;
  private usingSupplyNet = false;
  private staged = false;
  private disposed = false;

  constructor(
    private readonly dependencies: FocusedEventPresentationDependencies,
  ) {
    this.root.name = 'focused-event:chest-attack';
    this.root.visible = false;
    this.root.userData.revealRattles = 0;
    this.root.userData.bites = 0;
    this.root.userData.cameraLoweredBeforeBite = false;

    this.buildNet();
    this.root.add(this.net);
    collectMeshResources(this.net, this.geometries, this.materials);
    this.resetActors();
  }

  stage(): void {
    if (this.disposed) return;
    this.cancelActiveAnimation(false);
    this.dependencies.supplyDisplay.releaseEventActor();
    this.dependencies.supplyDisplay.clearEventPose();
    this.captureCamera();
    this.staged = true;
    this.root.visible = true;
    this.dependencies.chestDisplay.stageMimic();
    this.resetPose();
    this.resetActors();
    this.root.userData.state = 'staged';
    this.root.userData.revealRattles = 0;
    this.root.userData.bites = 0;
    this.root.userData.cameraLoweredBeforeBite = false;
  }

  reveal(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (!this.staged) this.stage();
    this.root.userData.state = 'revealing';
    return this.startAnimation('reveal', REVEAL_DURATION);
  }

  playChoice(choice: EventChoicePresentation): Promise<void> {
    if (this.disposed) return Promise.resolve();
    switch (choice.choiceId) {
      case 'fishingNet':
        this.netInstanceId = choice.instanceId;
        this.usingSupplyNet = choice.instanceId !== null
          && this.dependencies.supplyDisplay.pinEventActor(choice.instanceId);
        this.net.visible = !this.usingSupplyNet;
        this.root.userData.state = 'binding';
        return this.startAnimation('choice-net', CHOICE_DURATION);
      case 'sleep':
        this.root.userData.state = 'hiding';
        return this.startAnimation('choice-hide', CHOICE_DURATION);
      default:
        throw new Error(`Unsupported Chest Attack choice: ${choice.choiceId}`);
    }
  }

  react(
    result: EventResultPresentation,
    outcome: ActionOutcome,
  ): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (result.eventId !== 'chest-attack') {
      throw new Error(`Chest Attack received result for ${result.eventId}.`);
    }
    void outcome;
    switch (result.resultId) {
      case 'chest-bound':
        this.net.visible = !this.usingSupplyNet;
        this.root.userData.state = 'bound-result';
        return this.startAnimation('result-bound', RESULT_DURATION * 0.7);
      case 'chest-hide':
        this.root.userData.state = 'hide-result';
        return this.startAnimation('result-hide', RESULT_DURATION);
      default:
        throw new Error(`Unsupported Chest Attack result: ${result.resultId}`);
    }
  }

  clear(): void {
    if (this.disposed) return;
    this.cancelActiveAnimation(false);
    this.resetActors();
    this.dependencies.supplyDisplay.releaseEventActor();
    this.dependencies.supplyDisplay.clearEventPose();
    this.restoreCamera();
    this.dependencies.chestDisplay.restorePose();
    this.root.visible = false;
    this.root.userData.state = 'idle';
    this.staged = false;
  }

  update(_time: number, delta: number): void {
    if (this.disposed || delta < 0) return;
    const animation = this.activeAnimation;
    if (animation === null) return;
    animation.elapsed = Math.min(
      animation.duration,
      animation.elapsed + Math.max(0, delta),
    );
    const progress = animation.duration <= 0 ? 1 : animation.elapsed / animation.duration;
    this.applyAnimation(animation.kind, progress);
    if (progress < 1) return;
    this.activeAnimation = null;
    this.finishAnimation(animation.kind);
    animation.resolve();
  }

  settleForVisibilityChange(): void {
    if (this.disposed) return;
    this.cancelActiveAnimation(true);
  }

  dispose(): void {
    if (this.disposed) return;
    this.cancelActiveAnimation(false);
    this.restoreCamera();
    this.dependencies.chestDisplay.restorePose();
    this.dependencies.supplyDisplay.releaseEventActor();
    this.dependencies.supplyDisplay.clearEventPose();
    this.disposed = true;
    this.staged = false;
    this.root.removeFromParent();
    disposeResourceSets(this.geometries, this.materials);
  }

  private startAnimation(
    kind: ChestAttackAnimationKind,
    duration: number,
  ): Promise<void> {
    this.cancelActiveAnimation(true);
    return new Promise<void>((resolve) => {
      this.activeAnimation = { kind, elapsed: 0, duration, resolve };
      this.applyAnimation(kind, 0);
    });
  }

  private applyAnimation(kind: ChestAttackAnimationKind, progress: number): void {
    const normalized = clamp01(progress);
    switch (kind) {
      case 'reveal':
        this.applyReveal(normalized);
        break;
      case 'choice-net':
        this.applyNetChoice(normalized);
        break;
      case 'choice-hide':
        this.applyHideChoice(normalized);
        break;
      case 'result-bound':
        this.applyBoundResult(normalized);
        break;
      case 'result-hide':
        this.applyHideResult(normalized);
        break;
    }
  }

  private finishAnimation(kind: ChestAttackAnimationKind): void {
    this.applyAnimation(kind, 1);
    switch (kind) {
      case 'reveal':
        this.root.userData.state = 'revealed';
        break;
      case 'choice-net':
        this.root.userData.state = 'choice-bound';
        break;
      case 'choice-hide':
        this.root.userData.state = 'choice-hidden';
        break;
      case 'result-bound':
        this.root.userData.state = 'held-bound';
        break;
      case 'result-hide':
        this.root.userData.state = 'held-overboard';
        break;
    }
  }

  private applyReveal(progress: number): void {
    this.resetPose();
    if (progress < 0.26) {
      this.pose.rattle = Math.sin(progress / 0.26 * Math.PI * 2) * 0.38;
      if (progress >= 0.08) this.root.userData.revealRattles = 1;
    } else if (progress < 0.42) {
      this.pose.rattle = 0;
    } else if (progress < 0.72) {
      this.pose.rattle = Math.sin((progress - 0.42) / 0.3 * Math.PI * 2) * 0.88;
      if (progress >= 0.48) this.root.userData.revealRattles = 2;
    } else {
      this.root.userData.revealRattles = 2;
      this.pose.mouthOpen = smoothstep((progress - 0.72) / 0.28);
      this.pose.bite = smoothstep((progress - 0.76) / 0.24) * 0.2;
    }
    if (progress >= 0.62 && progress < 0.72) {
      this.pose.mouthOpen = smoothstep((progress - 0.62) / 0.1) * 0.18;
    }
    this.dependencies.chestDisplay.applyEventPose(this.pose as ChestEventPose);
  }

  private applyNetChoice(progress: number): void {
    const travel = smoothstep(progress);
    if (this.usingSupplyNet && this.netInstanceId !== null) {
      this.supplyNetPose.x = -0.42 * travel;
      this.supplyNetPose.y = 0.58 * travel;
      this.supplyNetPose.z = -0.72 * travel;
      this.supplyNetPose.yaw = 0.18 * travel;
      this.supplyNetPose.pitch = -0.64 * travel;
      this.supplyNetPose.roll = 0.22 * travel;
      this.supplyNetPose.scaleX = 1;
      this.supplyNetPose.scaleY = 1;
      this.supplyNetPose.scaleZ = 1;
      this.dependencies.supplyDisplay.applyEventItemPose(
        this.netInstanceId,
        this.supplyNetPose,
      );
    } else {
      this.net.position.lerpVectors(this.netStart, this.netEnd, travel);
      this.net.rotation.z = -0.22 + travel * 0.3;
    }
    this.resetPose();
    this.pose.mouthOpen = 1 - smoothstep((progress - 0.48) / 0.52);
    this.pose.bound = smoothstep((progress - 0.55) / 0.45);
    this.pose.bite = 0.2 * (1 - travel);
    this.dependencies.chestDisplay.applyEventPose(this.pose as ChestEventPose);
  }

  private applyHideChoice(progress: number): void {
    const lower = smoothstep(progress);
    this.applyCameraOffset(-0.58 * lower, 0.06 * lower, 0);
    this.resetPose();
    this.pose.mouthOpen = 1;
    this.pose.bite = 0.2;
    this.dependencies.chestDisplay.applyEventPose(this.pose as ChestEventPose);
    if (progress >= 1) {
      this.root.userData.cameraLoweredBeforeBite = true;
    }
  }

  private applyBoundResult(progress: number): void {
    this.resetPose();
    this.pose.mouthOpen = 0;
    this.pose.bound = 1;
    this.pose.rattle = Math.sin(progress * Math.PI * 2) * (1 - progress) * 0.18;
    this.dependencies.chestDisplay.applyEventPose(this.pose as ChestEventPose);
    this.net.scale.set(1 + Math.sin(progress * Math.PI) * 0.08, 1, 1);
  }

  private applyHideResult(progress: number): void {
    this.resetPose();
    this.pose.mouthOpen = 1;
    if (progress < 0.46) {
      const biteProgress = progress / 0.46;
      this.pose.bite = Math.sin(biteProgress * Math.PI);
      if (progress >= 0.06) this.root.userData.bites = 1;
      this.applyCameraOffset(
        -0.58,
        0.06,
        -Math.sin(biteProgress * Math.PI) * 0.1,
      );
    } else {
      this.root.userData.bites = 1;
      this.pose.overboard = smoothstep((progress - 0.46) / 0.54);
      this.applyCameraOffset(-0.58, 0.06, 0);
    }
    this.dependencies.chestDisplay.applyEventPose(this.pose as ChestEventPose);
  }

  private applyCameraOffset(
    y: number,
    pitch: number,
    z: number,
  ): void {
    if (!this.cameraCaptured) return;
    this.dependencies.cameraRig.position.copy(this.cameraBasePosition);
    this.dependencies.cameraRig.position.y += y;
    this.dependencies.cameraRig.position.z += z;
    this.cameraKickQuaternion.setFromAxisAngle(X_AXIS, pitch);
    this.dependencies.cameraRig.quaternion
      .copy(this.cameraBaseQuaternion)
      .multiply(this.cameraKickQuaternion);
  }

  private captureCamera(): void {
    this.cameraBasePosition.copy(this.dependencies.cameraRig.position);
    this.cameraBaseQuaternion.copy(this.dependencies.cameraRig.quaternion);
    this.cameraCaptured = true;
  }

  private restoreCamera(): void {
    if (!this.cameraCaptured) return;
    this.dependencies.cameraRig.position.copy(this.cameraBasePosition);
    this.dependencies.cameraRig.quaternion.copy(this.cameraBaseQuaternion);
    this.cameraCaptured = false;
  }

  private resetPose(): void {
    this.pose.rattle = 0;
    this.pose.mouthOpen = 0;
    this.pose.bite = 0;
    this.pose.bound = 0;
    this.pose.broken = 0;
    this.pose.overboard = 0;
  }

  private resetActors(): void {
    this.netInstanceId = null;
    this.usingSupplyNet = false;
    this.net.visible = false;
    this.net.position.copy(this.netStart);
    this.net.rotation.set(-Math.PI / 2, 0.16, -0.22);
    this.net.scale.set(1, 1, 1);
  }

  private buildNet(): void {
    this.net.name = 'chest-attack-net';
    const rope = createMaterial(0x6e5b3e, 1);
    const rim = new Mesh(new TorusGeometry(0.5, 0.025, 6, 16), rope);
    rim.name = 'chest-attack-net-rim';
    this.net.add(rim);
    for (let index = -2; index <= 2; index += 1) {
      const strand = new Mesh(
        new CylinderGeometry(0.009, 0.009, 0.9, 5),
        rope,
      );
      strand.name = `chest-attack-net-strand-${index + 3}`;
      strand.position.x = index * 0.17;
      strand.scale.y = Math.sqrt(Math.max(0.15, 1 - (index * 0.17 / 0.5) ** 2));
      this.net.add(strand);
    }
    const cross = new Mesh(new CylinderGeometry(0.01, 0.01, 0.94, 5), rope);
    cross.name = 'chest-attack-net-cross-strand';
    cross.rotation.z = Math.PI / 2;
    this.net.add(cross);
  }

  private cancelActiveAnimation(settle: boolean): void {
    const animation = this.activeAnimation;
    this.activeAnimation = null;
    if (animation === null) return;
    if (settle) this.finishAnimation(animation.kind);
    animation.resolve();
  }
}
