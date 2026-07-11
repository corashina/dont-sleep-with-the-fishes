// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import type { GamePhase } from '../src/app/GamePhase';
import { Game } from '../src/Game';
import type { ScavengeResult } from '../src/game/ScavengeSession';

function phase(overrides: Partial<GamePhase> = {}): GamePhase {
  return {
    start: vi.fn(),
    update: vi.fn(),
    resize: vi.fn(),
    render: vi.fn(),
    dispose: vi.fn(),
    ...overrides,
  };
}

describe('Game director', () => {
  it('starts the shared clock and schedules animation only once', () => {
    const requestAnimationFrame = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(42);
    const game = Game.forTest({
      createScavenge: () => phase(),
      createSurvival: () => phase(),
    });

    game.start();
    game.start();

    expect(requestAnimationFrame).toHaveBeenCalledOnce();
    requestAnimationFrame.mockRestore();
  });

  it('clamps shared frame delta and renders through the active phase boundary', () => {
    const active = phase();
    const requestAnimationFrame = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(42);
    const game = Game.forTest({
      createScavenge: () => active,
      createSurvival: () => phase(),
    });
    Object.assign(game, { clock: { start: vi.fn(), getDelta: () => 1 } });

    (game as unknown as { handleAnimationFrame: () => void }).handleAnimationFrame();

    expect(active.update).toHaveBeenCalledWith(0.05, 0.05);
    expect(active.render).toHaveBeenCalledOnce();
    requestAnimationFrame.mockRestore();
  });

  it('disposes scavenging before starting survival with a copied immutable result', () => {
    const calls: string[] = [];
    let complete!: (result: Readonly<ScavengeResult>) => void;
    const scavenge = phase({ dispose: vi.fn(() => calls.push('dispose-scavenge')) });
    const survival = phase({ start: vi.fn(() => calls.push('start-survival')) });
    const sourceItems = ['flareGun'] as const;
    const sourceResult: ScavengeResult = { savedItems: sourceItems, elapsedSeconds: 8 };
    let receivedResult: Readonly<ScavengeResult> | undefined;
    const game = Game.forTest({
      createScavenge: (_context, onComplete) => {
        complete = onComplete;
        return scavenge;
      },
      createSurvival: (_context, result) => {
        receivedResult = result;
        return survival;
      },
    });

    game.start();
    complete(sourceResult);

    expect(calls).toEqual(['dispose-scavenge', 'start-survival']);
    expect(receivedResult).toEqual({ savedItems: ['flareGun'], elapsedSeconds: 8 });
    expect(receivedResult).not.toBe(sourceResult);
    expect(receivedResult?.savedItems).not.toBe(sourceItems);
    expect(Object.isFrozen(receivedResult)).toBe(true);
    expect(Object.isFrozen(receivedResult?.savedItems)).toBe(true);
  });

  it('full restart disposes survival and creates fresh scavenging', () => {
    const scavenge = phase();
    const survival = phase();
    let complete!: (result: Readonly<ScavengeResult>) => void;
    const createScavenge = vi.fn((_context, onComplete: (result: Readonly<ScavengeResult>) => void) => {
      complete = onComplete;
      return scavenge;
    });
    const game = Game.forTest({
      createScavenge,
      createSurvival: vi.fn(() => survival),
    });
    game.start();
    complete({ savedItems: [], elapsedSeconds: 3 });

    game.restart();

    expect(survival.dispose).toHaveBeenCalledOnce();
    expect(createScavenge).toHaveBeenCalledTimes(2);
    expect(scavenge.start).toHaveBeenCalledTimes(2);
  });

  it('disposes shared animation, renderer, and canvas resources exactly once', () => {
    const active = phase();
    const requestAnimationFrame = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(42);
    const cancelAnimationFrame = vi.spyOn(window, 'cancelAnimationFrame');
    const game = Game.forTest({
      createScavenge: () => active,
      createSurvival: () => phase(),
    });
    const renderer = (game as unknown as {
      renderer: { dispose: () => void; domElement: HTMLCanvasElement };
    }).renderer;
    const disposeRenderer = vi.spyOn(renderer, 'dispose');
    expect(renderer.domElement.parentElement).not.toBeNull();
    game.start();

    game.dispose();
    game.dispose();

    expect(cancelAnimationFrame).toHaveBeenCalledOnce();
    expect(active.dispose).toHaveBeenCalledOnce();
    expect(disposeRenderer).toHaveBeenCalledOnce();
    expect(renderer.domElement.parentElement).toBeNull();
    requestAnimationFrame.mockRestore();
    cancelAnimationFrame.mockRestore();
  });
});
