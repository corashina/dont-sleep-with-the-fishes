import { describe, expect, it, vi } from 'vitest';
import {
  GameLifecycle,
  advanceTerminalPresentation,
  pointerLockTransition,
  runGameplayFrame,
  type GameLifecycleActions,
  type TerminalPresentation,
} from '../src/game/GameLoop';
import type { SessionStatus } from '../src/game/ScavengeSession';

function frameHarness(terminalStage: 'none' | 'tick' | 'move' | 'interact' = 'none') {
  let status: SessionStatus = 'running';
  const calls: string[] = [];
  const stage = (name: 'tick' | 'move' | 'interact' | 'flight'): void => {
    calls.push(name);
    if (terminalStage === name) status = 'failure';
  };

  runGameplayFrame(true, {
    tick: () => stage('tick'),
    afterTick: () => calls.push('sync-after-tick'),
    move: () => stage('move'),
    afterMove: () => calls.push('sync-after-move'),
    interact: () => stage('interact'),
    flight: () => stage('flight'),
    isRunning: () => status === 'running',
  });
  return calls;
}

describe('gameplay frame policy', () => {
  it('stops after a timer tick expires while still synchronizing terminal state', () => {
    expect(frameHarness('tick')).toEqual(['tick', 'sync-after-tick']);
  });

  it('stops after a fall penalty expires while still synchronizing the fall result', () => {
    expect(frameHarness('move')).toEqual([
      'tick',
      'sync-after-tick',
      'move',
      'sync-after-move',
    ]);
  });

  it('does not update a carried flight after interaction ends the run', () => {
    expect(frameHarness('interact')).toEqual([
      'tick',
      'sync-after-tick',
      'move',
      'sync-after-move',
      'interact',
    ]);
  });

  it('runs every gameplay stage exactly once while the session remains running', () => {
    expect(frameHarness()).toEqual([
      'tick',
      'sync-after-tick',
      'move',
      'sync-after-move',
      'interact',
      'flight',
    ]);
  });

  it('skips all gameplay stages when pointer lock or visibility makes the frame inactive', () => {
    const tick = vi.fn();
    runGameplayFrame(false, {
      tick,
      afterTick: vi.fn(),
      move: vi.fn(),
      afterMove: vi.fn(),
      interact: vi.fn(),
      flight: vi.fn(),
      isRunning: () => true,
    });
    expect(tick).not.toHaveBeenCalled();
  });
});

describe('orchestrator phase policy', () => {
  it.each([
    ['idle', true, 'start'],
    ['running', false, 'pause'],
    ['paused', true, 'resume'],
    ['success', false, 'none'],
    ['failure', false, 'none'],
  ] as const)('maps %s with lock=%s to %s', (status, locked, transition) => {
    expect(pointerLockTransition(status, locked)).toBe(transition);
  });

  it('shows success immediately but holds failure in a short sequence', () => {
    const playing: TerminalPresentation = { phase: 'playing', remainingSeconds: 0 };

    expect(advanceTerminalPresentation(playing, 'success', 0.016).phase).toBe('result');
    const failure = advanceTerminalPresentation(playing, 'failure', 0.016);
    expect(failure.phase).toBe('failureSequence');
    expect(advanceTerminalPresentation(failure, 'failure', 0.5).phase)
      .toBe('failureSequence');
    expect(advanceTerminalPresentation(failure, 'failure', 2).phase).toBe('result');
  });

  it('keeps idle, running, and paused sessions out of terminal presentation', () => {
    const playing: TerminalPresentation = { phase: 'playing', remainingSeconds: 0 };
    expect(advanceTerminalPresentation(playing, 'idle', 10)).toEqual(playing);
    expect(advanceTerminalPresentation(playing, 'running', 10)).toEqual(playing);
    expect(advanceTerminalPresentation(playing, 'paused', 10)).toEqual(playing);
  });
});

describe('game lifecycle policy', () => {
  function actions(): GameLifecycleActions & Record<string, ReturnType<typeof vi.fn>> {
    return {
      cancelAnimation: vi.fn(),
      removeGlobalListeners: vi.fn(),
      exitPointerLock: vi.fn(),
      resetCarry: vi.fn(),
      disposeInput: vi.fn(),
      disposeInteraction: vi.fn(),
      disposeWorld: vi.fn(),
      disposeUI: vi.fn(),
      disposeRenderer: vi.fn(),
      removeCanvas: vi.fn(),
    };
  }

  it('exits an owned pointer lock and disposes every owned resource exactly once', () => {
    const lifecycle = new GameLifecycle();
    const owned = actions();

    lifecycle.dispose(true, owned);
    lifecycle.dispose(true, owned);

    Object.values(owned).forEach((action) => expect(action).toHaveBeenCalledOnce());
  });

  it('does not exit pointer lock when another element owns it', () => {
    const lifecycle = new GameLifecycle();
    const unowned = actions();

    lifecycle.dispose(false, unowned);

    expect(unowned.exitPointerLock).not.toHaveBeenCalled();
    expect(unowned.removeCanvas).toHaveBeenCalledOnce();
  });
});
