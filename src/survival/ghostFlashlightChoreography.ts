import { clamp01, smoothstep } from './animationMath';

export const GHOST_COUNT = 5;
export const GHOST_FLASHLIGHT_BASE_DURATION = 3;
const SEQUENCE_START = 0.2;
const SEQUENCE_SPAN = 0.75;
const FLASH_STARTS = [0.24, 0.37, 0.5] as const;
export const GHOST_FLASHLIGHT_CUES: readonly number[] = Object.freeze(
  Array.from({ length: GHOST_COUNT }, (_, index) => FLASH_STARTS.map(
    start => SEQUENCE_START + (index + start) * SEQUENCE_SPAN / GHOST_COUNT,
  )).flat(),
);

export function ghostFlashlightCycle(progress: number): number {
  return clamp01((progress - SEQUENCE_START) / SEQUENCE_SPAN) * GHOST_COUNT;
}

export function ghostFlashlightBeam(progress: number): number {
  if (progress < SEQUENCE_START || progress >= SEQUENCE_START + SEQUENCE_SPAN) return 0;
  const cycle = ghostFlashlightCycle(progress) % 1;
  for (const start of FLASH_STARTS) {
    if (cycle >= start && cycle <= start + 0.07) {
      return smoothstep((cycle - start) / 0.015)
        * (1 - smoothstep((cycle - start - 0.055) / 0.015));
    }
  }
  return 0;
}

export function ghostFlashlightDeparture(progress: number, index: number): number {
  return smoothstep((ghostFlashlightCycle(progress) - index - 0.62) / 0.36);
}
