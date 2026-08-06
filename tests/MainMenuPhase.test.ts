// @vitest-environment jsdom
import { PerspectiveCamera, type Scene } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { MainMenuPhase } from '../src/phases/MainMenuPhase';

function createRig(
  requestPointerLock = vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
) {
  const onComplete = vi.fn();
  const canvas = document.createElement('canvas');
  const ui = {
    onStart: () => undefined,
    onGuideFocusChange: (_focused: boolean) => undefined,
    setTransitioning: vi.fn(),
    setFadeProgress: vi.fn(),
    clearPointerLockError: vi.fn(),
    showPointerLockError: vi.fn(),
    openGuide: vi.fn(),
    dispose: vi.fn(),
  };
  const world = {
    actors: {},
    isGuideSignHit: vi.fn(() => false),
    setGuideSignHighlighted: vi.fn(),
    dispose: vi.fn(),
  };
  const animator = { update: vi.fn(), dispose: vi.fn() };
  const sceneRenderer = {
    render: vi.fn(),
    resize: vi.fn(),
    dispose: vi.fn(),
  };
  const camera = new PerspectiveCamera();
  const dependencies = {
    createUI: vi.fn(() => ui),
    createWorld: vi.fn((_scene: Scene) => world),
    createAnimator: vi.fn(() => animator),
    requestPointerLock,
  };
  const context = {
    mount: document.createElement('main'),
    renderer: { domElement: canvas },
    camera,
    sceneRenderer,
    menuModels: {},
  } as never;
  const phase = new MainMenuPhase(context, onComplete, dependencies as never);
  return {
    animator,
    camera,
    canvas,
    dependencies,
    onComplete,
    phase,
    requestPointerLock,
    sceneRenderer,
    ui,
    world,
  };
}

