export const EVENT_ITEM_DURATION_MULTIPLIER = 4;
export const THROWN_ITEM_SPEED_MULTIPLIER = 1.25;

export function scaleEventItemDuration(baseDuration: number): number {
  return baseDuration * EVENT_ITEM_DURATION_MULTIPLIER;
}

export function scaleThrownItemDuration(baseDuration: number): number {
  return scaleEventItemDuration(baseDuration) / THROWN_ITEM_SPEED_MULTIPLIER;
}
