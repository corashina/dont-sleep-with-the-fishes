import {
  Object3D,
  PerspectiveCamera,
  Quaternion,
  Vector3,
} from 'three';
import { KeyedEventPresentation } from './KeyedEventPresentation';
import { StationaryEventCamera } from './StationaryEventCamera';
import type { EventPresentationCue } from './eventPresentationCue';
import type { EventPresentationKey } from './survivalTypes';

const STERN_YAW = Math.PI;
const STERN_LOOK_DOWN_PITCH = -0.74;
const REVEAL_DURATION = 3.8;
const REACTION_DURATION = 4.2;
const ACTOR_REVEAL_PROGRESS = 0.72;

function smoothstep(value: number): number {
  const clamped = Math.min(1, Math.max(0, value));
  return clamped * clamped * (3 - 2 * clamped);
}

export class CheckBackPresentation extends KeyedEventPresentation {
  private readonly fish: Object3D;
  private readonly anglerfish: Object3D;
  private readonly cameraLook: StationaryEventCamera;
  private readonly targetPosition = new Vector3();
  private readonly targetQuaternion = new Quaternion();
  private readonly rootQuaternion = new Quaternion();
  private cueEmitted = false;

  constructor(
    fish: Object3D,
    anglerfish: Object3D,
    camera: PerspectiveCamera,
    private readonly sternFloorTarget: Object3D,
    private readonly emitCue: (cue: EventPresentationCue) => void,
  ) {
    super('check-back-presentation');
    this.cameraLook = new StationaryEventCamera(camera);
    this.fish = fish;
    this.fish.name = 'check-back:fish';
    this.anglerfish = anglerfish;
    this.anglerfish.name = 'check-back:anglerfish';
    this.subject.add(this.fish);
    this.subject.add(this.anglerfish);
  }

  stage(): void {
    this.cameraLook.restore();
    this.cameraLook.capture();
    super.stage();
  }

  protected reset(): void {
    this.placeSubjectInsideStern();
    this.fish.position.set(0, 0, 0);
    this.fish.rotation.set(0, 0, 0);
    this.fish.scale.setScalar(1);
    this.fish.visible = false;
    this.anglerfish.position.set(0, 0, 0);
    this.anglerfish.rotation.set(0, 0, 0);
    this.anglerfish.scale.setScalar(1);
    this.anglerfish.visible = false;
    this.cueEmitted = false;
    this.cameraLook.apply(0, 0);
  }

  protected applyIdle(_time: number): void {
    this.placeSubjectInsideStern();
    if (this.settledKind === 'check-the-back.fish') {
      this.applySternView();
      this.fish.visible = true;
      this.fish.rotation.z = -0.12;
      this.anglerfish.visible = false;
    } else if (this.settledKind === 'check-the-back.bad') {
      this.applySternView();
      this.fish.visible = false;
      this.anglerfish.visible = true;
    } else {
      this.cameraLook.apply(0, 0);
      this.fish.visible = false;
      this.anglerfish.visible = false;
    }
  }

  protected prepareAnimation(_kind: string): void {
    this.fish.visible = false;
    this.anglerfish.visible = false;
    this.cueEmitted = false;
  }

  protected applyAnimation(kind: string, _time: number, progress: number): void {
    this.placeSubjectInsideStern();
    if (kind === 'reveal') {
      const sweep = Math.sin(Math.PI * progress);
      const ingress = smoothstep(progress / 0.12);
      const returnToCenter = 1 - smoothstep((progress - 0.72) / 0.28);
      const yaw = 0.25 * Math.sin(2 * Math.PI * progress)
        * sweep * ingress * returnToCenter;
      this.cameraLook.apply(yaw, 0);
      return;
    }
    if (kind === 'check-the-back.ignore') {
      this.cameraLook.apply(0, 0);
      return;
    }
    const turn = smoothstep(progress / 0.68);
    const lookDown = smoothstep((progress - 0.42) / 0.3);
    this.cameraLook.apply(turn * STERN_YAW, lookDown * STERN_LOOK_DOWN_PITCH);
    if (kind !== 'check-the-back.fish' && kind !== 'check-the-back.bad') return;
    if (progress <= ACTOR_REVEAL_PROGRESS) return;

    const actorProgress = smoothstep(
      (progress - ACTOR_REVEAL_PROGRESS) / (1 - ACTOR_REVEAL_PROGRESS),
    );
    const actor = kind === 'check-the-back.fish' ? this.fish : this.anglerfish;
    actor.visible = true;
    if (!this.cueEmitted) {
      this.cueEmitted = true;
      this.emitCue({
        eventId: 'check-the-back',
        cue: kind === 'check-the-back.fish' ? 'fish' : 'anglerfish',
      });
    }
    if (kind === 'check-the-back.fish') {
      actor.rotation.z = Math.sin(actorProgress * Math.PI * 5)
        * (1 - actorProgress) * 0.7;
      actor.position.y = Math.sin(actorProgress * Math.PI) * 0.2;
    } else {
      actor.rotation.z = Math.sin(actorProgress * Math.PI * 3)
        * (1 - actorProgress) * 0.18;
    }
  }

  protected revealDuration(): number {
    return REVEAL_DURATION;
  }

  protected reactionDuration(kind: EventPresentationKey): number {
    if (kind === 'check-the-back.fish' || kind === 'check-the-back.bad') {
      return REACTION_DURATION;
    }
    return kind === 'check-the-back.ignore' ? 0.25 : super.reactionDuration(kind);
  }

  protected disposeOwned(): void {
    this.cameraLook.restore();
  }

  clear(): void {
    super.clear();
    this.cameraLook.restore();
  }

  interactionRoot(): Object3D | null {
    return null;
  }

  private applySternView(): void {
    this.cameraLook.apply(STERN_YAW, STERN_LOOK_DOWN_PITCH);
  }

  private placeSubjectInsideStern(): void {
    this.sternFloorTarget.getWorldPosition(this.targetPosition);
    this.sternFloorTarget.getWorldQuaternion(this.targetQuaternion);
    this.root.worldToLocal(this.targetPosition);
    this.root.getWorldQuaternion(this.rootQuaternion).invert();
    this.targetQuaternion.premultiply(this.rootQuaternion);
    this.subject.position.copy(this.targetPosition);
    this.subject.quaternion.copy(this.targetQuaternion);
  }
}
