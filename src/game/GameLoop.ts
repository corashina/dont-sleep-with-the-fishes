import type { SessionStatus } from './ScavengeSession';

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
