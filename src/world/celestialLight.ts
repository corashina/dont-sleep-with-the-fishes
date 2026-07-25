import type { DirectionalLight } from 'three';

export const SUN_DIRECTION: readonly [number, number, number] = Object.freeze([
  -0.42,
  0.58,
  -0.7,
]);

export function alignDirectionalLightWithSun(
  light: DirectionalLight,
  distance: number,
): void {
  light.position
    .set(...SUN_DIRECTION)
    .normalize()
    .multiplyScalar(distance)
    .add(light.target.position);
}
