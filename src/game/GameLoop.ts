import type { SessionStatus } from './ScavengeSession';

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
