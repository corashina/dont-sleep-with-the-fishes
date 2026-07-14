import { describe, expect, it } from 'vitest';
import {
  cloneSkyPalette,
  lerpSkyPalette,
  skyPaletteFor,
} from '../src/world/skyPalette';

describe('skyPaletteFor', () => {
  it.each([
    ['calm', 'day'],
    ['overcast', 'day'],
    ['squall', 'day'],
    ['calm', 'night'],
    ['overcast', 'night'],
    ['squall', 'night'],
  ] as const)('returns a bounded %s %s palette', (weather, phase) => {
    const palette = skyPaletteFor({ weather, phase, severity: 0 });
    expect(palette.fogDensity).toBeGreaterThan(0);
    expect(palette.exposure).toBeGreaterThan(0);
    for (const value of [
      palette.sunVisibility,
      palette.moonVisibility,
      palette.starVisibility,
      palette.haze,
    ]) expect(value).toBeGreaterThanOrEqual(0);
  });

  it('uses sun by day and moon plus stars by night', () => {
    const day = skyPaletteFor({ weather: 'calm', phase: 'day', severity: 0 });
    const night = skyPaletteFor({ weather: 'calm', phase: 'night', severity: 0 });
    expect(day.sunVisibility).toBeGreaterThan(0.8);
    expect(day.moonVisibility).toBe(0);
    expect(day.starVisibility).toBe(0);
    expect(night.sunVisibility).toBe(0);
    expect(night.moonVisibility).toBeGreaterThan(0.7);
    expect(night.starVisibility).toBeGreaterThan(0.7);
  });

  it('raises haze and suppresses celestial light in a squall', () => {
    const calm = skyPaletteFor({ weather: 'calm', phase: 'night', severity: 0 });
    const squall = skyPaletteFor({ weather: 'squall', phase: 'night', severity: 0 });
    expect(squall.haze).toBeGreaterThan(calm.haze);
    expect(squall.moonVisibility).toBeLessThan(calm.moonVisibility);
    expect(squall.starVisibility).toBeLessThan(calm.starVisibility);
  });

  it('clamps sinking severity and darkens the squall day', () => {
    const start = skyPaletteFor({ weather: 'squall', phase: 'day', severity: -1 });
    const end = skyPaletteFor({ weather: 'squall', phase: 'day', severity: 2 });
    expect(end.exposure).toBeLessThan(start.exposure);
    expect(end.fogDensity).toBeGreaterThan(start.fogDensity);
    expect(end.zenithColor.getHex()).not.toBe(start.zenithColor.getHex());
  });

  it('falls back to calm day for invalid runtime state', () => {
    const fallback = skyPaletteFor({
      weather: 'invalid',
      phase: 'invalid',
      severity: Number.NaN,
    } as never);
    const calmDay = skyPaletteFor({ weather: 'calm', phase: 'day', severity: 0 });
    expect(fallback).toEqual(calmDay);
  });

  it('interpolates colors and scalars without mutating endpoints', () => {
    const from = skyPaletteFor({ weather: 'calm', phase: 'day', severity: 0 });
    const to = skyPaletteFor({ weather: 'squall', phase: 'night', severity: 0 });
    const out = cloneSkyPalette(from);
    const fromHex = from.zenithColor.getHex();
    const toHex = to.zenithColor.getHex();
    lerpSkyPalette(out, from, to, 0.5);
    expect(out.zenithColor.getHex()).not.toBe(fromHex);
    expect(out.zenithColor.getHex()).not.toBe(toHex);
    expect(out.fogDensity).toBeCloseTo((from.fogDensity + to.fogDensity) / 2);
    expect(from.zenithColor.getHex()).toBe(fromHex);
    expect(to.zenithColor.getHex()).toBe(toHex);
  });
});
