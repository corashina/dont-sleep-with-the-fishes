import {
  Box3,
  Group,
  Object3D,
  PerspectiveCamera,
  PointLight,
  Quaternion,
  Vector3,
} from 'three';
import { KeyedEventPresentation } from './KeyedEventPresentation';
import { StationaryEventCamera } from './StationaryEventCamera';
import type { EventPresentationCue } from './eventPresentationCue';
import type { EventPresentationKey } from './survivalTypes';

const STERN_YAW = Math.PI;
const CAMERA_FORWARD_TRAVEL = 0.95;
const REVEAL_DURATION = 0.25;
const REACTION_DURATION = 4.2;
const ACTOR_CUE_PROGRESS = 0.55;

function smoothstep(value: number): number {
  const clamped = Math.min(1, Math.max(0, value));
  return clamped * clamped * (3 - 2 * clamped);
}

function floorOffset(model: Object3D): number {
  const bounds = new Box3().setFromObject(model, true);
  return bounds.isEmpty() ? 0 : -bounds.min.y;
}

export class CheckBackPresentation extends KeyedEventPresentation {
  private readonly fish: Object3D;
  private readonly anglerfish: Object3D;
  private readonly actorRig = new Group();
  private readonly cameraLook: StationaryEventCamera;
  private readonly targetPosition = new Vector3();
  private readonly targetQuaternion = new Quaternion();
  private readonly rootQuaternion = new Quaternion();
  private readonly fishFloorY: number;
  private readonly anglerfishFloorY: number;
  private readonly actorLight = new PointLight(0xf0c889, 3.2, 3.5, 2);
  private cueEmitted = false;

  constructor(
    fish: Object3D,
    anglerfish: Object3D,
    camera: PerspectiveCamera,
    private readonly badPositionTarget: Object3D,
    private readonly fishBenchTarget: Object3D,
    private readonly emitCue: (cue: EventPresentationCue) => void,
  ) {
    super('check-back-presentation');
    this.cameraLook = new StationaryEventCamera(camera);
    this.fish = fish;
    this.fish.name = 'check-back:fish';
    this.fishFloorY = floorOffset(this.fish);
    this.anglerfish = anglerfish;
    this.anglerfish.name = 'check-back:anglerfish';
    this.anglerfishFloorY = floorOffset(this.anglerfish);
    this.actorLight.name = 'check-back:actor-light';
    this.actorLight.position.set(0, 0.8, 0);
    this.actorRig.name = 'check-back:actor-rig';
    this.actorRig.add(this.fish);
    this.actorRig.add(this.anglerfish);
    this.subject.add(this.actorRig);
    this.subject.add(this.actorLight);
  }

  stage(): void {
    this.cameraLook.restore();
    this.cameraLook.capture();
    super.stage();
  }

  protected reset(): void {
    this.placeSubjectAt(this.badPositionTarget);
    this.actorRig.position.set(0, this.anglerfishFloorY, 0);
    this.actorRig.rotation.set(0, 0, 0);
    this.actorRig.scale.setScalar(1);
    this.fish.position.set(0, this.fishFloorY - this.anglerfishFloorY, 0);
    this.fish.rotation.set(0, 0, 0);
    this.fish.visible = false;
    this.anglerfish.position.set(0, 0, 0);
    this.anglerfish.rotation.set(0, 0, 0);
    this.anglerfish.visible = false;
    this.cueEmitted = false;
    this.cameraLook.apply(0, 0);
  }

  protected applyIdle(_time: number): void {
    if (this.settledKind === 'check-the-back.fish') {
      this.placeSubjectAt(this.fishBenchTarget);
      this.fish.visible = true;
      this.anglerfish.visible = false;
      this.applySettledActor();
    } else if (this.settledKind === 'check-the-back.bad') {
      this.placeSubjectAt(this.badPositionTarget);
      this.fish.visible = false;
      this.anglerfish.visible = true;
      this.applySettledActor();
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
    if (kind === 'reveal') {
      this.placeSubjectAt(this.badPositionTarget);
      this.cameraLook.apply(0, 0);
      return;
    }
    if (kind === 'check-the-back.ignore') {
      this.placeSubjectAt(this.badPositionTarget);
      this.cameraLook.apply(0, 0);
      return;
    }
    if (kind !== 'check-the-back.fish' && kind !== 'check-the-back.bad') return;
    this.placeSubjectAt(
      kind === 'check-the-back.fish' ? this.fishBenchTarget : this.badPositionTarget,
    );
    const actor = kind === 'check-the-back.fish' ? this.fish : this.anglerfish;
    actor.visible = true;
    const actorProgress = smoothstep(progress);
    this.actorRig.rotation.z = Math.sin(actorProgress * Math.PI * 3)
      * (1 - actorProgress) * 0.18;
    this.actorRig.position.y = this.anglerfishFloorY;
    const turn = smoothstep(progress / 0.68);
    this.cameraLook.applyLookAtWithFixedYaw(
      this.actorRig,
      STERN_YAW,
      turn,
      CAMERA_FORWARD_TRAVEL,
    );
    if (!this.cueEmitted && progress >= ACTOR_CUE_PROGRESS) {
      this.cueEmitted = true;
      this.emitCue({
        eventId: 'check-the-back',
        cue: kind === 'check-the-back.fish' ? 'fish' : 'anglerfish',
      });
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

  private applySettledActor(): void {
    this.actorRig.position.y = this.anglerfishFloorY;
    this.actorRig.rotation.z = 0;
    this.cameraLook.applyLookAtWithFixedYaw(
      this.actorRig,
      STERN_YAW,
      1,
      CAMERA_FORWARD_TRAVEL,
    );
  }

  private placeSubjectAt(target: Object3D): void {
    target.getWorldPosition(this.targetPosition);
    target.getWorldQuaternion(this.targetQuaternion);
    this.root.worldToLocal(this.targetPosition);
    this.root.getWorldQuaternion(this.rootQuaternion).invert();
    this.targetQuaternion.premultiply(this.rootQuaternion);
    this.subject.position.copy(this.targetPosition);
    this.subject.quaternion.copy(this.targetQuaternion);
  }
}
