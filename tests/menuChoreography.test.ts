import { expect, it } from 'vitest';
import {
  MENU_FADE_SECONDS,
  createMenuMotionSample,
  sampleMenuFade,
  sampleMenuMotionInto,
} from '../src/menu/menuChoreography';

it('loops every actor without replacing output arrays', () => {
  const sample = createMenuMotionSample();
  const firstShark = sample.sharks[0].position;
  const firstFish = sample.fishSchools[0].position;

  sampleMenuMotionInto(sample, 0);
  const start = [...sample.sharks[0].position];
  sampleMenuMotionInto(sample, 26);

  expect(sample.sharks[0].position).toBe(firstShark);
  expect(sample.fishSchools[0].position).toBe(firstFish);
  expect(sample.sharks[0].position).toEqual(start);
});

it('keeps animal groups separated while they cover both sides', () => {
  const sample = createMenuMotionSample();
  const sharkX = [Infinity, -Infinity, Infinity, -Infinity];
  const fishX = [Infinity, -Infinity, Infinity, -Infinity];

  for (let step = 0; step <= 192; step += 1) {
    sampleMenuMotionInto(sample, step * 0.25);
    const sharkDistance = Math.hypot(
      sample.sharks[0].position[0] - sample.sharks[1].position[0],
      sample.sharks[0].position[1] - sample.sharks[1].position[1],
      sample.sharks[0].position[2] - sample.sharks[1].position[2],
    );
    const fishDistance = Math.hypot(
      sample.fishSchools[0].position[0] - sample.fishSchools[1].position[0],
      sample.fishSchools[0].position[1] - sample.fishSchools[1].position[1],
      sample.fishSchools[0].position[2] - sample.fishSchools[1].position[2],
    );
    expect(sharkDistance).toBeGreaterThan(2.2);
    expect(fishDistance).toBeGreaterThan(4);
    sharkX[0] = Math.min(sharkX[0]!, sample.sharks[0].position[0]);
    sharkX[1] = Math.max(sharkX[1]!, sample.sharks[0].position[0]);
    sharkX[2] = Math.min(sharkX[2]!, sample.sharks[1].position[0]);
    sharkX[3] = Math.max(sharkX[3]!, sample.sharks[1].position[0]);
    fishX[0] = Math.min(fishX[0]!, sample.fishSchools[0].position[0]);
    fishX[1] = Math.max(fishX[1]!, sample.fishSchools[0].position[0]);
    fishX[2] = Math.min(fishX[2]!, sample.fishSchools[1].position[0]);
    fishX[3] = Math.max(fishX[3]!, sample.fishSchools[1].position[0]);
  }

  expect(sharkX[0]).toBeLessThan(-15);
  expect(sharkX[3]).toBeGreaterThan(20);
  expect(fishX[0]).toBeLessThan(-14);
  expect(fishX[3]).toBeGreaterThan(16);
});

it('clamps the 0.7 second fade', () => {
  expect(MENU_FADE_SECONDS).toBe(0.7);
  expect(sampleMenuFade(-1)).toBe(0);
  expect(sampleMenuFade(0.35)).toBeCloseTo(0.5);
  expect(sampleMenuFade(0.7)).toBe(1);
  expect(sampleMenuFade(2)).toBe(1);
});
