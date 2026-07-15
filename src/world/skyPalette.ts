import { Color } from 'three';

export type SkyWeather = 'calm' | 'overcast' | 'squall';
export type SkyPhase = 'day' | 'night';

export interface SkyState {
  weather: SkyWeather;
  phase: SkyPhase;
  severity: number;
}

export interface SkyPalette {
  zenithColor: Color;
  upperColor: Color;
  horizonColor: Color;
  fogColor: Color;
  sunColor: Color;
  moonColor: Color;
  starColor: Color;
  ambientLightColor: Color;
  keyLightColor: Color;
  sunVisibility: number;
  moonVisibility: number;
  starVisibility: number;
  haze: number;
  exposure: number;
  ambientLightIntensity: number;
  keyLightIntensity: number;
  fogDensity: number;
}

type PaletteNumbers = Omit<SkyPalette,
  | 'zenithColor' | 'upperColor' | 'horizonColor' | 'fogColor'
  | 'sunColor' | 'moonColor' | 'starColor'
  | 'ambientLightColor' | 'keyLightColor'> & {
    zenithColor: number;
    upperColor: number;
    horizonColor: number;
    fogColor: number;
    sunColor: number;
    moonColor: number;
    starColor: number;
    ambientLightColor: number;
    keyLightColor: number;
  };

const BASE: Record<SkyWeather, Record<SkyPhase, PaletteNumbers>> = {
  calm: {
    day: {
      zenithColor: 0x245f80, upperColor: 0x5d8fa6, horizonColor: 0xb5c1bb,
      fogColor: 0x829b9e, sunColor: 0xffdda0, moonColor: 0xdce5e8,
      starColor: 0xe9f0f2, ambientLightColor: 0xb9ced0, keyLightColor: 0xffd8aa,
      sunVisibility: 1, moonVisibility: 0, starVisibility: 0, haze: 0.12,
      exposure: 0.94, ambientLightIntensity: 1.05, keyLightIntensity: 2.05,
      fogDensity: 0.012,
    },
    night: {
      zenithColor: 0x030814, upperColor: 0x0b1c31, horizonColor: 0x23394b,
      fogColor: 0x0e1822, sunColor: 0xffdda0, moonColor: 0xd8e2e5,
      starColor: 0xe8eef0, ambientLightColor: 0x788f9e, keyLightColor: 0xa8c0ce,
      sunVisibility: 0, moonVisibility: 0.82, starVisibility: 0.72, haze: 0.18,
      exposure: 0.5, ambientLightIntensity: 0.26, keyLightIntensity: 0.2,
      fogDensity: 0.021,
    },
  },
  overcast: {
    day: {
      zenithColor: 0x344b57, upperColor: 0x596b72, horizonColor: 0x929b99,
      fogColor: 0x657d80, sunColor: 0xd4cdb9, moonColor: 0xc6d0d4,
      starColor: 0xd8e0e2, ambientLightColor: 0xa8b8b7, keyLightColor: 0xcac2af,
      sunVisibility: 0.22, moonVisibility: 0, starVisibility: 0, haze: 0.68,
      exposure: 0.72, ambientLightIntensity: 0.68, keyLightIntensity: 1.0,
      fogDensity: 0.019,
    },
    night: {
      zenithColor: 0x070d16, upperColor: 0x14202c, horizonColor: 0x33414a,
      fogColor: 0x111c25, sunColor: 0xffdda0, moonColor: 0xc3ced2,
      starColor: 0xd4dcdf, ambientLightColor: 0x6e828e, keyLightColor: 0x96acb8,
      sunVisibility: 0, moonVisibility: 0.28, starVisibility: 0.12, haze: 0.72,
      exposure: 0.38, ambientLightIntensity: 0.24, keyLightIntensity: 0.18,
      fogDensity: 0.024,
    },
  },
  squall: {
    day: {
      zenithColor: 0x16232b, upperColor: 0x29343a, horizonColor: 0x596064,
      fogColor: 0x2b383e, sunColor: 0xbdb6a3, moonColor: 0xb5c0c5,
      starColor: 0xc5ced1, ambientLightColor: 0x89999b, keyLightColor: 0xbcb5a3,
      sunVisibility: 0.08, moonVisibility: 0, starVisibility: 0, haze: 0.92,
      exposure: 0.62, ambientLightIntensity: 0.44, keyLightIntensity: 0.58,
      fogDensity: 0.03,
    },
    night: {
      zenithColor: 0x02050a, upperColor: 0x07101a, horizonColor: 0x182630,
      fogColor: 0x0c1720, sunColor: 0xffdda0, moonColor: 0xa9b5bb,
      starColor: 0xb9c3c7, ambientLightColor: 0x596b76, keyLightColor: 0x849aa7,
      sunVisibility: 0, moonVisibility: 0.07, starVisibility: 0.02, haze: 0.95,
      exposure: 0.26, ambientLightIntensity: 0.16, keyLightIntensity: 0.18,
      fogDensity: 0.034,
    },
  },
};

