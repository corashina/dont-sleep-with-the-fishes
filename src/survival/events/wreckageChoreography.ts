import { clamp01, smoothstepRange } from '../animationMath';

export type WreckageBeat = 'reveal' | 'surface-hold' | 'leave';

export interface WreckageSample {
  debrisAlpha: number;
  sceneAlpha: number;
}

const DURATIONS: Readonly<Record<WreckageBeat, number>> = Object.freeze({
  reveal: 1.2,
  'surface-hold': 0,
  leave: 1.2,
});

export function createWreckageSample(): WreckageSample {
  return { debrisAlpha: 0, sceneAlpha: 0 };
}

export function wreckageBeatDuration(beat: WreckageBeat): number {
  return DURATIONS[beat];
}

export function sampleWreckageBeat(
  beat: WreckageBeat,
  elapsed: number,
  output: WreckageSample,
): boolean {
  const duration = DURATIONS[beat];
  if (duration === undefined) return false;
  const t = duration === 0 ? 1 : clamp01(elapsed / duration);
  output.debrisAlpha = beat === 'reveal' ? smoothstepRange(0, 0.45, t) : 1;
  output.sceneAlpha = beat === 'leave' ? 1 - t : 1;
  return true;
}
