import { Vector2 } from 'three';
import type { SkyWeather } from './skyPalette';

export interface VolumetricCloudProfile {
  readonly coverage: number;
  readonly density: number;
  readonly baseHeight: number;
  readonly topHeight: number;
  readonly shapeScale: number;
  readonly detailScale: number;
  readonly erosion: number;
  readonly wind: Readonly<Vector2>;
  readonly ambient: number;
  readonly extinction: number;
}

function profile(
  values: Omit<VolumetricCloudProfile, 'wind'> & { readonly wind: readonly [number, number] },
): Readonly<VolumetricCloudProfile> {
  return Object.freeze({
    ...values,
    wind: Object.freeze(new Vector2(...values.wind)),
  });
}

const PROFILES: Readonly<Record<SkyWeather, Readonly<VolumetricCloudProfile>>> =
  Object.freeze({
    calm: profile({
      coverage: 0.34,
      density: 1,
      baseHeight: 90,
      topHeight: 420,
      shapeScale: 0.0022,
      detailScale: 0.014,
      erosion: 0.28,
      wind: [1.3, 0.45],
      ambient: 0.48,
      extinction: 0.014,
    }),
    overcast: profile({
      coverage: 0.68,
      density: 1.15,
      baseHeight: 72,
      topHeight: 360,
      shapeScale: 0.0019,
      detailScale: 0.015,
      erosion: 0.22,
      wind: [2.2, 0.8],
      ambient: 0.38,
      extinction: 0.017,
    }),
    squall: profile({
      coverage: 0.82,
      density: 1.35,
      baseHeight: 55,
      topHeight: 560,
      shapeScale: 0.0024,
      detailScale: 0.018,
      erosion: 0.16,
      wind: [4.4, 1.7],
      ambient: 0.24,
      extinction: 0.022,
    }),
  });

export function volumetricCloudProfile(
  weather: SkyWeather,
): Readonly<VolumetricCloudProfile> {
  return PROFILES[weather];
}
