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
  sampleMenuMotionInto(sample, 24);

  expect(sample.sharks[0].position).toBe(firstShark);
  expect(sample.fishSchools[0].position).toBe(firstFish);
  expect(sample.sharks[0].position).toEqual(start);
});

it('clamps the 0.7 second fade', () => {
  expect(MENU_FADE_SECONDS).toBe(0.7);
  expect(sampleMenuFade(-1)).toBe(0);
  expect(sampleMenuFade(0.35)).toBeCloseTo(0.5);
  expect(sampleMenuFade(0.7)).toBe(1);
  expect(sampleMenuFade(2)).toBe(1);
});
