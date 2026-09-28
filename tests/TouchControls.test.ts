// @vitest-environment jsdom
// Importance: 100/100. A cancelled finger must stop the timed run until Resume.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InputController } from '../src/input/InputController';
import { TouchControls } from '../src/input/TouchControls';

const active: TouchControls[] = [];
const inputs: InputController[] = [];

afterEach(() => {
  active.forEach((controls) => controls.dispose());
  inputs.forEach((input) => input.dispose());
  active.length = 0;
  inputs.length = 0;
  document.body.replaceChildren();
});

function press(target: Element, type: string, pointerId: number, x = 0, y = 0): void {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    pointerType: { value: 'touch' },
    clientX: { value: x },
    clientY: { value: y },
  });
  target.dispatchEvent(event);
}

function rig() {
  const mount = document.createElement('main');
  document.body.append(mount);
  const canvas = document.createElement('canvas');
  const input = new InputController(canvas);
  inputs.push(input);
  const interrupted = vi.fn();
  const pause = vi.fn();
  const skipIntro = vi.fn();
  const controls = new TouchControls(mount, input, { interrupted, pause, skipIntro });
  active.push(controls);
  controls.setPresentation('playing');
  const stick = mount.querySelector<HTMLElement>('[data-touch-stick]')!;
  Object.defineProperty(stick, 'getBoundingClientRect', {
    value: () => ({ left: 0, top: 0, width: 112, height: 112 }),
  });
  return { mount, input, controls, interrupted, pause, skipIntro, stick };
}

describe('TouchControls', () => {
  it('moves, looks, and interacts with separate fingers', () => {
    const { mount, input, stick } = rig();
    const look = mount.querySelector('[data-touch-look]')!;
    const interact = mount.querySelector('[data-touch-interact]')!;
    press(stick, 'pointerdown', 1, 56, 56);
    press(look, 'pointerdown', 2, 300, 120);
    press(stick, 'pointermove', 1, 100, 12);
    press(look, 'pointermove', 2, 320, 105);
    press(interact, 'pointerdown', 3);

    expect(input.movement.x).toBeGreaterThan(0);
    expect(input.movement.z).toBeLessThan(0);
    expect(Math.hypot(input.movement.x, input.movement.z)).toBeLessThanOrEqual(1);
    expect(input.consumeLook()).toEqual({ x: 20, y: -15 });
    expect(input.consumeInteract()).toBe(true);
    expect(input.consumeInteract()).toBe(false);

    press(interact, 'pointerdown', 3);
    expect(input.consumeInteract()).toBe(false);
    press(stick, 'pointerup', 1);
    expect(input.movement).toEqual({ x: 0, z: 0 });
  });

  it('clears every input and interrupts once after pointer cancellation', () => {
    const { mount, input, stick, interrupted } = rig();
    const look = mount.querySelector('[data-touch-look]')!;
    const sprint = mount.querySelector('[data-touch-sprint]')!;
    press(stick, 'pointerdown', 1, 100, 12);
    press(look, 'pointerdown', 2, 300, 120);
    press(look, 'pointermove', 2, 315, 125);
    press(sprint, 'pointerdown', 3);
    press(stick, 'pointercancel', 1);
    press(stick, 'lostpointercapture', 1);

    expect(interrupted).toHaveBeenCalledOnce();
    expect(input.movement).toEqual({ x: 0, z: 0 });
    expect(input.sprinting).toBe(false);
    expect(input.consumeLook()).toEqual({ x: 0, y: 0 });
  });

  it('keeps camera dragging separate from an interaction tap', () => {
    const { mount, input } = rig();
    const look = mount.querySelector('[data-touch-look]')!;
    press(look, 'pointerdown', 4, 300, 120);
    press(look, 'pointermove', 4, 350, 110);
    press(look, 'pointerup', 4);
    look.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(input.consumeInteract()).toBe(false);
  });
});