describe('MainMenuPhase', () => {
  it('keeps rendering until pointer lock succeeds and fade completes', async () => {
    const { onComplete, phase, ui } = createRig();

    phase.start();
    ui.onStart();
    await Promise.resolve();
    phase.update(0, 0.69);
    expect(onComplete).not.toHaveBeenCalled();
    phase.update(0, 0.01);
    expect(onComplete).toHaveBeenCalledOnce();
    phase.update(0, 1);
    expect(onComplete).toHaveBeenCalledOnce();
    phase.dispose();
  });

  it('keeps the menu active after pointer-lock rejection and supports retry', async () => {
    const requestPointerLock = vi.fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('blocked'))
      .mockResolvedValueOnce(undefined);
    const { onComplete, phase, ui } = createRig(requestPointerLock);

    phase.start();
    ui.onStart();
    await Promise.resolve();
    await Promise.resolve();

    expect(ui.clearPointerLockError).toHaveBeenCalledOnce();
    expect(ui.showPointerLockError).toHaveBeenCalledOnce();
    expect(ui.setTransitioning).not.toHaveBeenCalledWith(true);
    phase.update(0, 1);
    expect(onComplete).not.toHaveBeenCalled();

    ui.onStart();
    await Promise.resolve();
    expect(requestPointerLock).toHaveBeenCalledTimes(2);
    expect(ui.clearPointerLockError).toHaveBeenCalledTimes(3);
    expect(ui.setTransitioning).toHaveBeenCalledWith(true);
    phase.dispose();
  });

  it('ignores repeat start input after the transition begins', async () => {
    const { phase, requestPointerLock, ui } = createRig();

    phase.start();
    ui.onStart();
    await Promise.resolve();
    ui.onStart();

    expect(requestPointerLock).toHaveBeenCalledOnce();
    expect(ui.setTransitioning).toHaveBeenCalledTimes(2);
    expect(ui.setTransitioning).toHaveBeenLastCalledWith(true);
    expect(ui.setFadeProgress).toHaveBeenLastCalledWith(0);
    phase.dispose();
  });

  it('cancels the fade when pointer lock is lost and permits another attempt', async () => {
    const originalPointerLockElement = Object.getOwnPropertyDescriptor(
      document,
      'pointerLockElement',
    );
    const { canvas, onComplete, phase, requestPointerLock, ui } = createRig();

    try {
      Object.defineProperty(document, 'pointerLockElement', {
        configurable: true,
        value: canvas,
      });
      phase.start();
      ui.onStart();
      await Promise.resolve();
      phase.update(0, 0.4);

      Object.defineProperty(document, 'pointerLockElement', {
        configurable: true,
        value: null,
      });
      document.dispatchEvent(new Event('pointerlockchange'));
      phase.update(0, 0.7);

      expect(onComplete).not.toHaveBeenCalled();
      expect(ui.setTransitioning).toHaveBeenLastCalledWith(false);
      expect(ui.setFadeProgress).toHaveBeenLastCalledWith(0);
      expect(ui.showPointerLockError).toHaveBeenCalledOnce();

      Object.defineProperty(document, 'pointerLockElement', {
        configurable: true,
        value: canvas,
      });
      ui.onStart();
      await Promise.resolve();
      phase.update(0, 0.7);

      expect(requestPointerLock).toHaveBeenCalledTimes(2);
      expect(onComplete).toHaveBeenCalledOnce();
    } finally {
      phase.dispose();
      if (originalPointerLockElement) {
        Object.defineProperty(
          document,
          'pointerLockElement',
          originalPointerLockElement,
        );
      } else {
        delete (document as { pointerLockElement?: Element | null })
          .pointerLockElement;
      }
    }
  });

  it('allows only one pointer-lock request before the request settles', async () => {
    let resolvePointerLock!: () => void;
    const requestPointerLock = vi.fn(() => new Promise<void>((resolve) => {
      resolvePointerLock = resolve;
    }));
    const { phase, ui } = createRig(requestPointerLock);

    phase.start();
    ui.onStart();
    ui.onStart();

    expect(requestPointerLock).toHaveBeenCalledOnce();
    expect(ui.clearPointerLockError).toHaveBeenCalledOnce();
    expect(ui.setTransitioning).not.toHaveBeenCalledWith(true);

    resolvePointerLock();
    await Promise.resolve();

    expect(ui.setTransitioning).toHaveBeenCalledWith(true);
    expect(ui.showPointerLockError).not.toHaveBeenCalled();
    phase.dispose();
  });

  it('animates and renders the menu visual state without moving the camera', () => {
    const { animator, camera, phase, sceneRenderer } = createRig();
    const position = camera.position.clone();
    const quaternion = camera.quaternion.clone();

    phase.start();
    phase.update(20, 0.25);
    phase.render();

    expect(animator.update).toHaveBeenCalledWith(0.25, 0.25);
    expect(sceneRenderer.render).toHaveBeenCalledWith(
      expect.anything(),
      camera,
      { kind: 'menu', elapsedSeconds: 0.25 },
    );
    expect(camera.position.equals(position)).toBe(true);
    expect(camera.quaternion.equals(quaternion)).toBe(true);
    phase.dispose();
  });

  it('updates the shared camera projection on resize', () => {
    const { camera, phase } = createRig();
    const updateProjectionMatrix = vi.spyOn(camera, 'updateProjectionMatrix');

    phase.resize(1200, 600);

    expect(camera.aspect).toBe(2);
    expect(updateProjectionMatrix).toHaveBeenCalledOnce();
    phase.dispose();
  });

  it('highlights and opens the 3D guide sign with pointer or keyboard', () => {
    const { canvas, phase, ui, world } = createRig();
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      left: 10,
      top: 20,
      right: 210,
      bottom: 120,
      width: 200,
      height: 100,
      x: 10,
      y: 20,
      toJSON: () => undefined,
    } as DOMRect);
    world.isGuideSignHit.mockReturnValue(true);
    phase.start();

    canvas.dispatchEvent(new MouseEvent('pointermove', {
      clientX: 110,
      clientY: 70,
      bubbles: true,
    }));
    expect(world.isGuideSignHit).toHaveBeenLastCalledWith(0, 0);
    expect(world.setGuideSignHighlighted).toHaveBeenLastCalledWith(true);
    expect(canvas.style.cursor).toBe('pointer');

    canvas.dispatchEvent(new MouseEvent('click', {
      button: 0,
      clientX: 110,
      clientY: 70,
      bubbles: true,
    }));
    expect(ui.openGuide).toHaveBeenCalledOnce();

    canvas.dispatchEvent(new MouseEvent('pointerleave'));
    expect(world.setGuideSignHighlighted).toHaveBeenLastCalledWith(false);
    ui.onGuideFocusChange(true);
    expect(world.setGuideSignHighlighted).toHaveBeenLastCalledWith(true);
    ui.onGuideFocusChange(false);
    expect(world.setGuideSignHighlighted).toHaveBeenLastCalledWith(false);
    phase.dispose();
  });

  it('clears callbacks and disposes each owned resource once', async () => {
    let resolvePointerLock!: () => void;
    const requestPointerLock = vi.fn(() => new Promise<void>((resolve) => {
      resolvePointerLock = resolve;
    }));
    const { animator, onComplete, phase, ui, world } = createRig(requestPointerLock);

    phase.start();
    ui.onStart();
    phase.dispose();
    phase.dispose();
    ui.onStart();
    resolvePointerLock();
    await Promise.resolve();

    expect(animator.dispose).toHaveBeenCalledOnce();
    expect(world.dispose).toHaveBeenCalledOnce();
    expect(ui.dispose).toHaveBeenCalledOnce();
    expect(onComplete).not.toHaveBeenCalled();
    expect(ui.showPointerLockError).not.toHaveBeenCalled();
  });

  it('runs all disposal steps and preserves the first disposal error', () => {
    const firstError = new Error('animator disposal failed');
    const secondError = new Error('world disposal failed');
    const { animator, camera, dependencies, phase, ui, world } = createRig();
    const menuScene = dependencies.createWorld.mock.calls[0]![0] as Scene;
    menuScene.add(new PerspectiveCamera());
    animator.dispose.mockImplementation(() => {
      throw firstError;
    });
    world.dispose.mockImplementation(() => {
      throw secondError;
    });

    expect(() => phase.dispose()).toThrow(firstError);

    expect(animator.dispose).toHaveBeenCalledOnce();
    expect(world.dispose).toHaveBeenCalledOnce();
    expect(ui.dispose).toHaveBeenCalledOnce();
    expect(menuScene.children).not.toContain(camera);
    expect(menuScene.children).toHaveLength(0);
  });

  it('releases pointer lock acquired after disposal', async () => {
    const originalExitPointerLock = Object.getOwnPropertyDescriptor(
      document,
      'exitPointerLock',
    );
    const originalPointerLockElement = Object.getOwnPropertyDescriptor(
      document,
      'pointerLockElement',
    );
    let resolvePointerLock!: () => void;
    const requestPointerLock = vi.fn(() => new Promise<void>((resolve) => {
      resolvePointerLock = resolve;
    }));
    const exitPointerLock = vi.fn();
    const { canvas, phase, ui } = createRig(requestPointerLock);

    try {
      Object.defineProperty(document, 'exitPointerLock', {
        configurable: true,
        value: exitPointerLock,
      });
      Object.defineProperty(document, 'pointerLockElement', {
        configurable: true,
        value: null,
      });
      phase.start();
      ui.onStart();
      phase.dispose();
      Object.defineProperty(document, 'pointerLockElement', {
        configurable: true,
        value: canvas,
      });

      resolvePointerLock();
      await Promise.resolve();

      expect(exitPointerLock).toHaveBeenCalledOnce();
    } finally {
      if (originalExitPointerLock) {
        Object.defineProperty(
          document,
          'exitPointerLock',
          originalExitPointerLock,
        );
      } else {
        delete (document as { exitPointerLock?: () => void }).exitPointerLock;
      }
      if (originalPointerLockElement) {
        Object.defineProperty(
          document,
          'pointerLockElement',
          originalPointerLockElement,
        );
      } else {
        delete (document as { pointerLockElement?: Element | null })
          .pointerLockElement;
      }
    }
  });

  it('cleans completed construction steps when animator creation fails', () => {
    const camera = new PerspectiveCamera();
    const ui = {
      onStart: () => undefined,
      onGuideFocusChange: (_focused: boolean) => undefined,
      dispose: vi.fn(),
    };
    const world = {
      actors: {},
      isGuideSignHit: vi.fn(() => false),
      setGuideSignHighlighted: vi.fn(),
      dispose: vi.fn(),
    };
    let menuScene!: Scene;
    const context = {
      mount: document.createElement('main'),
      renderer: { domElement: document.createElement('canvas') },
      camera,
      sceneRenderer: {},
      menuModels: {},
    } as never;
    const dependencies = {
      createUI: vi.fn(() => ui),
      createWorld: vi.fn((scene: Scene) => {
        menuScene = scene;
        return world;
      }),
      createAnimator: vi.fn(() => {
        throw new Error('animator failed');
      }),
      requestPointerLock: vi.fn(),
    };

    expect(() => new MainMenuPhase(
      context,
      vi.fn(),
      dependencies as never,
    )).toThrow('animator failed');

    expect(world.dispose).toHaveBeenCalledOnce();
    expect(ui.dispose).toHaveBeenCalledOnce();
    expect(menuScene.children).not.toContain(camera);
    expect(menuScene.children).toHaveLength(0);
  });
});
