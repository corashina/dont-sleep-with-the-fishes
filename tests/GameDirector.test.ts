// @vitest-environment jsdom
import { createTestGame, flushPhases, type GameFixtureOptions } from './helpers/game';
// Importance: 10/10 (scaled from 5/5). Protects phase lifecycle and ownership.

import { describe, expect, it, vi } from 'vitest';
import type { GamePhase, PhaseContext } from '../src/app/GamePhase';
import { Game } from '../src/Game';
import type { ScavengeResult } from '../src/game/ScavengeSession';
import type { MenuModelLibrary } from '../src/menu/MenuModelLibrary';
import type { SurvivalPhaseStart } from '../src/survival/SurvivalPhase';
import type { SurvivalSaveStorage } from '../src/browser/SurvivalSaveStore';
import { testPhysicsRuntime } from './helpers/physics';
import { createTestPropModels } from './helpers/propModels';
import { createTestShipFurniture } from './helpers/shipFurniture';
import { createTestSkyAssets } from './helpers/skyAssets';

const physicsRuntime = await testPhysicsRuntime();
const EMPTY_MENU_MODELS = {
  dispose: () => undefined,
} as unknown as MenuModelLibrary;

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

function createImmediateMenu(
  _context: PhaseContext,
  onComplete: () => void,
): GamePhase {
  onComplete();
  return phase();
}

function testOptions(
  overrides: Omit<
    GameFixtureOptions,
    'propModels' | 'menuModels' | 'shipFurniture' | 'skyAssets' | 'physicsRuntime'
  > = {},
): GameFixtureOptions {
  return {
    propModels: createTestPropModels(),
    menuModels: EMPTY_MENU_MODELS,
    shipFurniture: createTestShipFurniture(),
    skyAssets: createTestSkyAssets(),
    physicsRuntime,
    ...overrides,
  };
}

