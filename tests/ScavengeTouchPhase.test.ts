// @vitest-environment jsdom
// Importance: 100/100. Rotation and cancelled touch must preserve an existing pause.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScavengeSession } from '../src/game/ScavengeSession';
import { ScavengePhase } from '../src/phases/ScavengePhase';
import { InputController } from '../src/input/InputController';

afterEach(() => {
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.touchControls;
});

function rig(paused = false) {
  const session = new ScavengeSession();
  session.start();
  if (paused) session.pause();
  const input = { clear: vi.fn(), pointerLocked: false };
  const ui = { setPaused: vi.fn(), clearPointerLockError: vi.fn(), setTouchMode: vi.fn() };
  const audio = { setPaused: vi.fn() };
  const controls = { setEnabled: vi.fn(), setPresentation: vi.fn(), isLookSurface: vi.fn(() => false) };
  const phase = Object.create(ScavengePhase.prototype) as ScavengePhase;
  const canvas = document.createElement('canvas');
  Object.assign(phase, {
    session,
    input,
    ui,
    audio,
    hands: { hideAndReset: vi.fn() },
    itemHoverOutline: { setTarget: vi.fn() },
    touchControls: controls,
    touchMode: true,
    mobileSuspended: false,
    overlayActive: false,
    presentation: 'playing',
    ending: { stage: 'playing' },
    disposed: false,
    context: { renderer: { domElement: canvas } },
  });
  return { phase, session, input, ui, audio, controls, canvas };
}

describe('ScavengePhase touch session', () => {
  // Importance: 100/100. A queued action during pause must not run after Resume.
  it('drops Space entered during touch pause before play resumes', () => {
    const { phase, canvas } = rig();
    const input = new InputController(canvas);
    Object.assign(phase, { input });
    const internals = phase as unknown as {
      pauseForTouch(): void;
      resumeTouchSession(): void;
    };
    try {
      internals.pauseForTouch();
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
      internals.resumeTouchSession();
      expect(input.consumeJump()).toBe(false);
    } finally { input.dispose(); }
  });

  // Importance: 100/100. A queued action under the mobile gate must not run after Resume.
  it('drops Space entered under the mobile gate before play resumes', () => {
    const { phase, canvas } = rig();
    const input = new InputController(canvas);
    Object.assign(phase, { input });
    try {
      phase.setMobileSuspended(true);
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
      phase.setMobileSuspended(false);
      expect(input.consumeJump()).toBe(false);
    } finally { input.dispose(); }
  });

  // Importance: 100/100. A queued action under settings must not run after closing settings.
  it('drops Space entered under settings before play resumes', () => {
    const { phase, canvas } = rig();
    const input = new InputController(canvas);
    Object.assign(phase, { input });
    try {
      phase.setOverlayActive(true);
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
      phase.setOverlayActive(false);
      expect(input.consumeJump()).toBe(false);
    } finally { input.dispose(); }
  });

  it('keeps a prior pause through mobile suspension and release', () => {
    const { phase, session, input, ui, controls } = rig(true);
    phase.setMobileSuspended(true);
    expect(input.clear).toHaveBeenCalledOnce();
    expect(controls.setEnabled).toHaveBeenCalledWith(false);
    phase.setMobileSuspended(false);
    expect(session.snapshot().status).toBe('paused');
    expect(ui.setPaused).not.toHaveBeenCalledWith(false);
  });

  it('keeps audio paused when a settings overlay survives rotation', () => {
    const { phase, audio, session } = rig();
    Object.assign(phase, { overlayActive: true });
    phase.setMobileSuspended(true);
    phase.setMobileSuspended(false);
    expect(session.snapshot().status).toBe('running');
    expect(audio.setPaused).toHaveBeenLastCalledWith(true);
  });

  it('lets one global Resume release a hidden touch session', () => {
    const descriptor = Object.getOwnPropertyDescriptor(document, 'hidden');
    const { phase, session, audio } = rig();
    const internals = phase as unknown as { handleVisibilityChange(): void };
    try {
      phase.setMobileSuspended(true);
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      internals.handleVisibilityChange();
      Object.defineProperty(document, 'hidden', { configurable: true, value: false });
      phase.setMobileSuspended(false);
      expect(session.snapshot().status).toBe('running');
      expect(audio.setPaused).toHaveBeenLastCalledWith(false);
    } finally {
      if (descriptor) Object.defineProperty(document, 'hidden', descriptor);
      else Reflect.deleteProperty(document, 'hidden');
    }
  });

  it('blocks active control while suspended and restores it after explicit release', () => {
    const { phase, session } = rig();
    const internals = phase as unknown as {
      hasDirectControl(snapshot: ReturnType<ScavengeSession['snapshot']>): boolean;
    };
    expect(internals.hasDirectControl(session.snapshot())).toBe(true);
    phase.setMobileSuspended(true);
    expect(internals.hasDirectControl(session.snapshot())).toBe(false);
    phase.setMobileSuspended(false);
    expect(internals.hasDirectControl(session.snapshot())).toBe(true);
  });

  it('requires a Resume action after a cancelled touch', () => {
    const { phase, session, input, ui } = rig();
    const internals = phase as unknown as {
      pauseForTouch(): void;
      resumeTouchSession(): void;
      handlePointerLockChange(locked: boolean): void;
    };
    internals.handlePointerLockChange(false);
    expect(session.snapshot().status).toBe('running');
    internals.pauseForTouch();
    expect(session.snapshot().status).toBe('paused');
    expect(input.clear).toHaveBeenCalled();
    expect(ui.setPaused).toHaveBeenCalledWith(true);
    internals.resumeTouchSession();
    expect(session.snapshot().status).toBe('running');
    expect(ui.setPaused).toHaveBeenCalledWith(false);
  });

  it('can switch from touch to mouse capture on a mixed device', () => {
    const { phase, controls, ui, canvas } = rig();
    const requestPointerLock = vi.fn();
    Object.assign(phase, { requestPointerLock });
    const internals = phase as unknown as {
      handlePointerInput(event: PointerEvent): void;
    };
    internals.handlePointerInput({ pointerType: 'mouse', target: canvas } as unknown as PointerEvent);
    expect(controls.setPresentation).toHaveBeenCalledWith('hidden');
    expect(ui.setTouchMode).toHaveBeenCalledWith(false);
    expect(requestPointerLock).toHaveBeenCalledOnce();
  });

  it('keeps touch controls on a coarse device when a mouse is attached', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const { phase, controls, ui, canvas } = rig();
    const requestPointerLock = vi.fn();
    Object.assign(phase, { requestPointerLock });
    const internals = phase as unknown as {
      handlePointerInput(event: PointerEvent): void;
    };
    internals.handlePointerInput({ pointerType: 'mouse', target: canvas } as unknown as PointerEvent);
    expect(controls.setPresentation).not.toHaveBeenCalledWith('hidden');
    expect(ui.setTouchMode).not.toHaveBeenCalledWith(false);
    expect(requestPointerLock).toHaveBeenCalledOnce();
  });
});
