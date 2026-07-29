import { describe, expect, it } from 'vitest';
import { pointerLockTransition } from '../src/game/GameLoop';

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

});
