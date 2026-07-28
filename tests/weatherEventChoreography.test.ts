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
    const output = item();
    expect(weatherItemUseDuration(eventId, choiceId)).toBeGreaterThanOrEqual(1.1);
    expect(sampleWeatherItemUse(eventId, choiceId, 0.5, output)).toBe(true);
    expect(sampleWeatherItemUse(eventId, choiceId, 1, output)).toBe(true);
    expect(output).toEqual(item());
  });
});
