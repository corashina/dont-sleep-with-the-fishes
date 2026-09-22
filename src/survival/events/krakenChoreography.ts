export const KRAKEN_EMERGE_SECONDS = 6;
export const KRAKEN_STARE_SECONDS = 3;
export const KRAKEN_REVEAL_SECONDS = KRAKEN_EMERGE_SECONDS + KRAKEN_STARE_SECONDS;
export const KRAKEN_COLLECTION_SECONDS = 5;
export const KRAKEN_DESCENT_SECONDS = 6;
export const KRAKEN_RELEASE_SECONDS = KRAKEN_COLLECTION_SECONDS + KRAKEN_DESCENT_SECONDS;
export function krakenEase(value: number): number {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}
