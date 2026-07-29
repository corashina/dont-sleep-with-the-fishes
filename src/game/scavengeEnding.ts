import type { SessionStatus } from './ScavengeSession';
import type { SinkingState } from './sinking';

export const SINKING_CINEMATIC_SECONDS = 8;
export const ENDING_HOLD_SECONDS = 3;

export type ScavengeEndingStage = 'playing' | 'sinking' | 'endingHold' | 'menuReady';

export interface ScavengeEndingState {
  readonly stage: ScavengeEndingStage;
  readonly elapsedSeconds: number;
}

export interface ScavengeCinematicFrame {
  readonly sinking: SinkingState;
  readonly cameraPosition: readonly [number, number, number];
  readonly cameraTarget: readonly [number, number, number];
  readonly blackout: number;
}

export function createScavengeEndingState(): ScavengeEndingState {
  return { stage: 'playing', elapsedSeconds: 0 };
}

export function advanceScavengeEnding(
  state: ScavengeEndingState,
  status: SessionStatus,
  deltaSeconds: number,
): ScavengeEndingState {
  if (state.stage === 'menuReady') return state;

  let stage = state.stage;
  let elapsedSeconds = state.elapsedSeconds;
  let remainingDelta = Math.max(0, deltaSeconds);

  if (stage === 'playing') {
    if (status === 'failure') {
      stage = 'sinking';
      elapsedSeconds = 0;
    } else if (status === 'success') {
      stage = 'endingHold';
      elapsedSeconds = 0;
    } else {
      return state;
    }
  }

  if (stage === 'sinking') {
    const remainingCinematic = Math.max(0, SINKING_CINEMATIC_SECONDS - elapsedSeconds);
    if (remainingDelta < remainingCinematic) {
      return { stage, elapsedSeconds: elapsedSeconds + remainingDelta };
    }
    remainingDelta -= remainingCinematic;
    stage = 'endingHold';
    elapsedSeconds = 0;
  }

  const remainingHold = Math.max(0, ENDING_HOLD_SECONDS - elapsedSeconds);
  if (remainingDelta < remainingHold) {
    return { stage: 'endingHold', elapsedSeconds: elapsedSeconds + remainingDelta };
  }
  return { stage: 'menuReady', elapsedSeconds: 0 };
}

export function getScavengeCinematicFrame(elapsedSeconds: number): ScavengeCinematicFrame {
  const progress = clamp01(elapsedSeconds / SINKING_CINEMATIC_SECONDS);
  const anticipation = smootherStep(clamp01(progress / 0.16));
  const descent = smootherStep(clamp01((progress - 0.12) / 0.88));
  const finalRush = smootherStep(clamp01((progress - 0.62) / 0.38));

  return {
    sinking: {
      progress,
      rollRadians: -0.08 * anticipation - 0.4 * descent,
      pitchRadians: 0.04 * anticipation + 0.22 * descent,
      sinkOffset: -2.5 * descent - 13.5 * finalRush || 0,
      alarmRate: 1.2 + 1.1 * finalRush,
      waveAmplitudeScale: 1.2 + 0.35 * descent,
    },
    cameraPosition: [
      lerp(44, 42, descent),
      lerp(15, 13.5, descent),
      lerp(34, 36, descent),
    ],
    cameraTarget: [0, lerp(3.4, -1.5, descent), 0],
    blackout: smootherStep(clamp01((progress - 0.88) / 0.12)),
  };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smootherStep(value: number): number {
  return value * value * value * (value * (value * 6 - 15) + 10);
}

function lerp(start: number, end: number, progress: number): number {
  return start + (end - start) * progress;
}
