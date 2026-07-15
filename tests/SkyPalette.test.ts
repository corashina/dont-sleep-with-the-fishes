import { describe, expect, it } from 'vitest';
import {
  cloneSkyPalette,
  lerpSkyPalette,
  skyPaletteFor,
} from '../src/world/skyPalette';

const authoredPalettes = [
  {
    weather: 'calm', phase: 'day', expected: {
      zenithColor: 0x245f80, upperColor: 0x5d8fa6, horizonColor: 0xb5c1bb,
      fogColor: 0x829b9e, sunColor: 0xffdda0, moonColor: 0xdce5e8,
      starColor: 0xe9f0f2, ambientLightColor: 0xb9ced0, keyLightColor: 0xffd8aa,
      sunVisibility: 1, moonVisibility: 0, starVisibility: 0, haze: 0.12,
      exposure: 0.94, ambientLightIntensity: 1.05, keyLightIntensity: 2.05,
      fogDensity: 0.012,
    },
  },
  {
    weather: 'calm', phase: 'night', expected: {
      zenithColor: 0x030814, upperColor: 0x0b1c31, horizonColor: 0x23394b,
      fogColor: 0x0e1822, sunColor: 0xffdda0, moonColor: 0xd8e2e5,
      starColor: 0xe8eef0, ambientLightColor: 0x788f9e, keyLightColor: 0xa8c0ce,
      sunVisibility: 0, moonVisibility: 0.82, starVisibility: 0.72, haze: 0.18,
      exposure: 0.5, ambientLightIntensity: 0.26, keyLightIntensity: 0.2,
      fogDensity: 0.021,
    },
  },
  {
    weather: 'overcast', phase: 'day', expected: {
      zenithColor: 0x344b57, upperColor: 0x596b72, horizonColor: 0x929b99,
      fogColor: 0x657d80, sunColor: 0xd4cdb9, moonColor: 0xc6d0d4,
      starColor: 0xd8e0e2, ambientLightColor: 0xa8b8b7, keyLightColor: 0xcac2af,
      sunVisibility: 0.22, moonVisibility: 0, starVisibility: 0, haze: 0.68,
      exposure: 0.72, ambientLightIntensity: 0.68, keyLightIntensity: 1,
      fogDensity: 0.019,
    },
  },
  {
    weather: 'overcast', phase: 'night', expected: {
      zenithColor: 0x070d16, upperColor: 0x14202c, horizonColor: 0x33414a,
      fogColor: 0x111c25, sunColor: 0xffdda0, moonColor: 0xc3ced2,
      starColor: 0xd4dcdf, ambientLightColor: 0x6e828e, keyLightColor: 0x96acb8,
      sunVisibility: 0, moonVisibility: 0.28, starVisibility: 0.12, haze: 0.72,
      exposure: 0.38, ambientLightIntensity: 0.24, keyLightIntensity: 0.18,
      fogDensity: 0.024,
    },
  },
  {
    weather: 'squall', phase: 'day', expected: {
      zenithColor: 0x16232b, upperColor: 0x29343a, horizonColor: 0x596064,
      fogColor: 0x2b383e, sunColor: 0xbdb6a3, moonColor: 0xb5c0c5,
      starColor: 0xc5ced1, ambientLightColor: 0x89999b, keyLightColor: 0xbcb5a3,
      sunVisibility: 0.08, moonVisibility: 0, starVisibility: 0, haze: 0.92,
      exposure: 0.62, ambientLightIntensity: 0.44, keyLightIntensity: 0.58,
      fogDensity: 0.03,
    },
  },
  {
    weather: 'squall', phase: 'night', expected: {
      zenithColor: 0x02050a, upperColor: 0x07101a, horizonColor: 0x182630,
      fogColor: 0x0c1720, sunColor: 0xffdda0, moonColor: 0xa9b5bb,
      starColor: 0xb9c3c7, ambientLightColor: 0x596b76, keyLightColor: 0x849aa7,
      sunVisibility: 0, moonVisibility: 0.07, starVisibility: 0.02, haze: 0.95,
      exposure: 0.26, ambientLightIntensity: 0.16, keyLightIntensity: 0.18,
      fogDensity: 0.034,
    },
  },
] as const;

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

  it.each(authoredPalettes)(
    'matches the exact authored $weather $phase palette',
    ({ weather, phase, expected }) => {
      const palette = skyPaletteFor({ weather, phase, severity: 0 });
      expect({
        zenithColor: palette.zenithColor.getHex(),
        upperColor: palette.upperColor.getHex(),
        horizonColor: palette.horizonColor.getHex(),
        fogColor: palette.fogColor.getHex(),
        sunColor: palette.sunColor.getHex(),
        moonColor: palette.moonColor.getHex(),
        starColor: palette.starColor.getHex(),
        ambientLightColor: palette.ambientLightColor.getHex(),
        keyLightColor: palette.keyLightColor.getHex(),
        sunVisibility: palette.sunVisibility,
        moonVisibility: palette.moonVisibility,
        starVisibility: palette.starVisibility,
        haze: palette.haze,
        exposure: palette.exposure,
        ambientLightIntensity: palette.ambientLightIntensity,
        keyLightIntensity: palette.keyLightIntensity,
        fogDensity: palette.fogDensity,
      }).toEqual(expected);
    },
  );

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

  it('orders celestial visibility and haze from calm through squall', () => {
    const calmDay = skyPaletteFor({ weather: 'calm', phase: 'day', severity: 0 });
    const overcastDay = skyPaletteFor({ weather: 'overcast', phase: 'day', severity: 0 });
    const squallDay = skyPaletteFor({ weather: 'squall', phase: 'day', severity: 0 });
    const calmNight = skyPaletteFor({ weather: 'calm', phase: 'night', severity: 0 });
    const overcastNight = skyPaletteFor({ weather: 'overcast', phase: 'night', severity: 0 });
    const squallNight = skyPaletteFor({ weather: 'squall', phase: 'night', severity: 0 });

    expect(calmDay.sunVisibility).toBeGreaterThan(overcastDay.sunVisibility);
    expect(overcastDay.sunVisibility).toBeGreaterThan(squallDay.sunVisibility);
    expect(calmNight.moonVisibility).toBeGreaterThan(overcastNight.moonVisibility);
    expect(overcastNight.moonVisibility).toBeGreaterThan(squallNight.moonVisibility);
    expect(calmNight.starVisibility).toBeGreaterThan(overcastNight.starVisibility);
    expect(overcastNight.starVisibility).toBeGreaterThan(squallNight.starVisibility);
    expect(calmDay.haze).toBeLessThan(overcastDay.haze);
    expect(overcastDay.haze).toBeLessThan(squallDay.haze);
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
