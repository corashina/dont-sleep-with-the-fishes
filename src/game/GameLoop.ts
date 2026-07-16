import type { SessionStatus } from './ScavengeSession';

const FAILURE_SEQUENCE_SECONDS = 1.25;

export interface GameplayFrameSteps {
  tick: () => void;
  afterTick: () => void;
  move: () => void;
  afterMove: () => void;
  interact: () => void;
  flight: () => void;
  isRunning: () => boolean;
}

export function runGameplayFrame(active: boolean, steps: GameplayFrameSteps): void {
  if (!active) return;
  steps.tick();
  steps.afterTick();
  if (!steps.isRunning()) return;
  steps.move();
  steps.afterMove();
  if (!steps.isRunning()) return;
  steps.interact();
  if (!steps.isRunning()) return;
  steps.flight();
}

export type PointerLockTransition = 'none' | 'start' | 'pause' | 'resume';

export function pointerLockTransition(
  status: SessionStatus,
  locked: boolean,
): PointerLockTransition {
  if (locked && status === 'idle') return 'start';
  if (locked && status === 'paused') return 'resume';
  if (!locked && status === 'running') return 'pause';
  return 'none';
}

export interface TerminalPresentation {
  phase: 'playing' | 'failureSequence' | 'result';
  remainingSeconds: number;
}

export function advanceTerminalPresentation(
  current: TerminalPresentation,
  status: SessionStatus,
  deltaSeconds: number,
): TerminalPresentation {
  if (current.phase === 'result') return current;
  if (current.phase === 'playing') {
    if (status === 'success') return { phase: 'result', remainingSeconds: 0 };
    if (status === 'failure') {
      return { phase: 'failureSequence', remainingSeconds: FAILURE_SEQUENCE_SECONDS };
    }
    return current;
  }
  const remainingSeconds = Math.max(0, current.remainingSeconds - Math.max(0, deltaSeconds));
  return remainingSeconds === 0
    ? { phase: 'result', remainingSeconds: 0 }
    : { phase: 'failureSequence', remainingSeconds };
}
