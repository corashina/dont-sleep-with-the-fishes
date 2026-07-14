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
      zenithColor: 0x367797, upperColor: 0x6394a5, horizonColor: 0xa7b8b2,
      fogColor: 0x789499, sunColor: 0xffdfa3, moonColor: 0xe7eef3,
      starColor: 0xf4f7f8, ambientLightColor: 0xbdd3d2, keyLightColor: 0xffddb0,
      sunVisibility: 1, moonVisibility: 0, starVisibility: 0, haze: 0.16,
      exposure: 1, ambientLightIntensity: 1.1, keyLightIntensity: 2.2, fogDensity: 0.012,
    },
    night: {
      zenithColor: 0x07111f, upperColor: 0x10233a, horizonColor: 0x273e50,
      fogColor: 0x101922, sunColor: 0xffdfa3, moonColor: 0xd8e6ee,
      starColor: 0xeaf2f5, ambientLightColor: 0x8298a7, keyLightColor: 0xa9c6d8,
      sunVisibility: 0, moonVisibility: 0.9, starVisibility: 1, haze: 0.2,
      exposure: 0.55, ambientLightIntensity: 0.28, keyLightIntensity: 0.22, fogDensity: 0.022,
    },
  },
  overcast: {
    day: {
      zenithColor: 0x304a59, upperColor: 0x526b76, horizonColor: 0x7f8d8f,
      fogColor: 0x59777c, sunColor: 0xd8d1bb, moonColor: 0xcbd8df,
      starColor: 0xdbe5e8, ambientLightColor: 0xaebfbe, keyLightColor: 0xd1c9b5,
      sunVisibility: 0.32, moonVisibility: 0, starVisibility: 0, haze: 0.52,
      exposure: 0.78, ambientLightIntensity: 0.72, keyLightIntensity: 1.15, fogDensity: 0.018,
    },
    night: {
      zenithColor: 0x09121c, upperColor: 0x172432, horizonColor: 0x303e49,
      fogColor: 0x101922, sunColor: 0xffdfa3, moonColor: 0xc5d2da,
      starColor: 0xd7e1e5, ambientLightColor: 0x758995, keyLightColor: 0x9db4c2,
      sunVisibility: 0, moonVisibility: 0.42, starVisibility: 0.35, haze: 0.58,
      exposure: 0.43, ambientLightIntensity: 0.28, keyLightIntensity: 0.22, fogDensity: 0.022,
    },
  },
  squall: {
    day: {
      zenithColor: 0x18262e, upperColor: 0x27343b, horizonColor: 0x4b565a,
      fogColor: 0x27343b, sunColor: 0xc7c0aa, moonColor: 0xb9c8d0,
      starColor: 0xcbd5d9, ambientLightColor: 0x8fa0a1, keyLightColor: 0xc7c0aa,
      sunVisibility: 0.16, moonVisibility: 0, starVisibility: 0, haze: 0.84,
      exposure: 0.72, ambientLightIntensity: 0.48, keyLightIntensity: 0.7, fogDensity: 0.028,
    },
    night: {
      zenithColor: 0x030811, upperColor: 0x0a1420, horizonColor: 0x1b2833,
      fogColor: 0x101922, sunColor: 0xffdfa3, moonColor: 0xaebec8,
      starColor: 0xc2cdd2, ambientLightColor: 0x60727e, keyLightColor: 0x8ea5b5,
      sunVisibility: 0, moonVisibility: 0.16, starVisibility: 0.08, haze: 0.9,
      exposure: 0.3, ambientLightIntensity: 0.18, keyLightIntensity: 0.22, fogDensity: 0.032,
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
