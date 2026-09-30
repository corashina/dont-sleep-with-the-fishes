import { type PerspectiveCamera, Vector2, Vector3 } from 'three';
import { MENU_CAMERA_POSITION, MENU_CAMERA_TARGET } from './MenuSceneLayout';

const PARALLAX_POSITION = [0.28, 0.12] as const;
const PARALLAX_TARGET = [0.75, 0.35] as const;
const POINTER_RESPONSE = 1.8;

// The camera rests on the seabed, breathes, and follows the pointer a little.
export class MenuCameraRig {
  private readonly pointer = new Vector2();
  private readonly smoothedPointer = new Vector2();
  private readonly position = new Vector3();
  private readonly target = new Vector3();

  constructor(private readonly camera: PerspectiveCamera) {
    this.update(0, 0);
  }

  setPointer(ndcX: number, ndcY: number): void {
    this.pointer.set(
      Math.min(1, Math.max(-1, ndcX)),
      Math.min(1, Math.max(-1, ndcY)),
    );
  }

  update(elapsedSeconds: number, deltaSeconds: number): void {
    const follow = 1 - Math.exp(-POINTER_RESPONSE * deltaSeconds);
    this.smoothedPointer.lerp(this.pointer, follow);
    const swayX = Math.sin(elapsedSeconds * 0.23) * 0.13 + Math.sin(elapsedSeconds * 0.11 + 1.4) * 0.07;
    const swayY = Math.sin(elapsedSeconds * 0.31 + 0.6) * 0.06;
    const pointerX = this.smoothedPointer.x;
    const pointerY = this.smoothedPointer.y;
    this.position.set(
      MENU_CAMERA_POSITION[0] + swayX + pointerX * PARALLAX_POSITION[0],
      MENU_CAMERA_POSITION[1] + swayY + pointerY * PARALLAX_POSITION[1],
      MENU_CAMERA_POSITION[2],
    );
    this.target.set(
      MENU_CAMERA_TARGET[0] + swayX * 0.4 + pointerX * PARALLAX_TARGET[0],
      MENU_CAMERA_TARGET[1] + pointerY * PARALLAX_TARGET[1],
      MENU_CAMERA_TARGET[2],
    );
    this.camera.position.copy(this.position);
    this.camera.lookAt(this.target);
    this.camera.rotateZ(Math.sin(elapsedSeconds * 0.19) * 0.006);
    this.camera.updateMatrixWorld();
  }
}
