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
      coverage: 0.48,
      density: 0.58,
      baseHeight: 145,
      topHeight: 280,
      shapeScale: 0.0042,
      detailScale: 0.018,
      erosion: 0.34,
      wind: [1.3, 0.45],
      ambient: 0.72,
      extinction: 0.011,
    }),
    overcast: profile({
      coverage: 0.72,
      density: 0.82,
      baseHeight: 112,
      topHeight: 260,
      shapeScale: 0.0048,
      detailScale: 0.021,
      erosion: 0.27,
      wind: [2.2, 0.8],
      ambient: 0.6,
      extinction: 0.014,
    }),
    squall: profile({
      coverage: 0.9,
      density: 1.08,
      baseHeight: 82,
      topHeight: 235,
      shapeScale: 0.0055,
      detailScale: 0.025,
      erosion: 0.19,
      wind: [4.4, 1.7],
      ambient: 0.45,
      extinction: 0.018,
    }),
  });

export function volumetricCloudProfile(
  weather: SkyWeather,
): Readonly<VolumetricCloudProfile> {
  return PROFILES[weather];
}
