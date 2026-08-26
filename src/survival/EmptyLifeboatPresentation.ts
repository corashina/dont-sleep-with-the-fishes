import {
  Group,
  Quaternion,
  Vector3,
} from 'three';
import type { WaveSample } from '../ocean/WaveField';
import {
  applyDriftingWavePose,
  type DriftingWater,
} from './DriftingWaveMotion';
import { eventSideFromSeed, type EventSide } from './eventVariant';
import { KeyedEventPresentation } from './KeyedEventPresentation';
import type { EventPresentationKey } from './survivalTypes';

const FLOAT_POSITION = Object.freeze({ x: 5.8, y: 0.24, z: -7.2 });
const CONTAINER_POSITION = Object.freeze({ x: 0, y: 0.18, z: 0.65 });
const SEARCH_DURATION = 1.8;
const DRIFT_DURATION = 1.1;

function smoothstep(value: number): number {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
}

export class EmptyLifeboatPresentation extends KeyedEventPresentation {
  private readonly model = new Group();
  private readonly basePosition = new Vector3();
  private readonly animatedPosition = new Vector3();
  private readonly baseQuaternion = new Quaternion(
    0,
    Math.sin(Math.PI / 8),
    0,
    Math.cos(Math.PI / 8),
  );
  private readonly wave: WaveSample = {
    height: 0,
    displacementX: 0,
    displacementZ: 0,
    normal: { x: 0, y: 1, z: 0 },
  };
  private side: EventSide = -1;

  constructor(
    source: Group,
    container: Group,
    private readonly water: DriftingWater,
  ) {
    super('empty-lifeboat-presentation');
    this.subject.name = 'empty-lifeboat:subject';
    this.model.name = 'event-prop:empty-lifeboat';
    container.name = 'event-prop:empty-lifeboat-container';
    container.position.set(
      CONTAINER_POSITION.x,
      CONTAINER_POSITION.y,
      CONTAINER_POSITION.z,
    );
    this.model.add(source);
    this.model.add(container);
    this.subject.add(this.model);
    this.root.userData.state = 'idle';
    this.root.userData.eventSide = 'left';
  }

  override stage(variantSeed = 0): void {
    this.side = eventSideFromSeed(variantSeed);
    this.root.userData.eventSide = this.side === -1 ? 'left' : 'right';
    super.stage();
    this.root.userData.state = 'floating';
  }

  protected override reactionDuration(key: EventPresentationKey): number {
    return key === 'empty-lifeboat.drift' ? DRIFT_DURATION : SEARCH_DURATION;
  }

  protected reset(): void {
    this.basePosition.set(
      FLOAT_POSITION.x * this.side,
      FLOAT_POSITION.y,
      FLOAT_POSITION.z,
    );
    this.animatedPosition.copy(this.basePosition);
    this.subject.visible = true;
    this.root.userData.state = 'floating';
    this.applyFloatingPose(0, this.basePosition);
  }

  protected applyIdle(time: number): void {
    this.applyFloatingPose(time, this.basePosition);
  }

  protected applyAnimation(kind: string, time: number, progress: number): void {
    if (kind === 'reveal') {
      this.applyFloatingPose(time, this.basePosition);
      return;
    }
    if (kind === 'empty-lifeboat.drift') {
      this.applyExit(time, smoothstep(progress));
      return;
    }
    if (kind === 'empty-lifeboat.search') {
      this.applySearch(time, progress);
    }
  }

  protected finishAnimation(kind: string): void {
    if (kind === 'empty-lifeboat.drift') {
      this.root.userData.state = 'drifted';
      this.root.visible = false;
      return;
    }
    if (kind === 'empty-lifeboat.search') {
      this.root.userData.state = 'searched';
      this.root.visible = false;
    }
  }

  private applySearch(time: number, progress: number): void {
    if (progress < 0.45) {
      const approach = smoothstep(progress / 0.45);
      this.animatedPosition.copy(this.basePosition);
      this.animatedPosition.x -= this.side * approach * 1.7;
      this.animatedPosition.z += approach * 0.8;
      this.applyFloatingPose(time, this.animatedPosition);
      return;
    }
    if (progress < 0.62) {
      this.animatedPosition.copy(this.basePosition);
      this.animatedPosition.x -= this.side * 1.7;
      this.animatedPosition.z += 0.8;
      this.applyFloatingPose(time, this.animatedPosition);
      return;
    }
    this.applyExit(time, smoothstep((progress - 0.62) / 0.38), true);
  }

  private applyExit(time: number, progress: number, afterSearch = false): void {
    this.animatedPosition.copy(this.basePosition);
    if (afterSearch) {
      this.animatedPosition.x -= this.side * 1.7;
      this.animatedPosition.z += 0.8;
      this.animatedPosition.x += this.side * progress * 6.1;
      this.animatedPosition.z -= progress * 2.4;
    } else {
      this.animatedPosition.x += this.side * progress * 4.4;
      this.animatedPosition.z -= progress * 1.6;
    }
    this.animatedPosition.y -= progress * 0.28;
    this.applyFloatingPose(time, this.animatedPosition);
  }

  private applyFloatingPose(time: number, position: Vector3): void {
    applyDriftingWavePose(
      this.subject,
      position,
      this.baseQuaternion,
      this.wave,
      time,
      this.water,
    );
  }
}
