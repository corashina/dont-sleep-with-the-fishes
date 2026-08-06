import { expect, it } from 'vitest';
import { UnderwaterParticles } from '../src/menu/UnderwaterParticles';

function ranges(values: Float32Array): {
  readonly x: readonly [number, number];
  readonly y: readonly [number, number];
  readonly z: readonly [number, number];
} {
  let minX = Infinity; let maxX = -Infinity;
  let minY = Infinity; let maxY = -Infinity;
  let minZ = Infinity; let maxZ = -Infinity;
  for (let index = 0; index < values.length; index += 3) {
    minX = Math.min(minX, values[index]!);
    maxX = Math.max(maxX, values[index]!);
    minY = Math.min(minY, values[index + 1]!);
    maxY = Math.max(maxY, values[index + 1]!);
    minZ = Math.min(minZ, values[index + 2]!);
    maxZ = Math.max(maxZ, values[index + 2]!);
  }
  return { x: [minX, maxX], y: [minY, maxY], z: [minZ, maxZ] };
}

it('spreads bubbles across all screen-facing depth bands', () => {
  const first = new UnderwaterParticles();
  const second = new UnderwaterParticles();
  const firstValues = Array.from(
    first.bubbles.geometry.getAttribute('basePosition').array as Float32Array,
  );
  const secondValues = Array.from(
    second.bubbles.geometry.getAttribute('basePosition').array as Float32Array,
  );
  expect(firstValues).toEqual(secondValues);

  const bounds = ranges(Float32Array.from(firstValues));
  expect(bounds.x[0]).toBeLessThan(-28);
  expect(bounds.x[1]).toBeGreaterThan(28);
  expect(bounds.y[0]).toBeLessThan(0);
  expect(bounds.y[1]).toBeGreaterThan(8);
  expect(bounds.z[0]).toBeLessThan(-30);
  expect(bounds.z[1]).toBeGreaterThan(3);

  first.dispose();
  second.dispose();
});
