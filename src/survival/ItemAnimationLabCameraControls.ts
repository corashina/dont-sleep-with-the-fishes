const LOOK_SENSITIVITY = 0.0025;
const MAX_PITCH = Math.PI * 0.47;

export type ItemAnimationLabCameraLook = (
  yaw: number,
  pitch: number,
) => void;

export class ItemAnimationLabCameraControls {
  private yaw = 0;
  private pitch = 0;
  private dragging = false;
  private enabled = true;
  private disposed = false;
  private readonly view: Window;

  constructor(
    private readonly element: HTMLElement,
    private readonly setLook: ItemAnimationLabCameraLook,
    view?: Window,
  ) {
    const resolvedView = view ?? element.ownerDocument.defaultView;
    if (resolvedView === null) {
      throw new Error('Item Animation Lab needs a browser window.');
    }
    this.view = resolvedView;
    element.addEventListener('mousedown', this.handleMouseDown);
    element.addEventListener('contextmenu', this.handleContextMenu);
    resolvedView.addEventListener('mousemove', this.handleMouseMove);
    resolvedView.addEventListener('mouseup', this.handleMouseUp);
    resolvedView.addEventListener('blur', this.stopDragging);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.dragging = false;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.dragging = false;
    this.element.removeEventListener('mousedown', this.handleMouseDown);
    this.element.removeEventListener('contextmenu', this.handleContextMenu);
    this.view.removeEventListener('mousemove', this.handleMouseMove);
    this.view.removeEventListener('mouseup', this.handleMouseUp);
    this.view.removeEventListener('blur', this.stopDragging);
  }

  private readonly handleMouseDown = (event: MouseEvent): void => {
    if (!this.enabled || event.button !== 2) return;
    this.dragging = true;
    event.preventDefault();
  };

  private readonly handleMouseMove = (event: MouseEvent): void => {
    if (!this.enabled || !this.dragging) return;
    this.yaw -= event.movementX * LOOK_SENSITIVITY;
    this.pitch = Math.max(
      -MAX_PITCH,
      Math.min(MAX_PITCH, this.pitch - event.movementY * LOOK_SENSITIVITY),
    );
    this.setLook(this.yaw, this.pitch);
  };

  private readonly handleMouseUp = (event: MouseEvent): void => {
    if (event.button === 2) this.dragging = false;
  };

  private readonly handleContextMenu = (event: MouseEvent): void => {
    if (this.enabled) event.preventDefault();
  };

  private readonly stopDragging = (): void => {
    this.dragging = false;
  };
}
