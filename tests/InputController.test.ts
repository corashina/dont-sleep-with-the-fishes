import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InputController } from '../src/input/InputController';

interface TestDocument {
  pointerLockElement: Element | null;
}

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');

let browserWindow: EventTarget;
let browserDocument: TestDocument;
let inputs: InputController[];

function dispatch(type: string, fields: Record<string, unknown> = {}): void {
  const event = new Event(type);
  Object.entries(fields).forEach(([key, value]) => {
    Object.defineProperty(event, key, { configurable: true, value });
  });
  browserWindow.dispatchEvent(event);
}

function createInput(): { canvas: HTMLCanvasElement; input: InputController; requestPointerLock: ReturnType<typeof vi.fn> } {
  const requestPointerLock = vi.fn();
  const canvas = { requestPointerLock } as unknown as HTMLCanvasElement;
  const input = new InputController(canvas);
  inputs.push(input);
  return { canvas, input, requestPointerLock };
}

beforeEach(() => {
  browserWindow = new EventTarget();
  browserDocument = { pointerLockElement: null };
  inputs = [];
  Object.defineProperty(globalThis, 'window', { configurable: true, value: browserWindow });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: browserDocument });
});

afterEach(() => {
  inputs.forEach((input) => input.dispose());
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
  else Reflect.deleteProperty(globalThis, 'window');
  if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
  else Reflect.deleteProperty(globalThis, 'document');
});

describe('InputController', () => {
  it('tracks normalized movement and sprint state, then clears them on blur', () => {
    const { input } = createInput();

    dispatch('keydown', { code: 'KeyW', repeat: false });
    dispatch('keydown', { code: 'KeyD', repeat: false });
    dispatch('keydown', { code: 'ShiftLeft', repeat: false });

    expect(Math.hypot(input.movement.x, input.movement.z)).toBeCloseTo(1);
    expect(input.sprinting).toBe(true);

    dispatch('blur');

    expect(input.movement).toEqual({ x: 0, z: 0 });
    expect(input.sprinting).toBe(false);
  });

  it('only accumulates mouse look while its canvas owns pointer lock', () => {
    const { canvas, input, requestPointerLock } = createInput();

    dispatch('mousemove', { movementX: 9, movementY: -4 });
    expect(input.consumeLook()).toEqual({ x: 0, y: 0 });

    browserDocument.pointerLockElement = canvas;
    expect(input.pointerLocked).toBe(true);
    dispatch('mousemove', { movementX: 9, movementY: -4 });
    dispatch('mousemove', { movementX: -2, movementY: 1 });
    expect(input.consumeLook()).toEqual({ x: 7, y: -3 });
    expect(input.consumeLook()).toEqual({ x: 0, y: 0 });

    input.requestPointerLock();
    expect(requestPointerLock).toHaveBeenCalledOnce();
  });

  it('queues interaction on the non-repeating KeyE edge', () => {
    const { input } = createInput();

    dispatch('keydown', { code: 'KeyE', repeat: false });
    expect(input.consumeInteract()).toBe(true);
    expect(input.consumeInteract()).toBe(false);

    dispatch('keydown', { code: 'KeyE', repeat: true });
    expect(input.consumeInteract()).toBe(false);
  });

  it('removes all event listeners when disposed', () => {
    const { canvas, input } = createInput();
    browserDocument.pointerLockElement = canvas;

    input.dispose();
    input.dispose();
    dispatch('keydown', { code: 'KeyW', repeat: false });
    dispatch('mousemove', { movementX: 5, movementY: 6 });

    expect(input.movement).toEqual({ x: 0, z: 0 });
    expect(input.consumeLook()).toEqual({ x: 0, y: 0 });
  });
});
