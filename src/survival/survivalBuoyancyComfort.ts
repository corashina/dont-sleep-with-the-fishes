import type { BoatPose } from '../ocean/BoatBuoyancy';

export const SURVIVAL_TRANSLATION_SCALE = 0.1;
export const SURVIVAL_ROTATION_SCALE = 0.04;

export function applySurvivalBuoyancyComfortInto(
  output: BoatPose,
  source: Readonly<BoatPose>,
): void {
  output.y = source.y * SURVIVAL_TRANSLATION_SCALE;
  output.pitch = source.pitch * SURVIVAL_ROTATION_SCALE;
  output.roll = source.roll * SURVIVAL_ROTATION_SCALE;
  output.driftX = source.driftX * SURVIVAL_TRANSLATION_SCALE;
  output.driftZ = source.driftZ * SURVIVAL_TRANSLATION_SCALE;
}
