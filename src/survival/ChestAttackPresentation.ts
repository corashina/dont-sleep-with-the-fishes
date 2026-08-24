import {
  BufferGeometry,
  CylinderGeometry,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  TorusGeometry,
  Vector3,
} from 'three';
import {
  collectMeshResources,
  disposeResourceSets,
} from '../world/SceneResources';
import type { MutableSupplyPose } from './BoatSupplyDisplay';
import type { ChestEventPose } from './ChestDisplay';
import {
  clamp01Unchecked as clamp01,
  smoothstepUnchecked as smoothstep,
} from './animationMath';
import type {
  EventChoicePresentation,
  FocusedEventPresentation,
  FocusedEventPresentationDependencies,
} from './FocusedEventPresentation';
import type {
  ActionOutcome,
  EventResultPresentation,
} from './survivalTypes';
import { StationaryEventCamera } from './StationaryEventCamera';
import { TimedPresentationAnimation } from './TimedPresentationAnimation';

type ChestAttackAnimationKind =
  | 'reveal'
  | 'choice-net'
  | 'choice-attack'
  | 'result-bound';

interface MutableChestEventPose {
  rattle: number;
  mouthOpen: number;
  bite: number;
  bound: number;
  broken: number;
  overboard: number;
}

const DURATION_SCALE = 1.15;
const REVEAL_DURATION = 2.4 * DURATION_SCALE;
const NET_CHOICE_DURATION = 1.45 * DURATION_SCALE;
const ATTACK_CHOICE_DURATION = 1.15 * DURATION_SCALE;
const RESULT_DURATION = 0.65 * DURATION_SCALE;
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
  private readonly cameraLook: StationaryEventCamera;
  private readonly netStart = new Vector3(-0.48, 1.12, 0.2);
  private readonly netEnd = new Vector3(0, 0.72, 2.08);
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
  private readonly animation: TimedPresentationAnimation<ChestAttackAnimationKind>;
  private netInstanceId: EventChoicePresentation['instanceId'] = null;
  private usingSupplyNet = false;
  private woodCueEmitted = false;
  private attackCueEmitted = false;
  private staged = false;
  private disposed = false;

  constructor(
    private readonly dependencies: FocusedEventPresentationDependencies,
  ) {
    this.cameraLook = new StationaryEventCamera(dependencies.camera);
    this.animation = new TimedPresentationAnimation<ChestAttackAnimationKind>(
      (kind, _time, progress) => this.applyAnimation(kind, progress),
      (kind) => this.finishAnimation(kind),
    );
    this.root.name = 'focused-event:chest-attack';
    this.root.visible = false;
    this.root.userData.revealRattles = 0;
    this.root.userData.bites = 0;

    this.buildNet();
    this.root.add(this.net);
    collectMeshResources(this.net, this.geometries, this.materials);
    this.resetActors();
  }

  itemAimTarget(): Object3D | null {
    if (this.disposed || !this.staged || !this.dependencies.chestDisplay.root.visible) {
      return null;
    }
    return this.dependencies.chestDisplay.root;
  }

  stage(): void {
    if (this.disposed) return;
    this.animation.cancel();
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
    this.woodCueEmitted = false;
    this.attackCueEmitted = false;
  }

  reveal(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (!this.staged) this.stage();
    this.root.userData.state = 'warning';
    this.emitWoodCue();
    this.animation.settle();
    const animation = this.animation.start('reveal', REVEAL_DURATION);
    this.applyAnimation('reveal', 0);
    return animation;
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
        this.animation.settle();
        const netAnimation = this.animation.start('choice-net', NET_CHOICE_DURATION);
        this.applyAnimation('choice-net', 0);
        return netAnimation;
      case 'attack':
        this.root.userData.state = 'turning-to-attack';
        this.animation.settle();
        const attackAnimation = this.animation.start(
          'choice-attack',
          ATTACK_CHOICE_DURATION,
        );
        this.applyAnimation('choice-attack', 0);
        return attackAnimation;
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
        this.animation.settle();
        const boundAnimation = this.animation.start(
          'result-bound',
          RESULT_DURATION * 0.7,
        );
        this.applyAnimation('result-bound', 0);
        return boundAnimation;
      default:
        throw new Error(`Unsupported Chest Attack result: ${result.resultId}`);
    }
  }

  clear(): void {
    if (this.disposed) return;
    this.animation.cancel();
    this.resetActors();
    this.dependencies.supplyDisplay.releaseEventActor();
    this.dependencies.supplyDisplay.clearEventPose();
    this.restoreCamera();
    this.dependencies.chestDisplay.restorePose();
    this.root.visible = false;
    this.root.userData.state = 'idle';
    this.staged = false;
  }

  update(time: number, delta: number): void {
    if (this.disposed || delta < 0) return;
    this.animation.update(time, delta);
  }

  settleForVisibilityChange(): void {
    if (this.disposed) return;
    this.animation.settle();
  }

  dispose(): void {
    if (this.disposed) return;
    this.animation.cancel();
    this.restoreCamera();
    this.dependencies.chestDisplay.restorePose();
    this.dependencies.supplyDisplay.releaseEventActor();
    this.dependencies.supplyDisplay.clearEventPose();
    this.disposed = true;
    this.staged = false;
    this.root.removeFromParent();
    disposeResourceSets(this.geometries, this.materials);
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
      case 'choice-attack':
        this.applyAttackChoice(normalized);
        break;
      case 'result-bound':
        this.applyBoundResult(normalized);
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
      case 'choice-attack':
        this.root.userData.state = 'impact';
        break;
      case 'result-bound':
        this.root.userData.state = 'held-bound';
        break;
    }
  }

  private applyReveal(progress: number): void {
    this.resetPose();
    this.applyCameraLook(0, 0);
    this.pose.rattle = Math.sin(progress * Math.PI * 10) * 0.42;
    this.root.userData.revealRattles = Math.min(3, Math.floor(progress * 4));
    this.dependencies.chestDisplay.applyEventPose(this.pose as ChestEventPose);
  }

  private applyNetChoice(progress: number): void {
    const turn = smoothstep(progress / 0.5);
    const travel = smoothstep((progress - 0.42) / 0.58);
    this.cameraLook.applyLookAt(this.dependencies.chestDisplay.root, turn);
    if (this.usingSupplyNet && this.netInstanceId !== null) {
      this.supplyNetPose.x = 0.96 * travel;
      this.supplyNetPose.y = 0.5 * travel;
      this.supplyNetPose.z = 3.24 * travel;
      this.supplyNetPose.yaw = -0.24 * travel;
      this.supplyNetPose.pitch = -0.72 * travel;
      this.supplyNetPose.roll = 0.18 * travel;
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
    this.pose.rattle = Math.sin(progress * Math.PI * 8) * (1 - travel) * 0.56;
    this.pose.mouthOpen = smoothstep((progress - 0.3) / 0.28)
      * (1 - smoothstep((progress - 0.64) / 0.3));
    this.pose.bound = smoothstep((progress - 0.62) / 0.38);
    this.dependencies.chestDisplay.applyEventPose(this.pose as ChestEventPose);
  }

  private applyAttackChoice(progress: number): void {
    const turn = smoothstep(progress / 0.54);
    this.cameraLook.applyLookAt(this.dependencies.chestDisplay.root, turn);
    this.resetPose();
    this.pose.rattle = Math.sin(progress * Math.PI * 10)
      * (1 - smoothstep((progress - 0.7) / 0.2));
    this.pose.mouthOpen = smoothstep((progress - 0.46) / 0.28);
    this.pose.bite = smoothstep((progress - 0.74) / 0.24);
    this.dependencies.chestDisplay.applyEventPose(this.pose as ChestEventPose);
    if (progress >= 0.98) {
      this.root.userData.bites = 1;
      this.emitAttackCue();
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

  private applyCameraLook(yaw: number, pitch: number): void {
    this.cameraLook.apply(yaw, pitch);
  }

  private captureCamera(): void {
    this.cameraLook.capture();
  }

  private restoreCamera(): void {
    this.cameraLook.restore();
  }

  private emitWoodCue(): void {
    if (this.woodCueEmitted) return;
    this.woodCueEmitted = true;
    this.dependencies.emitCue({ eventId: 'chest-attack', cue: 'wood' });
  }

  private emitAttackCue(): void {
    if (this.attackCueEmitted) return;
    this.attackCueEmitted = true;
    this.dependencies.emitCue({ eventId: 'chest-attack', cue: 'attack' });
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

}
