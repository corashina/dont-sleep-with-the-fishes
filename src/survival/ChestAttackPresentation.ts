import { Group } from 'three';
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
  | 'choice-attack';

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
const ATTACK_CHOICE_DURATION = 1.15 * DURATION_SCALE;

export class ChestAttackPresentation implements FocusedEventPresentation {
  readonly root = new Group();
  private readonly cameraLook: StationaryEventCamera;
  private readonly pose: MutableChestEventPose = {
    rattle: 0,
    mouthOpen: 0,
    bite: 0,
    bound: 0,
    broken: 0,
    overboard: 0,
  };
  private readonly animation: TimedPresentationAnimation<ChestAttackAnimationKind>;
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

  }

  stage(): void {
    if (this.disposed) return;
    this.animation.cancel();
    this.captureCamera();
    this.staged = true;
    this.root.visible = true;
    this.dependencies.chestDisplay.stageMimic();
    this.resetPose();
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
    if (choice.choiceId !== 'attack') {
      throw new Error(`Unsupported Chest Attack choice: ${choice.choiceId}`);
    }
    this.root.userData.state = 'turning-to-attack';
    this.animation.settle();
    const attackAnimation = this.animation.start(
      'choice-attack',
      ATTACK_CHOICE_DURATION,
    );
    this.applyAnimation('choice-attack', 0);
    return attackAnimation;
  }

  react(
    result: EventResultPresentation,
    outcome: ActionOutcome,
  ): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (result.eventId !== 'chest-attack') {
      throw new Error(`Chest Attack received result for ${result.eventId}.`);
    }
    if (result.resultId !== 'chest-attack') {
      throw new Error(`Unsupported Chest Attack result: ${result.resultId}`);
    }
    void outcome;
    return Promise.resolve();
  }

  clear(): void {
    if (this.disposed) return;
    this.animation.cancel();
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
    this.disposed = true;
    this.staged = false;
    this.root.removeFromParent();
  }

  private applyAnimation(kind: ChestAttackAnimationKind, progress: number): void {
    const normalized = clamp01(progress);
    switch (kind) {
      case 'reveal':
        this.applyReveal(normalized);
        break;
      case 'choice-attack':
        this.applyAttackChoice(normalized);
        break;
    }
  }

  private finishAnimation(kind: ChestAttackAnimationKind): void {
    this.applyAnimation(kind, 1);
    switch (kind) {
      case 'reveal':
        this.root.userData.state = 'revealed';
        break;
      case 'choice-attack':
        this.root.userData.state = 'impact';
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

}