const COLOR_KEYS = [
  'zenithColor', 'upperColor', 'horizonColor', 'fogColor', 'sunColor',
  'moonColor', 'starColor', 'ambientLightColor', 'keyLightColor',
] as const;

const SCALAR_KEYS = [
  'sunVisibility', 'moonVisibility', 'starVisibility', 'haze', 'exposure',
  'ambientLightIntensity', 'keyLightIntensity', 'fogDensity',
] as const;

const SINKING_ZENITH = new Color(0x091118);
const SINKING_UPPER = new Color(0x111c24);
const SINKING_HORIZON = new Color(0x303a3e);

const clamp01 = (value: number): number => Number.isFinite(value)
  ? Math.min(1, Math.max(0, value))
  : 0;

function isWeather(value: unknown): value is SkyWeather {
  return value === 'calm' || value === 'overcast' || value === 'squall';
}

function isPhase(value: unknown): value is SkyPhase {
  return value === 'day' || value === 'night';
}

function materialize(source: PaletteNumbers, out?: SkyPalette): SkyPalette {
  if (out) {
    for (const key of COLOR_KEYS) out[key].setHex(source[key]);
    for (const key of SCALAR_KEYS) out[key] = source[key];
    return out;
  }

  return {
    ...source,
    zenithColor: new Color(source.zenithColor), upperColor: new Color(source.upperColor),
    horizonColor: new Color(source.horizonColor), fogColor: new Color(source.fogColor),
    sunColor: new Color(source.sunColor), moonColor: new Color(source.moonColor),
    starColor: new Color(source.starColor), ambientLightColor: new Color(source.ambientLightColor),
    keyLightColor: new Color(source.keyLightColor),
  };
}

export function cloneSkyPalette(source: SkyPalette): SkyPalette {
  return {
    ...source,
    zenithColor: source.zenithColor.clone(), upperColor: source.upperColor.clone(),
    horizonColor: source.horizonColor.clone(), fogColor: source.fogColor.clone(),
    sunColor: source.sunColor.clone(), moonColor: source.moonColor.clone(),
    starColor: source.starColor.clone(), ambientLightColor: source.ambientLightColor.clone(),
    keyLightColor: source.keyLightColor.clone(),
  };
}

export function skyPaletteFor(state: SkyState, reusableOut?: SkyPalette): SkyPalette {
  const weather = isWeather(state?.weather) ? state.weather : 'calm';
  const phase = isPhase(state?.phase) ? state.phase : 'day';
  const palette = materialize(BASE[weather][phase], reusableOut);
  const severity = clamp01(state?.severity);
  if (weather === 'squall' && phase === 'day' && severity > 0) {
    palette.zenithColor.lerp(SINKING_ZENITH, severity * 0.55);
    palette.upperColor.lerp(SINKING_UPPER, severity * 0.42);
    palette.horizonColor.lerp(SINKING_HORIZON, severity * 0.25);
    palette.exposure *= 1 - severity * 0.3;
    palette.sunVisibility *= 1 - severity * 0.6;
    palette.haze = clamp01(palette.haze + severity * 0.16);
    palette.fogDensity += severity * 0.009;
    palette.ambientLightIntensity *= 1 - severity * 0.15;
    palette.keyLightIntensity *= 1 - severity * 0.2;
  }
  return palette;
}

export function lerpSkyPalette(
  out: SkyPalette,
  from: SkyPalette,
  to: SkyPalette,
  alpha: number,
): SkyPalette {
  const t = clamp01(alpha);
  for (const key of COLOR_KEYS) out[key].copy(from[key]).lerp(to[key], t);
  for (const key of SCALAR_KEYS) out[key] = from[key] + (to[key] - from[key]) * t;
  return out;
}
