export const KRAKEN_EMERGE_SECONDS = 6;
export const KRAKEN_STARE_SECONDS = 3;
export const KRAKEN_REVEAL_SECONDS = KRAKEN_EMERGE_SECONDS + KRAKEN_STARE_SECONDS;
export const KRAKEN_COLLECTION_SECONDS = 5;
export const KRAKEN_DESCENT_SECONDS = 6;
export const KRAKEN_RELEASE_SECONDS = KRAKEN_COLLECTION_SECONDS + KRAKEN_DESCENT_SECONDS;
/** The arms break the surface first. The head follows slowly. */
export const KRAKEN_HEAD_RISE_START = 1.2;
/** The eyes snap open at the end of the rise. The roar starts with them. */
export const KRAKEN_EYES_OPEN_AT = 5.55;
export const KRAKEN_EYES_OPEN_SECONDS = 0.4;
/** The boat is this far in front of the Kraken root. */
export const KRAKEN_BOAT_DISTANCE = 22;
export function krakenEase(value: number): number {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}
/** A slow start and a heavy stop. */
export function krakenHeave(value: number): number {
  const t = Math.max(0, Math.min(1, value));
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}
