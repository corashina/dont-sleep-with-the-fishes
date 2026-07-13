// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import type { GamePhase } from '../src/app/GamePhase';
import { Game, type GameTestOptions } from '../src/Game';
import type { ScavengeResult } from '../src/game/ScavengeSession';
import { createTestPropModels } from './helpers/propModels';

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

function testOptions(
  overrides: Omit<GameTestOptions, 'propModels'> = {},
): GameTestOptions {
  return { propModels: createTestPropModels(), ...overrides };
}

describe('Game director', () => {
  it('starts the shared clock and schedules animation only once', () => {
    const startClock = vi.fn();
    const requestAnimationFrame = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(42);
    const game = Game.forTest({
      createScavenge: () => phase(),
      createSurvival: () => phase(),
    }, testOptions({
      clock: { start: startClock, getDelta: () => 0.016 },
    }));

    game.start();
    game.start();

    expect(startClock).toHaveBeenCalledOnce();
    expect(requestAnimationFrame).toHaveBeenCalledOnce();
    requestAnimationFrame.mockRestore();
  });

  it('clamps shared frame delta and renders through the active phase boundary', () => {
    const active = phase();
    const requestAnimationFrame = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(42);
    const game = Game.forTest({
      createScavenge: () => active,
      createSurvival: () => phase(),
    }, testOptions());
    Object.assign(game, { clock: { start: vi.fn(), getDelta: () => 1 } });

    (game as unknown as { handleAnimationFrame: () => void }).handleAnimationFrame();

    expect(active.update).toHaveBeenCalledWith(0.05, 0.05);
    expect(active.render).toHaveBeenCalledOnce();
    requestAnimationFrame.mockRestore();
  });

  it('deep-copies and freezes duplicate saved instances at the phase boundary', () => {
    const calls: string[] = [];
    let complete!: (result: Readonly<ScavengeResult>) => void;
    const scavenge = phase({ dispose: vi.fn(() => calls.push('dispose-scavenge')) });
    const survival = phase({ start: vi.fn(() => calls.push('start-survival')) });
    const sourceItems = [
      { instanceId: 'cannedFood-1', type: 'cannedFood' },
      { instanceId: 'cannedFood-2', type: 'cannedFood' },
    ] as const;
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
    }, testOptions());

    game.start();
    complete(sourceResult);

    expect(calls).toEqual(['dispose-scavenge', 'start-survival']);
    expect(receivedResult).toEqual({
      savedItems: sourceItems,
      elapsedSeconds: 8,
    });
    expect(receivedResult).not.toBe(sourceResult);
    expect(receivedResult?.savedItems).not.toBe(sourceItems);
    expect(Object.isFrozen(receivedResult)).toBe(true);
    expect(Object.isFrozen(receivedResult?.savedItems)).toBe(true);
    expect(receivedResult?.savedItems[0]).not.toBe(sourceItems[0]);
    expect(receivedResult?.savedItems[1]).not.toBe(sourceItems[1]);
    expect(Object.isFrozen(receivedResult?.savedItems[0])).toBe(true);
    expect(Object.isFrozen(receivedResult?.savedItems[1])).toBe(true);
  });

  it('ignores a stale scavenging restart callback after survival takes ownership', () => {
    let complete!: (result: Readonly<ScavengeResult>) => void;
    let restartScavenge!: () => void;
    const scavenge = phase();
    const survival = phase();
    const createScavenge = vi.fn((_context, onComplete, onRestart) => {
      complete = onComplete;
      restartScavenge = onRestart;
      return scavenge;
    });
    const game = Game.forTest({
      createScavenge,
      createSurvival: () => survival,
    }, testOptions());
    game.start();
    complete({ savedItems: [], elapsedSeconds: 4 });

    restartScavenge();

    expect(createScavenge).toHaveBeenCalledOnce();
    expect(survival.dispose).not.toHaveBeenCalled();
    expect((game as unknown as { activePhase: GamePhase }).activePhase).toBe(survival);
  });

  it('keeps a nested restart when survival requests it synchronously during construction', () => {
    let complete!: (result: Readonly<ScavengeResult>) => void;
    const initialScavenge = phase();
    const restartedScavenge = phase();
    const staleSurvival = phase();
    const scavenges = [initialScavenge, restartedScavenge];
    const createScavenge = vi.fn((_context, onComplete) => {
      complete = onComplete;
      return scavenges[createScavenge.mock.calls.length - 1]!;
    });
    const game = Game.forTest({
      createScavenge,
      createSurvival: (_context, _result, _seed, onRestart) => {
        onRestart();
        return staleSurvival;
      },
    }, testOptions());
    game.start();

    complete({ savedItems: [], elapsedSeconds: 5 });

    expect(initialScavenge.dispose).toHaveBeenCalledOnce();
    expect(restartedScavenge.start).toHaveBeenCalledOnce();
    expect(staleSurvival.dispose).toHaveBeenCalledOnce();
    expect(staleSurvival.start).not.toHaveBeenCalled();
    expect((game as unknown as { activePhase: GamePhase }).activePhase).toBe(restartedScavenge);
  });

  it('ignores a phase restart callback fired reentrantly during its disposal', () => {
    let complete!: (result: Readonly<ScavengeResult>) => void;
    let restartSurvival!: () => void;
    const initialScavenge = phase();
    const restartedScavenge = phase();
    const unexpectedScavenge = phase();
    const scavenges = [initialScavenge, restartedScavenge, unexpectedScavenge];
    const createScavenge = vi.fn((_context, onComplete) => {
      complete = onComplete;
      return scavenges[createScavenge.mock.calls.length - 1]!;
    });
    let firedDuringDispose = false;
    const survival = phase({
      dispose: vi.fn(() => {
        if (firedDuringDispose) return;
        firedDuringDispose = true;
        restartSurvival();
      }),
    });
    const game = Game.forTest({
      createScavenge,
      createSurvival: (_context, _result, _seed, onRestart) => {
        restartSurvival = onRestart;
        return survival;
      },
    }, testOptions());
    game.start();
    complete({ savedItems: [], elapsedSeconds: 6 });

    game.restart();

    expect(survival.dispose).toHaveBeenCalledOnce();
    expect(createScavenge).toHaveBeenCalledTimes(2);
    expect(restartedScavenge.start).toHaveBeenCalledOnce();
    expect(unexpectedScavenge.start).not.toHaveBeenCalled();
    expect((game as unknown as { activePhase: GamePhase }).activePhase).toBe(restartedScavenge);
  });

  it('full restart disposes survival before fresh scavenging and refreshes the survival seed', () => {
    const calls: string[] = [];
    const completions: Array<(result: Readonly<ScavengeResult>) => void> = [];
    const firstScavenge = phase();
    const secondScavenge = phase({ start: vi.fn(() => calls.push('start-scavenge-2')) });
    const scavenges = [firstScavenge, secondScavenge];
    const firstSurvival = phase({ dispose: vi.fn(() => calls.push('dispose-survival-1')) });
    const secondSurvival = phase();
    const survivals = [firstSurvival, secondSurvival];
    const receivedSeeds: number[] = [];
    const createScavenge = vi.fn((_context, onComplete: (result: Readonly<ScavengeResult>) => void) => {
      completions.push(onComplete);
      const index = createScavenge.mock.calls.length - 1;
      calls.push(`create-scavenge-${index + 1}`);
      return scavenges[index]!;
    });
    const createSurvival = vi.fn((_context, _result, seed: number) => {
      receivedSeeds.push(seed);
      return survivals[createSurvival.mock.calls.length - 1]!;
    });
    const createSeed = vi.fn()
      .mockReturnValueOnce(11)
      .mockReturnValueOnce(22);
    const game = Game.forTest({
      createScavenge,
      createSurvival,
    }, testOptions({
      createSeed,
    }));
    game.start();
    completions[0]!({ savedItems: [], elapsedSeconds: 3 });
    calls.length = 0;

    game.restart();

    expect(calls).toEqual(['dispose-survival-1', 'create-scavenge-2', 'start-scavenge-2']);
    expect(firstSurvival.dispose).toHaveBeenCalledOnce();
    expect(createScavenge).toHaveBeenCalledTimes(2);
    expect(firstScavenge).not.toBe(secondScavenge);
    completions[1]!({ savedItems: [], elapsedSeconds: 2 });
    expect(receivedSeeds).toEqual([11, 22]);
  });

  it('disposes shared animation, renderer, and canvas resources exactly once', () => {
    const calls: string[] = [];
    const active = phase({ dispose: vi.fn(() => calls.push('dispose-phase')) });
    const propModels = createTestPropModels();
    const disposeModels = propModels.dispose.bind(propModels);
    const disposePropModels = vi.spyOn(propModels, 'dispose')
      .mockImplementation(() => {
        calls.push('dispose-models');
        disposeModels();
      });
    const requestAnimationFrame = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(42);
    const cancelAnimationFrame = vi.spyOn(window, 'cancelAnimationFrame');
    const game = Game.forTest({
      createScavenge: () => active,
      createSurvival: () => phase(),
    }, { propModels });
    const renderer = (game as unknown as {
      renderer: { dispose: () => void; domElement: HTMLCanvasElement };
    }).renderer;
    const disposeRenderer = vi.spyOn(renderer, 'dispose');
    const removeEventListener = vi.spyOn(window, 'removeEventListener');
    expect(renderer.domElement.parentElement).not.toBeNull();
    game.start();

    game.dispose();
    game.dispose();

    expect(cancelAnimationFrame).toHaveBeenCalledOnce();
    expect(active.dispose).toHaveBeenCalledOnce();
    expect(disposePropModels).toHaveBeenCalledOnce();
    expect(calls).toEqual(['dispose-phase', 'dispose-models']);
    expect(disposeRenderer).toHaveBeenCalledOnce();
    expect(renderer.domElement.parentElement).toBeNull();
    expect(removeEventListener).toHaveBeenCalledTimes(1);
    expect(removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
    requestAnimationFrame.mockRestore();
    cancelAnimationFrame.mockRestore();
    removeEventListener.mockRestore();
  });

  it('rolls back acquired construction resources without disposing unowned models', () => {
    const mount = document.createElement('main');
    const canvas = document.createElement('canvas');
    const resizeError = new Error('initial resize failed');
    const renderer = {
      domElement: canvas,
      setPixelRatio: vi.fn(),
      setSize: vi.fn(() => { throw resizeError; }),
      render: vi.fn(),
      dispose: vi.fn(),
    };
    const active = phase();
    const propModels = createTestPropModels();
    const disposeModels = vi.spyOn(propModels, 'dispose');
    const addEventListener = vi.spyOn(window, 'addEventListener');
    const removeEventListener = vi.spyOn(window, 'removeEventListener');

    expect(() => Game.forTest({
      createScavenge: () => active,
      createSurvival: () => phase(),
    }, {
      propModels,
      mount,
      renderer,
    } as unknown as GameTestOptions)).toThrow(resizeError);

    expect(addEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(addEventListener).toHaveBeenCalledOnce();
    expect(removeEventListener).toHaveBeenCalledOnce();
    expect(active.dispose).toHaveBeenCalledOnce();
    expect(renderer.dispose).toHaveBeenCalledOnce();
    expect(canvas.parentElement).toBeNull();
    expect(disposeModels).not.toHaveBeenCalled();

    addEventListener.mockRestore();
    removeEventListener.mockRestore();
  });
});
