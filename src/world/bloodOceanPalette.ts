import { Color } from 'three';
import type { SkyPalette } from './skyPalette';

const ZENITH = new Color('#080407');
const UPPER = new Color('#260e10');
const HORIZON = new Color('#781e1b');
const FOG = new Color('#490e10');
const STARS = new Color('#e3ded0');
const AMBIENT = new Color('#a696a5');
const KEY = new Color('#c9c4ba');

/** Apply to a fresh palette so transitions never accumulate the tint. */
export function applyBloodOceanPalette(palette: SkyPalette, intensity: number): void {
  const amount = Math.min(1, Math.max(0, intensity));
  palette.zenithColor.lerp(ZENITH, amount);
  palette.upperColor.lerp(UPPER, amount);
  palette.horizonColor.lerp(HORIZON, amount);
  palette.fogColor.lerp(FOG, amount);
  palette.starColor.lerp(STARS, amount);
  palette.ambientLightColor.lerp(AMBIENT, amount);
  palette.keyLightColor.lerp(KEY, amount);
  palette.starVisibility += (0.8 - palette.starVisibility) * amount;
  palette.sunVisibility *= 1 - amount;
  palette.moonVisibility *= 1 - amount;
  palette.cloudCoverage *= 1 - amount;
  palette.horizonBandStrength *= 1 - amount;
  palette.haze += (0.12 - palette.haze) * amount;
  palette.fogDensity += (0.022 - palette.fogDensity) * amount;
}
