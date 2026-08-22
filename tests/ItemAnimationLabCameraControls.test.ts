// Importance: 8/10. Protects Item Animation Lab free-look input and cleanup.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ItemAnimationLabCameraControls } from '../src/survival/ItemAnimationLabCameraControls';

const controls: ItemAnimationLabCameraControls[] = [];

afterEach(() => {
  controls.splice(0).forEach((control) => control.dispose());
});

function mouse(target: EventTarget, type: string, fields: Record<string, unknown>): Event {
  const event = new Event(type, { cancelable: true });
  Object.entries(fields).forEach(([key, value]) => {
    Object.defineProperty(event, key, { configurable: true, value });
  });
  target.dispatchEvent(event);
  return event;
}

describe('ItemAnimationLabCameraControls', () => {
  it('looks around only while the right mouse button is held', () => {
    const element = new EventTarget() as HTMLElement;
    const view = new EventTarget() as Window;
    const setLook = vi.fn();
    controls.push(new ItemAnimationLabCameraControls(element, setLook, view));

    mouse(view, 'mousemove', { movementX: 20, movementY: -10 });
    expect(setLook).not.toHaveBeenCalled();

    mouse(element, 'mousedown', { button: 2 });
    mouse(view, 'mousemove', { movementX: 20, movementY: -10 });
    expect(setLook).toHaveBeenLastCalledWith(-0.05, 0.025);

    mouse(view, 'mouseup', { button: 2 });
    mouse(view, 'mousemove', { movementX: 20, movementY: -10 });
    expect(setLook).toHaveBeenCalledOnce();
  });

  it('blocks the lab context menu and removes all input on dispose', () => {
    const element = new EventTarget() as HTMLElement;
    const view = new EventTarget() as Window;
    const setLook = vi.fn();
    const control = new ItemAnimationLabCameraControls(element, setLook, view);
    controls.push(control);

    expect(mouse(element, 'contextmenu', {}).defaultPrevented).toBe(true);
    control.dispose();
    mouse(element, 'mousedown', { button: 2 });
    mouse(view, 'mousemove', { movementX: 20, movementY: 20 });

    expect(setLook).not.toHaveBeenCalled();
  });
});
