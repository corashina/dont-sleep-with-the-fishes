import {
  clamp01,
  smootherstepRange,
  smoothstepRange,
} from '../animationMath';

export type WreckageBeat =
  | 'reveal'
  | 'search'
  | 'leave'
  | 'underwater-hold'
  | 'loot'
  | 'collapse'
  | 'creature'
  | 'ghost'
  | 'return';

export interface WreckageSample {
  debrisAlpha: number;
  debrisApproach: number;
  wreckAlpha: number;
  cameraJolt: number;
  redFlash: number;
  lootGlow: number;
  fallingDebris: number;
  silt: number;
  creatureAdvance: number;
  ghostDrift: number;
  sceneAlpha: number;
}

const DURATIONS: Readonly<Record<WreckageBeat, number>> = Object.freeze({
  reveal: 1.2,
  search: 1.4,
  leave: 1.2,
  'underwater-hold': 3,
  loot: 1.2,
  collapse: 1.5,
  creature: 1.35,
  ghost: 1.6,
  return: 0.8,
});

function resetSample(output: WreckageSample): void {
  output.debrisAlpha = 0;
  output.debrisApproach = 0;
  output.wreckAlpha = 0;
  output.cameraJolt = 0;
  output.redFlash = 0;
  output.lootGlow = 0;
  output.fallingDebris = 0;
  output.silt = 0;
  output.creatureAdvance = 0;
  output.ghostDrift = 0;
  output.sceneAlpha = 0;
}

export function createWreckageSample(): WreckageSample {
  const sample = {} as WreckageSample;
  resetSample(sample);
  return sample;
}

export function wreckageBeatDuration(beat: WreckageBeat): number {
  return DURATIONS[beat];
}

export function sampleWreckageBeat(
  beat: WreckageBeat,
  elapsed: number,
  output: WreckageSample,
): boolean {
  resetSample(output);
  const duration = DURATIONS[beat];
  if (duration === undefined) return false;

  const t = clamp01(elapsed / duration);
  output.debrisAlpha = beat === 'reveal' ? smoothstepRange(0, 0.45, t) : 1;
  output.debrisApproach = beat === 'search'
    ? smootherstepRange(0.08, 0.82, t)
    : 0;
  output.wreckAlpha = beat === 'underwater-hold'
    ? smoothstepRange(0, 0.28, t)
    : 0;
  output.lootGlow = beat === 'loot' ? Math.sin(Math.PI * t) : 0;
  output.fallingDebris = beat === 'collapse'
    ? smootherstepRange(0.08, 0.72, t)
    : 0;
  output.silt = beat === 'collapse' ? smoothstepRange(0.18, 0.9, t) : 0;
  output.creatureAdvance = beat === 'creature'
    ? smootherstepRange(0.12, 0.86, t)
    : 0;
  output.ghostDrift = beat === 'ghost'
    ? smootherstepRange(0.05, 0.92, t)
    : 0;
  output.cameraJolt = beat === 'collapse' || beat === 'creature'
    ? Math.sin(t * Math.PI * 8) * (1 - t)
    : 0;
  output.redFlash = beat === 'search' ? Math.sin(Math.PI * t) : 0;
  output.sceneAlpha = beat === 'leave' || beat === 'return' ? 1 - t : 1;
  return true;
}
