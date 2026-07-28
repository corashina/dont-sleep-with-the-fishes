import { describe, expect, it } from 'vitest';
import {
  sampleWeatherItemUse,
  sampleWeatherReveal,
  weatherItemUseDuration,
  weatherRevealDuration,
  type WeatherItemSample,
  type WeatherRevealSample,
} from '../src/survival/weatherEventChoreography';

const reveal = (): WeatherRevealSample => ({
  cameraX: 0, cameraY: 0, cameraZ: 0,
  cameraYaw: 0, cameraPitch: 0, cameraRoll: 0,
  supplyRoll: 0, supplyLift: 0,
  figureVisibility: 0, figureDistance: 0,
  lightningEmphasis: 0,
});

const item = (): WeatherItemSample => ({
  x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0,
  scaleX: 1, scaleY: 1, scaleZ: 1, effect: 0,
});

const hasItemMotion = (sample: WeatherItemSample): boolean => (
  Math.abs(sample.x) > 0.01 || Math.abs(sample.y) > 0.01 || Math.abs(sample.z) > 0.01
  || Math.abs(sample.yaw) > 0.01 || Math.abs(sample.pitch) > 0.01 || Math.abs(sample.roll) > 0.01
  || Math.abs(sample.scaleX - 1) > 0.01 || Math.abs(sample.scaleY - 1) > 0.01
  || Math.abs(sample.scaleZ - 1) > 0.01 || sample.effect > 0.01
);

describe('weather event choreography', () => {
  it.each([
    'shower-night', 'windy-night', 'thunderstorm',
    'restless-waves', 'man-in-the-fog',
  ])('restores %s reveal to identity', (eventId) => {
    const output = reveal();
    expect(weatherRevealDuration(eventId)).toBeGreaterThanOrEqual(3.4);
    expect(sampleWeatherReveal(eventId, 1, output)).toBe(true);
    expect(output).toEqual(reveal());
  });

  it('shows and then hides the fog figure before reveal completion', () => {
    const output = reveal();
    sampleWeatherReveal('man-in-the-fog', 0.58, output);
    expect(output.figureVisibility).toBeGreaterThan(0.7);
    sampleWeatherReveal('man-in-the-fog', 0.86, output);
    expect(output.figureVisibility).toBe(0);
  });

  it.each([
    'shower-night', 'windy-night', 'thunderstorm',
    'restless-waves', 'man-in-the-fog',
  ])('%s reveal has visible middle motion and eases home before completion', (eventId) => {
    const middle = reveal();
    const nearEnd = reveal();
    sampleWeatherReveal(eventId, 0.5, middle);
    sampleWeatherReveal(eventId, 0.99, nearEnd);
    expect(Object.values(middle).some((value) => Math.abs(value) > 0.01)).toBe(true);
    expect(Object.values(nearEnd).every((value) => Math.abs(value) < 0.02)).toBe(true);
  });

  it('rejects unsupported physical pairs', () => {
    expect(weatherItemUseDuration('shower-night', 'anchor')).toBeNull();
    expect(sampleWeatherItemUse('shower-night', 'anchor', 0.5, item())).toBe(false);
  });

  it.each([
    ['shower-night', 'bucket'], ['shower-night', 'umbrella'], ['shower-night', 'map'],
    ['windy-night', 'fishingNet'], ['windy-night', 'map'], ['windy-night', 'umbrella'],
    ['thunderstorm', 'anchor'], ['thunderstorm', 'bucket'], ['thunderstorm', 'umbrella'],
    ['restless-waves', 'anchor'], ['restless-waves', 'swimRing'],
    ['man-in-the-fog', 'compass'], ['man-in-the-fog', 'spyglass'], ['man-in-the-fog', 'flashlight'],
  ])('supports %s with %s', (eventId, choiceId) => {
    const start = item();
    const output = item();
    const midpoint = item();
    expect(weatherItemUseDuration(eventId, choiceId)).toBeGreaterThanOrEqual(1.1);
    expect(sampleWeatherItemUse(eventId, choiceId, 0, start)).toBe(true);
    expect(start).toEqual(item());
    expect(sampleWeatherItemUse(eventId, choiceId, 0.5, midpoint)).toBe(true);
    expect(hasItemMotion(midpoint)).toBe(true);
    expect(sampleWeatherItemUse(eventId, choiceId, 1, output)).toBe(true);
    expect(output).toEqual(item());
  });

  it.each([
    ['windy-night', 'map'], ['thunderstorm', 'anchor'],
    ['restless-waves', 'anchor'], ['man-in-the-fog', 'flashlight'],
  ])('%s %s returns its borrowed transform before completion', (eventId, choiceId) => {
    const nearEnd = item();
    sampleWeatherItemUse(eventId, choiceId, 0.99, nearEnd);
    expect(Math.abs(nearEnd.x)).toBeLessThan(0.02);
    expect(Math.abs(nearEnd.y)).toBeLessThan(0.02);
    expect(Math.abs(nearEnd.z)).toBeLessThan(0.02);
    expect(Math.abs(nearEnd.yaw)).toBeLessThan(0.02);
    expect(Math.abs(nearEnd.pitch)).toBeLessThan(0.02);
    expect(Math.abs(nearEnd.roll)).toBeLessThan(0.02);
    expect(Math.abs(nearEnd.scaleX - 1)).toBeLessThan(0.02);
    expect(Math.abs(nearEnd.scaleY - 1)).toBeLessThan(0.02);
    expect(Math.abs(nearEnd.scaleZ - 1)).toBeLessThan(0.02);
  });
});
