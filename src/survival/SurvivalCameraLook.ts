import { Euler, PerspectiveCamera, Quaternion } from 'three';

const LOOK_SENSITIVITY = 0.0025;
const MAX_PITCH = Math.PI * 0.38;
const RETURN_SPEED = 8;
const SETTLED_EPSILON = 0.0001;

export class SurvivalCameraLook {
  private readonly baseQuaternion = new Quaternion();
  private readonly lookQuaternion = new Quaternion();
  private readonly lookEuler = new Euler(0, 0, 0, 'YXZ');
  private activePointerId: number | null = null;
  private yaw = 0;
  private pitch = 0;
  private disposed = false;

  constructor(
    private readonly mount: HTMLElement,
    private readonly camera: PerspectiveCamera,
  ) {
    mount.addEventListener('contextmenu', this.onContextMenu);
    mount.addEventListener('pointerdown', this.onPointerDown, true);
    window.addEventListener('pointermove', this.onPointerMove, true);
    window.addEventListener('pointerup', this.onPointerUp, true);
    window.addEventListener('pointercancel', this.onPointerCancel, true);
    window.addEventListener('blur', this.release);
  }

  update(deltaSeconds: number): void {
    if (this.disposed || deltaSeconds <= 0) return;
    if (this.activePointerId === null) {
      const blend = 1 - Math.exp(-RETURN_SPEED * deltaSeconds);
      this.yaw += (0 - this.yaw) * blend;
      this.pitch += (0 - this.pitch) * blend;
      if (Math.abs(this.yaw) < SETTLED_EPSILON) this.yaw = 0;
      if (Math.abs(this.pitch) < SETTLED_EPSILON) this.pitch = 0;
    }

    this.baseQuaternion.copy(this.camera.quaternion);
    this.lookEuler.set(this.pitch, this.yaw, 0);
    this.lookQuaternion.setFromEuler(this.lookEuler);
    this.camera.quaternion.copy(this.baseQuaternion).multiply(this.lookQuaternion);
  }

  cancel(): void {
    this.release();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.release();
    this.mount.removeEventListener('contextmenu', this.onContextMenu);
    this.mount.removeEventListener('pointerdown', this.onPointerDown, true);
    window.removeEventListener('pointermove', this.onPointerMove, true);
    window.removeEventListener('pointerup', this.onPointerUp, true);
    window.removeEventListener('pointercancel', this.onPointerCancel, true);
    window.removeEventListener('blur', this.release);
  }

  private readonly onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 2 || this.activePointerId !== null) return;
    event.preventDefault();
    this.activePointerId = event.pointerId;
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.activePointerId) return;
    this.yaw -= event.movementX * LOOK_SENSITIVITY;
    this.pitch = Math.max(
      -MAX_PITCH,
      Math.min(MAX_PITCH, this.pitch - event.movementY * LOOK_SENSITIVITY),
    );
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.button === 2 && event.pointerId === this.activePointerId) this.release();
  };

  private readonly onPointerCancel = (event: PointerEvent): void => {
    if (event.pointerId === this.activePointerId) this.release();
  };

  private readonly release = (): void => {
    this.activePointerId = null;
  };
}
