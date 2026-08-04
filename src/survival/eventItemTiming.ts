export const EVENT_ITEM_DURATION_MULTIPLIER = 4;

export function scaleEventItemDuration(baseDuration: number): number {
  return baseDuration * EVENT_ITEM_DURATION_MULTIPLIER;
}
