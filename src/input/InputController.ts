import { movementAxes, type MovementAxes } from '../player/collisions';

export class InputController {
  private readonly pressed = new Set<string>();
  private lookX = 0;
  private lookY = 0;
  private interactQueued = false;
  private jumpQueued = false;
  private disposed = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('blur', this.clear);
  }

  get movement(): MovementAxes {
    return movementAxes(this.pressed);
  }

  get sprinting(): boolean {
    return this.pressed.has('ShiftLeft') || this.pressed.has('ShiftRight');
  }

  get pointerLocked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  async requestPointerLock(): Promise<boolean> {
    try {
      await this.canvas.requestPointerLock();
      return true;
    } catch {
      return false;
    }
  }

  consumeLook(): { x: number; y: number } {
    const look = { x: this.lookX, y: this.lookY };
    this.lookX = 0;
    this.lookY = 0;
    return look;
  }

  consumeInteract(): boolean {
    const queued = this.interactQueued;
    this.interactQueued = false;
    return queued;
  }

  consumeJump(): boolean {
    const queued = this.jumpQueued;
    this.jumpQueued = false;
    return queued;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clear();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('blur', this.clear);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    this.pressed.add(event.code);
    if (event.code === 'Space') {
      if (this.pointerLocked) event.preventDefault();
      if (!event.repeat) this.jumpQueued = true;
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.pressed.delete(event.code);
    if (event.code === 'Space' && this.pointerLocked) event.preventDefault();
  };

  private readonly onMouseDown = (event: MouseEvent): void => {
    if (event.button === 0 && this.pointerLocked) this.interactQueued = true;
  };

  private readonly onMouseMove = (event: MouseEvent): void => {
    if (!this.pointerLocked) return;
    this.lookX += event.movementX;
    this.lookY += event.movementY;
  };

  private readonly clear = (): void => {
    this.pressed.clear();
    this.lookX = 0;
    this.lookY = 0;
    this.interactQueued = false;
    this.jumpQueued = false;
  };
}
