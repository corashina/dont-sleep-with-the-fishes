export const LIGHTNING_FLASH_DURATION = 0.48;

// A fast return stroke, a dark gap, then a weaker stroke along the same channel.
export function lightningFlashIntensity(elapsed: number, repeatDelay = 0.14): number {
  if (elapsed < 0 || elapsed >= LIGHTNING_FLASH_DURATION) return 0;
  const first = Math.exp(-elapsed * 42);
  const repeatAge = elapsed - repeatDelay;
  const repeat = repeatAge >= 0 ? 0.72 * Math.exp(-repeatAge * 30) : 0;
  return Math.max(first, repeat);
}
