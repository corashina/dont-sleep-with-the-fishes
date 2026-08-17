import {
  Object3D,
  PerspectiveCamera,
  Quaternion,
  Vector3,
} from 'three';
import { KeyedEventPresentation } from './KeyedEventPresentation';
import { StationaryEventCamera } from './StationaryEventCamera';
import type { EventPresentationKey } from './survivalTypes';

const STERN_YAW = Math.PI;
const STERN_LOOK_DOWN_PITCH = -0.74;

function smoothstep(value: number): number {
  const clamped = Math.min(1, Math.max(0, value));
  return clamped * clamped * (3 - 2 * clamped);
}

export class CheckBackPresentation extends KeyedEventPresentation {
  private readonly fish: Object3D;
  private readonly cameraLook: StationaryEventCamera;
  private readonly targetPosition = new Vector3();
  private readonly targetQuaternion = new Quaternion();
  private readonly rootQuaternion = new Quaternion();

  constructor(
    fish: Object3D,
    camera: PerspectiveCamera,
    private readonly sternFloorTarget: Object3D,
  ) {
    super('check-back-presentation');
    this.cameraLook = new StationaryEventCamera(camera);
    this.fish = fish;
    this.fish.name = 'check-back:fish';
    this.subject.add(this.fish);
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
    this.cameraLook.apply(0, 0);
  }

  protected applyIdle(_time: number): void {
    this.placeSubjectInsideStern();
    if (this.settledKind === 'reveal') {
      this.applySternView();
    } else if (this.settledKind === 'check-the-back.fish') {
      this.applySternView();
      this.fish.visible = true;
      this.fish.rotation.z = -0.12;
    } else if (this.settledKind === 'check-the-back.empty') {
      this.applySternView();
      this.fish.visible = false;
    } else if (this.settledKind === 'check-the-back.ignore') {
      this.applySternView();
    }
  }

  protected prepareAnimation(kind: string): void {
    this.fish.visible = kind === 'check-the-back.fish';
  }

  protected applyAnimation(kind: string, _time: number, progress: number): void {
    this.placeSubjectInsideStern();
    if (kind === 'reveal') {
      const turn = smoothstep(progress / 0.78);
      const lookDown = smoothstep((progress - 0.58) / 0.42);
      this.cameraLook.apply(
        turn * STERN_YAW,
        lookDown * STERN_LOOK_DOWN_PITCH,
      );
      return;
    }
    if (kind === 'check-the-back.ignore') {
      this.applySternView();
      return;
    }
    this.applySternView();
    if (kind === 'check-the-back.fish') {
      this.fish.rotation.z = Math.sin(progress * Math.PI * 5) * (1 - progress) * 0.7;
      this.fish.position.y = Math.sin(progress * Math.PI) * 0.2;
    } else if (kind === 'check-the-back.empty') {
      this.fish.visible = false;
    }
  }

  protected reactionDuration(kind: EventPresentationKey): number {
    return kind === 'check-the-back.fish' || kind === 'check-the-back.empty'
      ? 1.8
      : super.reactionDuration(kind);
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
