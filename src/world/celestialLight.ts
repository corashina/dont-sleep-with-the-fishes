import type { DirectionalLight } from 'three';

export type CelestialDirection = readonly [number, number, number];

export const SUN_DIRECTION: CelestialDirection = Object.freeze([
  -0.42,
  0.58,
  -0.7,
]);

export function alignDirectionalLightWithSun(
  light: DirectionalLight,
  distance: number,
  direction: CelestialDirection = SUN_DIRECTION,
): void {
  light.position
    .set(...direction)
    .normalize()
    .multiplyScalar(distance)
    .add(light.target.position);
}