describe('Game director', () => {
  it('starts the shared clock and schedules animation only once', async () => {
    const startClock = vi.fn();
    const requestAnimationFrame = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(42);
    const game = createTestGame({
      createMenu: createImmediateMenu,
      createScavenge: () => phase(),
      createSurvival: () => phase(),
    }, testOptions({
      clock: { start: startClock, getDelta: () => 0.016 },
    }));
    await flushPhases();

    game.start();
    await flushPhases();
    game.start();
    await flushPhases();

    expect(startClock).toHaveBeenCalledOnce();
    expect(requestAnimationFrame).toHaveBeenCalledOnce();
    requestAnimationFrame.mockRestore();

  });

  it('starts browser playtests in survival without accessing saves', async () => {
    const browserPlaytest = {
      seed: 42,
      missingItemIds: ['map-1', 'knife-1'],
      savedItems: [{ instanceId: 'carlitos-1', type: 'carlitos' }],
    } as const;
    const saveStorage: SurvivalSaveStorage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    const createSeed = vi.fn(() => 99);
    const survival = phase();
    const factories = {
      createMenu: vi.fn(() => phase()),
      createScavenge: vi.fn(() => phase()),
      createSurvival: vi.fn(() => survival),
    };

    const game = createTestGame(factories, testOptions({
      browserPlaytest,
      saveStorage,
      createSeed,
    }));
    await flushPhases();

    expect(factories.createMenu).not.toHaveBeenCalled();
    expect(factories.createSurvival).toHaveBeenCalledWith(
      expect.anything(),
      {
        kind: 'fresh',
        savedItems: browserPlaytest.savedItems,
        seed: 42,
        scavengeElapsedSeconds: 0,
      },
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
    );
    expect(createSeed).not.toHaveBeenCalled();
    expect(saveStorage.getItem).not.toHaveBeenCalled();
    expect(saveStorage.setItem).not.toHaveBeenCalled();
    expect(saveStorage.removeItem).not.toHaveBeenCalled();
    game.start();
    await flushPhases();
    expect(survival.start).toHaveBeenCalledOnce();
    game.dispose();
    await flushPhases();
  });

  it('creates the menu on normal startup', async () => {
    const createMenu = vi.fn(() => phase());

    const game = createTestGame({
      createMenu,
      createScavenge: () => phase(),
      createSurvival: () => phase(),
    }, testOptions());
    await flushPhases();

    expect(createMenu).toHaveBeenCalledOnce();
    game.dispose();
    await flushPhases();
  });

  it('clamps shared frame delta and renders through the active phase boundary', async () => {
    const active = phase();
    const requestAnimationFrame = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(42);
    const game = createTestGame({
      createMenu: createImmediateMenu,
      createScavenge: () => active,
      createSurvival: () => phase(),
    }, testOptions());
    await flushPhases();
    Object.assign(game, { clock: { start: vi.fn(), getDelta: () => 1 } });

    (game as unknown as { handleAnimationFrame: () => void; }).handleAnimationFrame();

    expect(active.update).toHaveBeenCalledWith(0.05, 0.05);
    expect(active.render).toHaveBeenCalledOnce();
    requestAnimationFrame.mockRestore();

  });

  it('deep-copies and freezes duplicate saved instances at the phase boundary', async () => {
    const calls: string[] = [];
    let complete!: (result: Readonly<ScavengeResult>) => void;
    const scavenge = phase({ dispose: vi.fn(() => calls.push('dispose-scavenge')) });
    const survival = phase({ start: vi.fn(() => calls.push('start-survival')) });
    const sourceItems = [
      { instanceId: 'cannedFood-1', type: 'cannedFood' },
      { instanceId: 'cannedFood-2', type: 'cannedFood' },
    ] as const;
    const sourceResult: ScavengeResult = { savedItems: sourceItems, elapsedSeconds: 8 };
    let receivedStart: SurvivalPhaseStart | undefined;
    const game = createTestGame({
      createMenu: createImmediateMenu,
      createScavenge: (_context, onComplete) => {
        complete = onComplete;
        return scavenge;
      },
      createSurvival: (_context, start) => {
        receivedStart = start;
        return survival;
      },
    }, testOptions());
    await flushPhases();

    game.start();
    await flushPhases();
    complete(sourceResult);
    await flushPhases();

    expect(calls).toEqual(['dispose-scavenge', 'start-survival']);
    expect(receivedStart).toEqual({
      kind: 'fresh',
      savedItems: sourceItems,
      seed: expect.any(Number),
      scavengeElapsedSeconds: 8,
    });
    expect(receivedStart).not.toBe(sourceResult);
    expect(Object.isFrozen(receivedStart)).toBe(true);
    if (receivedStart?.kind !== 'fresh') throw new Error('Expected a fresh survival start.');
    expect(receivedStart.savedItems).not.toBe(sourceItems);
    expect(Object.isFrozen(receivedStart.savedItems)).toBe(true);
    expect(receivedStart.savedItems[0]).not.toBe(sourceItems[0]);
    expect(receivedStart.savedItems[1]).not.toBe(sourceItems[1]);
    expect(Object.isFrozen(receivedStart.savedItems[0])).toBe(true);
    expect(Object.isFrozen(receivedStart.savedItems[1])).toBe(true);
  });

  it('ignores a stale return-to-menu callback after survival takes ownership', async () => {
    let complete!: (result: Readonly<ScavengeResult>) => void;
    let returnToMenu!: () => void;
    const scavenge = phase();
    const survival = phase();
    const createScavenge = vi.fn((_context, onComplete, _onRestart, onReturnToMenu) => {
      complete = onComplete;
      returnToMenu = onReturnToMenu;
      return scavenge;
    });
    const game = createTestGame({
      createMenu: createImmediateMenu,
      createScavenge,
      createSurvival: () => survival,
    }, testOptions());
    await flushPhases();
    game.start();
    await flushPhases();
    complete({ savedItems: [], elapsedSeconds: 4 });
    await flushPhases();

    returnToMenu();
    await flushPhases();

    expect(createScavenge).toHaveBeenCalledOnce();
    expect(survival.dispose).not.toHaveBeenCalled();
    expect((game as unknown as { activePhase: GamePhase; }).activePhase).toBe(survival);
  });

  it('returns from scavenging to the menu', async () => {
    let returnToMenu!: () => void;
    const initialMenu = phase();
    const returnedMenu = phase();
    const scavenge = phase();
    const createMenu = vi.fn((_context: PhaseContext, onComplete: () => void) => {
      const menu = createMenu.mock.calls.length === 1 ? initialMenu : returnedMenu;
      if (createMenu.mock.calls.length === 1) onComplete();
      return menu;
    });
    const game = createTestGame({
      createMenu,
      createScavenge: (_context, _onComplete, _onRestart, onReturn) => {
        returnToMenu = onReturn;
        return scavenge;
      },
      createSurvival: () => phase(),
    }, testOptions());
    await flushPhases();
    game.start();
    await flushPhases();

    returnToMenu();
    await flushPhases();

    expect(scavenge.dispose).toHaveBeenCalledOnce();
    expect(createMenu).toHaveBeenCalledTimes(2);
    expect(returnedMenu.start).toHaveBeenCalledOnce();
    expect((game as unknown as { activePhase: GamePhase; }).activePhase).toBe(returnedMenu);
  });

  it('returns from survival to the menu', async () => {
    let complete!: (result: Readonly<ScavengeResult>) => void;
    let returnToMenu!: () => void;
    const initialMenu = phase();
    const returnedMenu = phase();
    const scavenge = phase();
    const survival = phase();
    const createMenu = vi.fn((_context: PhaseContext, onComplete: () => void) => {
      const menu = createMenu.mock.calls.length === 1 ? initialMenu : returnedMenu;
      if (createMenu.mock.calls.length === 1) onComplete();
      return menu;
    });
    const game = createTestGame({
      createMenu,
      createScavenge: (_context, onComplete) => {
        complete = onComplete;
        return scavenge;
      },
      createSurvival: (_context, _start, _onRestart, _onCheckpointChange, onReturn) => {
        returnToMenu = onReturn;
        return survival;
      },
    }, testOptions());
    await flushPhases();
    game.start();
    await flushPhases();
    complete({ savedItems: [], elapsedSeconds: 4 });
    await flushPhases();

    returnToMenu();
    await flushPhases();

    expect(survival.dispose).toHaveBeenCalledOnce();
    expect(createMenu).toHaveBeenCalledTimes(2);
    expect(returnedMenu.start).toHaveBeenCalledOnce();
    expect((game as unknown as { activePhase: GamePhase; }).activePhase).toBe(returnedMenu);
  });

  it('keeps a nested restart when survival requests it synchronously during construction', async () => {
    let complete!: (result: Readonly<ScavengeResult>) => void;
    const initialScavenge = phase();
    const restartedScavenge = phase();
    const staleSurvival = phase();
    const scavenges = [initialScavenge, restartedScavenge];
    const createScavenge = vi.fn((_context, onComplete) => {
      complete = onComplete;
      return scavenges[createScavenge.mock.calls.length - 1]!;
    });
    const game = createTestGame({
      createMenu: createImmediateMenu,
      createScavenge,
      createSurvival: (_context, _start, onRestart) => {
        onRestart();
        return staleSurvival;
      },
    }, testOptions());
    await flushPhases();
    game.start();
    await flushPhases();

    complete({ savedItems: [], elapsedSeconds: 5 });
    await flushPhases();

    expect(initialScavenge.dispose).toHaveBeenCalledOnce();
    expect(restartedScavenge.start).toHaveBeenCalledOnce();
    expect(staleSurvival.dispose).toHaveBeenCalledOnce();
    expect(staleSurvival.start).not.toHaveBeenCalled();
    expect((game as unknown as { activePhase: GamePhase; }).activePhase).toBe(restartedScavenge);
  });

  it('ignores a phase restart callback fired reentrantly during its disposal', async () => {
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
    const game = createTestGame({
      createMenu: createImmediateMenu,
      createScavenge,
      createSurvival: (_context, _start, onRestart) => {
        restartSurvival = onRestart;
        return survival;
      },
    }, testOptions());
    await flushPhases();
    game.start();
    await flushPhases();
    complete({ savedItems: [], elapsedSeconds: 6 });
    await flushPhases();

    game.restart();
    await flushPhases();

    expect(survival.dispose).toHaveBeenCalledOnce();
    expect(createScavenge).toHaveBeenCalledTimes(2);
    expect(restartedScavenge.start).toHaveBeenCalledOnce();
    expect(unexpectedScavenge.start).not.toHaveBeenCalled();
    expect((game as unknown as { activePhase: GamePhase; }).activePhase).toBe(restartedScavenge);
  });

  it('full restart disposes survival before fresh scavenging and refreshes the survival seed', async () => {
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
    const createSurvival = vi.fn((_context, start: SurvivalPhaseStart) => {
      if (start.kind === 'fresh') receivedSeeds.push(start.seed);
      return survivals[createSurvival.mock.calls.length - 1]!;
    });
    const createSeed = vi.fn()
      .mockReturnValueOnce(11)
      .mockReturnValueOnce(22);
    const game = createTestGame({
      createMenu: createImmediateMenu,
      createScavenge,
      createSurvival,
    }, testOptions({
      createSeed,
    }));
    await flushPhases();
    game.start();
    await flushPhases();
    completions[0]!({ savedItems: [], elapsedSeconds: 3 });
    await flushPhases();

    calls.length = 0;

    game.restart();
    await flushPhases();

    expect(calls).toEqual(['dispose-survival-1', 'create-scavenge-2', 'start-scavenge-2']);
    expect(firstSurvival.dispose).toHaveBeenCalledOnce();
    expect(createScavenge).toHaveBeenCalledTimes(2);
    expect(firstScavenge).not.toBe(secondScavenge);
    completions[1]!({ savedItems: [], elapsedSeconds: 2 });
    await flushPhases();

    expect(receivedSeeds).toEqual([11, 22]);
  });

  it('disposes shared animation, renderer, and canvas resources exactly once', async () => {
    const calls: string[] = [];
    const active = phase({ dispose: vi.fn(() => calls.push('dispose-phase')) });
    const propModels = createTestPropModels();
    const disposeModels = propModels.dispose.bind(propModels);
    const disposePropModels = vi.spyOn(propModels, 'dispose')
      .mockImplementation(() => {
        calls.push('dispose-models');
        disposeModels();
      });
    const shipFurniture = createTestShipFurniture();
    const disposeShipFurniture = vi.spyOn(shipFurniture, 'dispose')
      .mockImplementation(() => {
        calls.push('dispose-furniture');
      });
    const skyAssets = createTestSkyAssets();
    const disposeSkyAssets = vi.spyOn(skyAssets, 'dispose')
      .mockImplementation(() => {
        calls.push('dispose-sky');
      });
    const requestAnimationFrame = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(42);
    const cancelAnimationFrame = vi.spyOn(window, 'cancelAnimationFrame');
    const game = createTestGame({
      createMenu: createImmediateMenu,
      createScavenge: () => active,
      createSurvival: () => phase(),
    }, { propModels, menuModels: EMPTY_MENU_MODELS, shipFurniture, skyAssets, physicsRuntime });
    await flushPhases();
    const renderer = (game as unknown as {
      renderer: { dispose: () => void; domElement: HTMLCanvasElement; };
    }).renderer;
    const disposeRenderer = vi.spyOn(renderer, 'dispose');
    const removeEventListener = vi.spyOn(window, 'removeEventListener');
    expect(renderer.domElement.parentElement).not.toBeNull();
    game.start();
    await flushPhases();

    game.dispose();
    await flushPhases();
    game.dispose();
    await flushPhases();

    expect(cancelAnimationFrame).toHaveBeenCalledOnce();
    expect(active.dispose).toHaveBeenCalledOnce();
    expect(disposePropModels).toHaveBeenCalledOnce();
    expect(disposeShipFurniture).toHaveBeenCalledOnce();
    expect(disposeSkyAssets).toHaveBeenCalledOnce();
    expect(calls).toEqual([
      'dispose-phase',
      'dispose-models',
      'dispose-furniture',
      'dispose-sky',
    ]);
    expect(disposeRenderer).toHaveBeenCalledOnce();
    expect(renderer.domElement.parentElement).toBeNull();
    expect(removeEventListener).toHaveBeenCalledTimes(2);
    expect(removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(removeEventListener).toHaveBeenCalledWith('keydown', expect.any(Function), true);
    requestAnimationFrame.mockRestore();

    cancelAnimationFrame.mockRestore();

    removeEventListener.mockRestore();

  });

  it('rolls back acquired construction resources without disposing unowned assets', async () => {
    const mount = document.createElement('main');
    const canvas = document.createElement('canvas');
    const resizeError = new Error('initial resize failed');
    const renderer = {
      domElement: canvas,
      capabilities: { getMaxAnisotropy: () => 1 },
      setPixelRatio: vi.fn(),
      setSize: vi.fn(() => { throw resizeError; }),
      render: vi.fn(),
      dispose: vi.fn(),
      shadowMap: { enabled: true, type: 0 },
    };
    const active = phase();
    const propModels = createTestPropModels();
    const disposeModels = vi.spyOn(propModels, 'dispose');
    const shipFurniture = createTestShipFurniture();
    const disposeShipFurniture = vi.spyOn(shipFurniture, 'dispose');
    const skyAssets = createTestSkyAssets();
    const disposeSkyAssets = vi.spyOn(skyAssets, 'dispose');
    const addEventListener = vi.spyOn(window, 'addEventListener');
    const removeEventListener = vi.spyOn(window, 'removeEventListener');

    expect(() => createTestGame({
      createMenu: createImmediateMenu,
      createScavenge: () => active,
      createSurvival: () => phase(),
    }, {
      propModels,
      menuModels: EMPTY_MENU_MODELS,
      shipFurniture,
      skyAssets,
      physicsRuntime,
      mount,
      renderer,
    } as unknown as GameFixtureOptions)).toThrow(resizeError);

    expect(addEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(addEventListener).toHaveBeenCalledTimes(2);
    expect(removeEventListener).toHaveBeenCalledTimes(2);
    expect(addEventListener).toHaveBeenCalledWith('keydown', expect.any(Function), true);
    expect(removeEventListener).toHaveBeenCalledWith('keydown', expect.any(Function), true);
    for (const [type, listener, options] of addEventListener.mock.calls) {
      expect(removeEventListener).toHaveBeenCalledWith(type, listener, ...(options === undefined ? [] : [options]));
    }
    expect(active.dispose).not.toHaveBeenCalled();
    expect(renderer.dispose).toHaveBeenCalledOnce();
    expect(canvas.parentElement).toBeNull();
    expect(disposeModels).not.toHaveBeenCalled();
    expect(disposeShipFurniture).not.toHaveBeenCalled();
    expect(disposeSkyAssets).not.toHaveBeenCalled();

    addEventListener.mockRestore();

    removeEventListener.mockRestore();

  });
});
