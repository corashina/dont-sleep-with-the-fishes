// @vitest-environment jsdom
import { PerspectiveCamera } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { MainMenuPhase } from '../src/phases/MainMenuPhase';

function createRig(
  requestPointerLock = vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
) {
  const onComplete = vi.fn();
  const canvas = document.createElement('canvas');
  const ui = {
    onStart: () => undefined,
    setTransitioning: vi.fn(),
    setFadeProgress: vi.fn(),
    clearPointerLockError: vi.fn(),
    showPointerLockError: vi.fn(),
    dispose: vi.fn(),
  };
  const world = { actors: {}, dispose: vi.fn() };
  const animator = { update: vi.fn(), dispose: vi.fn() };
  const sceneRenderer = {
    render: vi.fn(),
    resize: vi.fn(),
    dispose: vi.fn(),
  };
  const camera = new PerspectiveCamera();
  const dependencies = {
    createUI: vi.fn(() => ui),
    createWorld: vi.fn(() => world),
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
    expect(ui.clearPointerLockError).toHaveBeenCalledTimes(2);
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
});
