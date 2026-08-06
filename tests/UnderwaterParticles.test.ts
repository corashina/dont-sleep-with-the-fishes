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

function expectedBubblePosition(index: number): readonly [number, number, number] {
  const column = index % 12;
  const row = Math.floor(index / 12);
  const horizontal = column / 11;
  const vertical = row / 11;
  const depthBand = (column * 5 + row * 7) % 8;
  const spread = 7.5 + depthBand * 4.2;
  const jitterX = ((index * 17) % 11 - 5) * 0.11;
  const jitterY = ((index * 13) % 9 - 4) * 0.07;
  return [
    (horizontal * 2 - 1) * spread + jitterX,
    -0.55 + vertical * 9.1 + jitterY,
    4.4 - depthBand * 5.1 - (row % 3) * 0.35,
  ];
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

  const depthBandCounts = Array.from({ length: 8 }, () => 0);
  for (let index = 0; index < 144; index += 1) {
    const [expectedX, expectedY, expectedZ] = expectedBubblePosition(index);
    const offset = index * 3;
    const x = firstValues[offset]!;
    const y = firstValues[offset + 1]!;
    const z = firstValues[offset + 2]!;
    expect(x).toBeCloseTo(expectedX, 5);
    expect(y).toBeCloseTo(expectedY, 5);
    expect(z).toBeCloseTo(expectedZ, 5);

    const row = Math.floor(index / 12);
    const depthBand = Math.round((4.4 - (row % 3) * 0.35 - z) / 5.1);
    expect(depthBand).toBeGreaterThanOrEqual(0);
    expect(depthBand).toBeLessThan(8);
    depthBandCounts[depthBand]! += 1;
  }
  expect(depthBandCounts.every((count) => count > 0)).toBe(true);

  first.dispose();
  second.dispose();
});
