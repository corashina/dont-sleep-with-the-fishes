// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { Box3, Group } from 'three';
import { Game } from '../src/Game';
import { GameLifecycle } from '../src/game/GameLoop';
import { ScavengeSession } from '../src/game/ScavengeSession';

describe('Game disposal integration', () => {
  it('starts the clock and schedules animation only once', () => {
    const startClock = vi.fn();
    const requestAnimationFrame = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(42);
    const game = Object.create(Game.prototype) as Game;
    Object.assign(game, {
      lifecycle: new GameLifecycle(),
      clock: { start: startClock },
      animate: vi.fn(),
      animationFrame: 0,
    });

    game.start();
    game.start();

    expect(startClock).toHaveBeenCalledOnce();
    expect(requestAnimationFrame).toHaveBeenCalledOnce();
    requestAnimationFrame.mockRestore();
  });

  it('exits an owned lock, resets carry, tears down every subsystem, and removes the canvas once', () => {
    const canvas = document.createElement('canvas');
    document.body.append(canvas);
    const exitPointerLock = vi.fn();
    Object.defineProperty(document, 'exitPointerLock', {
      configurable: true,
      value: exitPointerLock,
    });
    const resetCarry = vi.fn();
    const disposeInput = vi.fn();
    const disposeInteraction = vi.fn();
    const disposeWorld = vi.fn();
    const disposeUI = vi.fn();
    const disposeRenderer = vi.fn();
    const game = Object.create(Game.prototype) as Game;
    Object.assign(game, {
      animationFrame: 123,
      lifecycle: new GameLifecycle(),
      input: { pointerLocked: true, dispose: disposeInput },
      carry: { reset: resetCarry },
      interaction: { dispose: disposeInteraction },
      world: { dispose: disposeWorld },
      ui: { dispose: disposeUI },
      renderer: { dispose: disposeRenderer, domElement: canvas },
      onResize: vi.fn(),
      onPointerLockChange: vi.fn(),
      onVisibilityChange: vi.fn(),
    });

    game.dispose();
    game.dispose();

    expect(exitPointerLock).toHaveBeenCalledOnce();
    expect(resetCarry).toHaveBeenCalledOnce();
    expect(disposeInput).toHaveBeenCalledOnce();
    expect(disposeInteraction).toHaveBeenCalledOnce();
    expect(disposeWorld).toHaveBeenCalledOnce();
    expect(disposeUI).toHaveBeenCalledOnce();
    expect(disposeRenderer).toHaveBeenCalledOnce();
    expect(canvas.isConnected).toBe(false);
  });

  it('does not mutate world item state when a stale flight callback is rejected by the session', () => {
    const session = new ScavengeSession();
    session.start();
    session.pickUp('flareGun');
    session.pause();
    const loseItem = vi.fn();
    const carryUpdate = vi.fn((
      _delta: number,
      _acceptance: Box3,
      _waterHeight: (x: number, z: number) => number,
      handlers: { onLost: (id: 'flareGun') => void },
    ) => handlers.onLost('flareGun'));
    const game = Object.create(Game.prototype) as Game;
    Object.assign(game, {
      elapsed: 0,
      session,
      carry: { update: carryUpdate },
      world: {
        lifeboat: new Group(),
        lifeboatAcceptance: new Box3(),
        loseItem,
      },
    });

    (game as unknown as { updateFlight: (delta: number, scale: number) => void })
      .updateFlight(0.016, 1);

    expect(session.snapshot().carriedItem).toBe('flareGun');
    expect(loseItem).not.toHaveBeenCalled();
  });

  it('reports pointer-lock rejection through the UI', async () => {
    const showPointerLockError = vi.fn();
    const game = Object.create(Game.prototype) as Game;
    Object.assign(game, {
      lifecycle: new GameLifecycle(),
      input: { requestPointerLock: vi.fn().mockResolvedValue(false) },
      ui: { showPointerLockError },
    });

    await (game as unknown as { requestPointerLock: () => Promise<void> }).requestPointerLock();

    expect(showPointerLockError).toHaveBeenCalledOnce();
  });
});
