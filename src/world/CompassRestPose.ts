import { FISHING_ITEM_SIZES } from '../game/fishingModelSizes';

// Case support point per metre of the model's longest dimension.
export const COMPASS_CASE_SUPPORT_POINT = Object.freeze([
  -0.0181579375 * FISHING_ITEM_SIZES.compass,
  -0.1248540833 * FISHING_ITEM_SIZES.compass,
  -0.0632767083 * FISHING_ITEM_SIZES.compass,
] as const);

export const COMPASS_REST_ROTATION = Object.freeze([
  -1.77695267,
  0.32964526,
  -3.10718377,
] as const);
