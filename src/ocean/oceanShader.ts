import {
  Color,
  type IUniform,
  Matrix4,
  Vector2,
  Vector3,
  Vector4,
} from 'three';
import type { WaterQuality } from '../rendering/waterQuality';
import {
  UNBOUNDED_MAXIMUM_LOCAL_Y,
  UNBOUNDED_MINIMUM_LOCAL_Y,
} from './WaterExclusion';
import {
  DEFAULT_WAVES,
  createWaveUniformPayload,
} from './WaveField';

export const MAX_OCEAN_EXCLUSIONS = 2;

export interface OceanShaderUniforms {
  [name: string]: IUniform;
  uTime: IUniform<number>;
  uAmplitudeScale: IUniform<number>;
  uOrigin: IUniform<Vector2>;
  uDetailFade: IUniform<Vector2>;
  uDirections: IUniform<Vector2[]>;
  uParameters: IUniform<Vector4[]>;
  uPhases: IUniform<number[]>;
  uVortexCenter: IUniform<Vector2>;
  uVortexRadius: IUniform<number>;
  uVortexDepression: IUniform<number>;
  uVortexTangentStrength: IUniform<number>;
  uVortexPhase: IUniform<number>;
  uVortexStrength: IUniform<number>;
  uDeepColor: IUniform<Color>;
  uShallowColor: IUniform<Color>;
  uFoamColor: IUniform<Color>;
  uFogColor: IUniform<Color>;
  uSkyColor: IUniform<Color>;
  uHorizonColor: IUniform<Color>;
  uHorizonFog: IUniform<Vector3>;
  uSunColor: IUniform<Color>;
  uDirectLightStrength: IUniform<number>;
  uFogDensity: IUniform<number>;
  uLightDirection: IUniform<Vector3>;
  uExclusionCount: IUniform<number>;
  uExclusionWorldToLocal: IUniform<Matrix4[]>;
  uExclusionBounds: IUniform<Vector4[]>;
  uExclusionLowerBounds: IUniform<Vector4[]>;
  uExclusionTaperStarts: IUniform<Vector2[]>;
  uExclusionLowerTaperStarts: IUniform<Vector2[]>;
  uExclusionMinimumLocalYs: IUniform<number[]>;
  uExclusionUpperLocalYs: IUniform<number[]>;
}

interface OceanShaderQuality {
  readonly deepColor: number;
  readonly shallowColor: number;
  readonly foamColor: number;
  readonly detailFade: readonly [number, number];
  readonly horizonFog: readonly [number, number, number];
  readonly defines: Readonly<Record<string, number>>;
}

const LOW_DEFINES = Object.freeze({});
const HIGH_DEFINES = Object.freeze({ HIGH_QUALITY_WATER: 1 });
const ULTRA_DEFINES = Object.freeze({
  HIGH_QUALITY_WATER: 1,
  ULTRA_QUALITY_WATER: 1,
});

const OCEAN_SHADER_QUALITY = Object.freeze({
  low: Object.freeze({
    deepColor: 0x162c35,
    shallowColor: 0x42656a,
    foamColor: 0xb7b7a5,
    detailFade: Object.freeze([28, 92] as const),
    horizonFog: Object.freeze([150, 650, 0.86] as const),
    defines: LOW_DEFINES,
  }),
  high: Object.freeze({
    deepColor: 0x073844,
    shallowColor: 0x35a6a0,
    foamColor: 0xd4ded4,
    detailFade: Object.freeze([40, 128] as const),
    horizonFog: Object.freeze([180, 750, 0.82] as const),
    defines: HIGH_DEFINES,
  }),
  ultra: Object.freeze({
    deepColor: 0x062932,
    shallowColor: 0x2f7377,
    foamColor: 0xc6cdc4,
    detailFade: Object.freeze([52, 160] as const),
    horizonFog: Object.freeze([210, 820, 0.78] as const),
    defines: ULTRA_DEFINES,
  }),
}) satisfies Readonly<Record<WaterQuality, OceanShaderQuality>>;

export const OCEAN_VERTEX_SHADER = `
  uniform float uTime;
  uniform float uAmplitudeScale;
  uniform vec2 uOrigin;
  uniform vec2 uDirections[4];
  uniform vec4 uParameters[4];
  uniform float uPhases[4];
  uniform vec2 uVortexCenter;
  uniform float uVortexRadius;
  uniform float uVortexDepression;
  uniform float uVortexTangentStrength;
  uniform float uVortexPhase;
  uniform float uVortexStrength;
  varying float vViewDepth;
  varying vec2 vOceanPosition;
  varying vec3 vWorldPosition;

  void main() {
    vec3 displaced = position;
    vec2 worldXZ = position.xz + uOrigin;
    vec4 baseWorldPosition = modelMatrix * vec4(position, 1.0);
    float geometryLod = smoothstep(
      55.0,
      140.0,
      length(cameraPosition - baseWorldPosition.xyz)
    );
    float height = 0.0;
    for (int i = 0; i < 4; i++) {
      vec2 direction = normalize(uDirections[i]);
      float wavelength = uParameters[i].y;
      float resolvedGeometryWave = smoothstep(4.0, 11.0, wavelength);
      float geometryWeight = mix(1.0, resolvedGeometryWave, geometryLod);
      float amplitude = uParameters[i].x * uAmplitudeScale * geometryWeight;
      float waveNumber = 6.28318530718 / wavelength;
      float theta = waveNumber * dot(direction, worldXZ) + uParameters[i].z * uTime + uPhases[i];
      float waveSin = sin(theta);
      float waveCos = cos(theta);
      height += amplitude * waveSin;
      displaced.x += uParameters[i].w * amplitude * direction.x * waveCos;
      displaced.z += uParameters[i].w * amplitude * direction.y * waveCos;
    }
    vec2 vortexDelta = worldXZ - uVortexCenter;
    float vortexDistance = length(vortexDelta);
    float vortexRadius = max(0.001, uVortexRadius);
    float envelopeT = clamp(1.0 - vortexDistance / vortexRadius, 0.0, 1.0);
    float envelope = envelopeT * envelopeT * (3.0 - 2.0 * envelopeT) * uVortexStrength;
    float inverseDistance = vortexDistance > 0.0001 ? 1.0 / vortexDistance : 0.0;
    vec2 radial = vortexDelta * inverseDistance;
    float swirl = 0.78 + 0.22 * sin(uVortexPhase + vortexDistance * 0.65);
    height -= uVortexDepression * envelope;
    displaced.x += -radial.y * uVortexTangentStrength * envelope * swirl;
    displaced.z += radial.x * uVortexTangentStrength * envelope * swirl;
    displaced.y += height;
    vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
    vViewDepth = length(cameraPosition - worldPosition.xyz);
    vOceanPosition = worldXZ;
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

export const OCEAN_FRAGMENT_SHADER = `
  uniform float uTime;
  uniform float uAmplitudeScale;
  uniform vec2 uDetailFade;
  uniform vec2 uDirections[4];
  uniform vec4 uParameters[4];
  uniform float uPhases[4];
  uniform vec2 uVortexCenter;
  uniform float uVortexRadius;
  uniform float uVortexDepression;
  uniform float uVortexStrength;
  uniform vec3 uDeepColor;
  uniform vec3 uShallowColor;
  uniform vec3 uFoamColor;
  uniform vec3 uFogColor;
  uniform vec3 uSkyColor;
  uniform vec3 uHorizonColor;
  uniform vec3 uHorizonFog;
  uniform vec3 uSunColor;
  uniform float uDirectLightStrength;
  uniform float uFogDensity;
  uniform vec3 uLightDirection;
  uniform int uExclusionCount;
  uniform mat4 uExclusionWorldToLocal[2];
  uniform vec4 uExclusionBounds[2];
  uniform vec4 uExclusionLowerBounds[2];
  uniform vec2 uExclusionTaperStarts[2];
  uniform vec2 uExclusionLowerTaperStarts[2];
  uniform float uExclusionMinimumLocalYs[2];
  uniform float uExclusionUpperLocalYs[2];
  varying float vViewDepth;
  varying vec2 vOceanPosition;
  varying vec3 vWorldPosition;

  void sampleSurfaceWave(
    vec2 worldPosition,
    out float height,
    out vec2 derivative
  ) {
    height = 0.0;
    derivative = vec2(0.0);
    for (int i = 0; i < 4; i++) {
      vec2 direction = normalize(uDirections[i]);
      float amplitude = uParameters[i].x * uAmplitudeScale;
      float waveNumber = 6.28318530718 / uParameters[i].y;
      float theta = waveNumber * dot(direction, worldPosition)
        + uParameters[i].z * uTime
        + uPhases[i];
      float waveCos = cos(theta);
      height += amplitude * sin(theta);
      derivative += amplitude * waveNumber * direction * waveCos;
    }

    vec2 vortexDelta = worldPosition - uVortexCenter;
    float vortexDistance = length(vortexDelta);
    float vortexRadius = max(0.001, uVortexRadius);
    float envelopeT = clamp(1.0 - vortexDistance / vortexRadius, 0.0, 1.0);
    float envelope = envelopeT * envelopeT
      * (3.0 - 2.0 * envelopeT)
      * uVortexStrength;
    float inverseDistance = vortexDistance > 0.0001
      ? 1.0 / vortexDistance
      : 0.0;
    vec2 radial = vortexDelta * inverseDistance;
    float envelopeDerivative =
      vortexDistance > 0.0001 && vortexDistance < vortexRadius
        ? -6.0 * envelopeT * (1.0 - envelopeT)
          * uVortexStrength / vortexRadius
        : 0.0;
    height -= uVortexDepression * envelope;
    derivative -= uVortexDepression * envelopeDerivative * radial;
  }

  float bayer2(vec2 cell) {
    return 2.0 * cell.x + 3.0 * cell.y - 4.0 * cell.x * cell.y;
  }

  float orderedDither(vec2 position) {
    vec2 cell = mod(floor(position), 4.0);
    vec2 lowBits = mod(cell, 2.0);
    vec2 highBits = floor(cell / 2.0);
    float threshold = 4.0 * bayer2(lowBits) + bayer2(highBits);
    return (threshold - 7.5) / (16.0 * 255.0);
  }

  vec2 windWarp(vec2 worldPosition) {
    vec2 wind = normalize(vec2(0.83, 0.56));
    vec2 crossWind = vec2(-wind.y, wind.x);
    float broad = sin(dot(worldPosition, crossWind) * 0.31 + uTime * 0.22);
    float crossing = sin(dot(worldPosition, wind) * 0.47 - uTime * 0.17);
    return wind * broad * 0.42 + crossWind * crossing * 0.24;
  }

  vec2 warpedDetailSlope(vec2 worldPosition) {
    vec2 wind = normalize(vec2(0.83, 0.56));
    vec2 crossWind = vec2(-wind.y, wind.x);
    vec2 quartering = normalize(vec2(0.24, -0.97));
    vec2 opposing = normalize(vec2(-0.68, 0.73));
    vec2 warped = worldPosition + windWarp(worldPosition);

    float mediumA = cos(dot(warped, wind) * 2.45 + uTime * 1.58);
    float mediumB = cos(dot(warped, crossWind) * 4.15 - uTime * 1.91);
    float fineA = cos(dot(warped, quartering) * 7.35 + uTime * 2.43);
    float fineB = cos(dot(warped, opposing) * 11.8 - uTime * 2.87);

    vec2 slope = wind * mediumA * 0.072
      + crossWind * mediumB * 0.042
      + quartering * fineA * 0.021
      + opposing * fineB * 0.011;
    float distanceFade = 1.0 - smoothstep(uDetailFade.x, uDetailFade.y, vViewDepth);
    float weatherStrength = clamp(0.92 + (uAmplitudeScale - 1.0) * 0.32, 0.78, 1.18);
    return slope * distanceFade * weatherStrength;
  }

  #ifdef HIGH_QUALITY_WATER
  vec2 highQualityRippleSlope(vec2 worldPosition) {
    vec2 wind = normalize(vec2(0.83, 0.56));
    vec2 crossWind = vec2(-wind.y, wind.x);
    vec2 quartering = normalize(vec2(-0.31, 0.95));
    vec2 opposing = normalize(vec2(0.91, -0.41));
    vec2 warped = worldPosition + windWarp(worldPosition) * 0.58;

    float bandA = cos(dot(warped, wind) * 9.6 + uTime * 2.55);
    float bandB = cos(dot(warped, crossWind) * 15.4 - uTime * 3.35);
    float bandC = cos(dot(warped, quartering) * 24.8 + uTime * 4.35);
    float bandD = cos(dot(warped, opposing) * 36.2 - uTime * 5.45);
    vec2 slope = wind * bandA * 0.028
      + crossWind * bandB * 0.022
      + quartering * bandC * 0.015
      + opposing * bandD * 0.009;
    float distanceFade = 1.0 - smoothstep(
      uDetailFade.x * 0.66,
      uDetailFade.y * 0.84,
      vViewDepth
    );
    float weatherStrength = clamp(
      0.88 + (uAmplitudeScale - 1.0) * 0.24,
      0.74,
      1.12
    );
    return slope * distanceFade * weatherStrength;
  }
  #endif

  #ifdef ULTRA_QUALITY_WATER
  vec2 ultraQualityMicroSlope(vec2 worldPosition) {
    vec2 wind = normalize(vec2(0.83, 0.56));
    vec2 crossWind = vec2(-wind.y, wind.x);
    vec2 quartering = normalize(vec2(0.58, -0.82));
    vec2 opposing = normalize(vec2(-0.76, 0.65));
    vec2 warped = worldPosition + windWarp(worldPosition) * 0.36;

    float bandA = cos(dot(warped, wind) * 43.0 + uTime * 5.4);
    float bandB = cos(dot(warped, crossWind) * 57.0 - uTime * 6.2);
    float bandC = cos(dot(warped, quartering) * 73.0 + uTime * 7.4);
    float bandD = cos(dot(warped, opposing) * 97.0 - uTime * 8.6);
    vec2 slope = wind * bandA * 0.0065
      + crossWind * bandB * 0.0050
      + quartering * bandC * 0.0038
      + opposing * bandD * 0.0026;
    float distanceFade = 1.0 - smoothstep(
      uDetailFade.x * 0.72,
      uDetailFade.y,
      vViewDepth
    );
    float weather = clamp((uAmplitudeScale - 0.78) / 0.57, 0.0, 1.0);
    return slope * distanceFade * mix(0.28, 1.0, weather);
  }

  float ultraSurfaceRoughness(float waveSlope, vec2 detailSlope) {
    float weather = clamp((uAmplitudeScale - 0.78) / 0.57, 0.0, 1.0);
    return clamp(
      0.075 + waveSlope * 0.12 + length(detailSlope) * 0.75 + weather * 0.06,
      0.075,
      0.34
    );
  }
  #endif

  float hash21(vec2 position) {
    vec2 seed = fract(position * vec2(123.34, 456.21));
    seed += dot(seed, seed + 45.32);
    return fract(seed.x * seed.y);
  }

  float valueNoise(vec2 position) {
    vec2 cell = floor(position);
    vec2 fractional = fract(position);
    vec2 blend = fractional * fractional * (3.0 - 2.0 * fractional);
    float lower = mix(
      hash21(cell),
      hash21(cell + vec2(1.0, 0.0)),
      blend.x
    );
    float upper = mix(
      hash21(cell + vec2(0.0, 1.0)),
      hash21(cell + vec2(1.0, 1.0)),
      blend.x
    );
    return mix(lower, upper, blend.y);
  }

  #ifdef ULTRA_QUALITY_WATER
  float ultraSunGlint(
    vec2 worldPosition,
    float specularFacing,
    float windAlignment
  ) {
    vec2 wind = normalize(vec2(0.83, 0.56));
    vec2 crossWind = vec2(-wind.y, wind.x);
    vec2 drifted = worldPosition + wind * uTime * 0.18;
    vec2 windSpace = vec2(dot(drifted, wind), dot(drifted, crossWind));
    float carrier = valueNoise(
      windSpace * vec2(5.8, 13.2) + vec2(3.7, -8.1)
    );
    float distanceFade = 1.0 - smoothstep(
      uDetailFade.x * 0.55,
      uDetailFade.y * 0.72,
      vViewDepth
    );
    return smoothstep(0.86, 0.98, carrier)
      * pow(specularFacing, 180.0)
      * mix(0.35, 1.0, windAlignment)
      * distanceFade;
  }
  #endif

  float foamRibbonNoise(vec2 worldPosition) {
    vec2 wind = normalize(vec2(0.83, 0.56));
    vec2 crossWind = vec2(-wind.y, wind.x);
    vec2 drifted = worldPosition + wind * uTime * 0.24;
    vec2 windSpace = vec2(dot(drifted, wind), dot(drifted, crossWind));
    float warpAlong = valueNoise(
      windSpace * vec2(0.075, 0.21) + vec2(8.7, -3.2)
    );
    float warpAcross = valueNoise(
      windSpace * vec2(0.11, 0.16) + vec2(-4.1, 6.8)
    );
    vec2 warpedSpace = windSpace + vec2(
      (warpAlong - 0.5) * 3.4,
      (warpAcross - 0.5) * 1.8
    );
    float coarse = valueNoise(warpedSpace * vec2(0.11, 0.34));
    float medium = valueNoise(
      warpedSpace * vec2(0.26, 0.78) + vec2(13.6, -9.4)
    );
    return clamp(coarse * 0.62 + medium * 0.38, 0.0, 1.0);
  }

  float foamEdgeNoise(vec2 worldPosition) {
    vec2 wind = normalize(vec2(0.83, 0.56));
    vec2 crossWind = vec2(-wind.y, wind.x);
    vec2 drifted = worldPosition + wind * uTime * 0.31;
    vec2 edgeSpace = vec2(dot(drifted, wind), dot(drifted, crossWind));
    float edge = valueNoise(edgeSpace * vec2(0.72, 1.46) + vec2(2.9, 17.3));
    return edge;
  }

  float foamBody(
    float waveHeight,
    float waveSlope,
    float ribbonNoise,
    float edgeNoise,
    float fineFade
  ) {
    float weather = clamp((uAmplitudeScale - 0.78) / 0.57, 0.0, 1.0);
    float crestStart = mix(0.31, 0.13, weather);
    float crestWidth = mix(0.30, 0.24, weather);
    float slopeStart = mix(0.11, 0.055, weather);
    float slopeWidth = mix(0.23, 0.17, weather);
    float crest = smoothstep(crestStart, crestStart + crestWidth, waveHeight);
    float breaking = smoothstep(slopeStart, slopeStart + slopeWidth, waveSlope);
    float crestEnvelope = crest * mix(0.62, 1.0, breaking);
    float ribbonStart = mix(0.57, 0.42, weather);
    float ribbon = smoothstep(ribbonStart, ribbonStart + 0.18, ribbonNoise);
    float erodedEdge = smoothstep(0.14, 0.44, edgeNoise);
    float edgeMask = mix(1.0, erodedEdge, fineFade);
    float strength = mix(0.92, 1.12, weather);
    return clamp(crestEnvelope * ribbon * edgeMask * strength, 0.0, 1.0);
  }

  float foamCap(
    float waveHeight,
    float waveSlope,
    float bodyFoam,
    float ribbonNoise
  ) {
    float weather = clamp((uAmplitudeScale - 0.78) / 0.57, 0.0, 1.0);
    float crestStart = mix(0.48, 0.29, weather);
    float slopeStart = mix(0.22, 0.13, weather);
    float crest = smoothstep(crestStart, crestStart + 0.18, waveHeight);
    float breaking = smoothstep(slopeStart, slopeStart + 0.16, waveSlope);
    float ribbonStart = mix(0.68, 0.55, weather);
    float ribbonCore = smoothstep(ribbonStart, ribbonStart + 0.15, ribbonNoise);
    float strength = mix(0.80, 1.0, weather);
    return clamp(bodyFoam * crest * breaking * ribbonCore * strength, 0.0, 1.0);
  }

  #ifdef HIGH_QUALITY_WATER
  float highQualityFoamCoverage(
    vec2 worldPosition,
    float waveHeight,
    float waveSlope,
    float fineFade
  ) {
    float weather = clamp((uAmplitudeScale - 0.78) / 0.57, 0.0, 1.0);
    vec2 wind = normalize(vec2(0.83, 0.56));
    vec2 crossWind = vec2(-wind.y, wind.x);
    vec2 drifted = worldPosition + wind * uTime * 0.38;
    vec2 windSpace = vec2(dot(drifted, wind), dot(drifted, crossWind));
    float broadWarp = valueNoise(
      windSpace * vec2(0.055, 0.13) + vec2(4.7, -8.3)
    );
    float crossWarp = valueNoise(
      windSpace * vec2(0.12, 0.19) + vec2(-11.2, 5.4)
    );
    vec2 warpedSpace = windSpace + vec2(
      (broadWarp - 0.5) * 4.6,
      (crossWarp - 0.5) * 2.3
    );
    float longBand = valueNoise(
      warpedSpace * vec2(0.14, 0.62) + vec2(1.8, 7.1)
    );
    float brokenBand = valueNoise(
      warpedSpace * vec2(0.31, 1.28) + vec2(-6.4, 12.9)
    );
    float streakField = clamp(longBand * 0.62 + brokenBand * 0.38, 0.0, 1.0);
    float streaks = smoothstep(
      mix(0.57, 0.47, weather),
      mix(0.77, 0.66, weather),
      streakField
    );

    float crestStart = mix(0.12, 0.01, weather);
    float crest = smoothstep(crestStart, crestStart + 0.25, waveHeight);
    float slopeStart = mix(0.07, 0.035, weather);
    float breaking = smoothstep(slopeStart, slopeStart + 0.15, waveSlope);
    float crestEnvelope = crest * mix(0.46, 1.0, breaking);
    float trailingEnvelope = smoothstep(-0.04, 0.17, waveHeight)
      * (1.0 - smoothstep(0.52, 0.83, waveHeight));

    float edgeBreak = smoothstep(
      0.18,
      0.52,
      valueNoise(warpedSpace * vec2(0.48, 1.70) + vec2(9.6, -2.7))
    );
    float brokenMask = mix(0.42, 1.0, max(streaks, edgeBreak * 0.75));
    float foamEnvelope = max(
      crestEnvelope,
      trailingEnvelope * streaks * 0.48
    );
    float strength = mix(0.86, 1.16, weather);
    return clamp(foamEnvelope * brokenMask * strength * fineFade, 0.0, 1.0);
  }

  float highQualityCrestCap(
    vec2 worldPosition,
    float waveHeight,
    float waveSlope,
    float highFoam,
    float fineFade
  ) {
    float weather = clamp((uAmplitudeScale - 0.78) / 0.57, 0.0, 1.0);
    float crestStart = mix(0.34, 0.17, weather);
    float slopeStart = mix(0.13, 0.065, weather);
    float crest = smoothstep(crestStart, crestStart + 0.17, waveHeight);
    float breaking = smoothstep(slopeStart, slopeStart + 0.13, waveSlope);
    vec2 drifted = worldPosition + vec2(0.83, 0.56) * uTime * 0.44;
    float capNoise = valueNoise(
      drifted * vec2(1.16, 1.84) + vec2(-3.7, 15.2)
    );
    float brokenCap = mix(0.52, 1.0, smoothstep(0.24, 0.68, capNoise));
    float capEnvelope = max(crest * breaking, highFoam * crest * 0.58);
    return clamp(
      capEnvelope * brokenCap * mix(0.90, 1.14, weather) * fineFade,
      0.0,
      1.0
    );
  }
  #endif

  #ifdef ULTRA_QUALITY_WATER
  vec2 ultraQualityFoam(
    vec2 worldPosition,
    float waveHeight,
    float waveSlope,
    float ribbonNoise,
    float edgeNoise,
    float distanceFade
  ) {
    float weather = clamp((uAmplitudeScale - 0.78) / 0.57, 0.0, 1.0);
    vec2 wind = normalize(vec2(0.83, 0.56));
    vec2 crossWind = vec2(-wind.y, wind.x);
    vec2 drifted = worldPosition + wind * uTime * 0.34;
    vec2 windSpace = vec2(dot(drifted, wind), dot(drifted, crossWind));
    float longStreak = valueNoise(
      windSpace * vec2(0.18, 0.82) + vec2(5.1, -9.3)
    );
    float brokenStreak = valueNoise(
      windSpace * vec2(0.43, 1.64) + vec2(-7.6, 4.8)
    );
    float streakField = clamp(
      longStreak * 0.66 + brokenStreak * 0.34,
      0.0,
      1.0
    );
    float streakMask = smoothstep(
      mix(0.68, 0.56, weather),
      mix(0.86, 0.73, weather),
      streakField
    );
    float crestStart = mix(0.44, 0.22, weather);
    float crest = smoothstep(crestStart, crestStart + 0.16, waveHeight);
    float slopeStart = mix(0.22, 0.09, weather);
    float breaking = smoothstep(slopeStart, slopeStart + 0.12, waveSlope);
    float trailingEnvelope = smoothstep(-0.02, 0.18, waveHeight)
      * (1.0 - smoothstep(0.30, 0.55, waveHeight));
    float erosion = mix(
      0.42,
      1.0,
      smoothstep(0.20, 0.62, mix(edgeNoise, ribbonNoise, 0.34))
    );
    float calmSuppression = mix(0.12, 1.0, weather);
    float body = (
      crest * breaking * mix(0.12, 1.0, streakMask)
      + trailingEnvelope * streakMask * 0.34
    ) * erosion * calmSuppression * distanceFade;
    float capNoise = valueNoise(
      windSpace * vec2(0.92, 2.10) + vec2(12.4, -3.2)
    );
    float cap = body
      * smoothstep(mix(0.32, 0.18, weather), 0.62, waveHeight)
      * smoothstep(0.44, 0.78, capNoise)
      * mix(0.58, 1.0, breaking);
    return vec2(
      clamp(body, 0.0, 0.78),
      clamp(cap, 0.0, 0.90)
    );
  }
  #endif

  void main() {
    float vortexCoreRadius = uVortexRadius
      * 0.56
      * smoothstep(0.18, 0.72, uVortexStrength);
    if (
      uVortexStrength > 0.0
      && distance(vOceanPosition, uVortexCenter) < vortexCoreRadius
    ) {
      discard;
    }
    for (int i = 0; i < 2; i++) {
      if (i < uExclusionCount) {
        vec3 exclusionLocal = (uExclusionWorldToLocal[i] * vec4(vWorldPosition, 1.0)).xyz;
        vec4 exclusionBounds = uExclusionBounds[i];
        float minimumLocalY = uExclusionMinimumLocalYs[i];
        float heightSpan = max(uExclusionUpperLocalYs[i] - minimumLocalY, 0.0001);
        float profileProgress = clamp(
          (exclusionLocal.y - minimumLocalY) / heightSpan,
          0.0,
          1.0
        );
        vec4 lowerBounds = uExclusionLowerBounds[i];
        vec4 localBounds = mix(lowerBounds, exclusionBounds, profileProgress);
        vec2 localTaperStarts = mix(
          uExclusionLowerTaperStarts[i],
          uExclusionTaperStarts[i],
          profileProgress
        );
        float localHalfWidth = (localBounds.y - localBounds.x) * 0.5;
        float localCenterX = (localBounds.x + localBounds.y) * 0.5;
        float taperProgress = 0.0;
        if (exclusionLocal.z < localTaperStarts.x) {
          float taperSpan = max(localTaperStarts.x - localBounds.z, 0.0);
          if (taperSpan > 0.0) {
            taperProgress = clamp(
              (localTaperStarts.x - exclusionLocal.z) / taperSpan,
              0.0,
              1.0
            );
          }
        } else if (exclusionLocal.z > localTaperStarts.y) {
          float taperSpan = max(localBounds.w - localTaperStarts.y, 0.0);
          if (taperSpan > 0.0) {
            taperProgress = clamp(
              (exclusionLocal.z - localTaperStarts.y) / taperSpan,
              0.0,
              1.0
            );
          }
        }
        localHalfWidth = localHalfWidth
          * sqrt(max(0.0, 1.0 - taperProgress * taperProgress));
        if (
          exclusionLocal.y >= uExclusionMinimumLocalYs[i]
          && exclusionLocal.y <= uExclusionUpperLocalYs[i]
          && exclusionLocal.z >= localBounds.z
          && exclusionLocal.z <= localBounds.w
          && abs(exclusionLocal.x - localCenterX) <= localHalfWidth
        ) {
          discard;
        }
      }
    }
    vec2 detailSlope = warpedDetailSlope(vWorldPosition.xz);
    #ifdef HIGH_QUALITY_WATER
    detailSlope += highQualityRippleSlope(vWorldPosition.xz);
    #endif
    #ifdef ULTRA_QUALITY_WATER
    detailSlope += ultraQualityMicroSlope(vWorldPosition.xz);
    #endif
    float waveHeight;
    vec2 waveDerivative;
    sampleSurfaceWave(vOceanPosition, waveHeight, waveDerivative);
    float waveSlope = length(waveDerivative);
    #ifdef ULTRA_QUALITY_WATER
    float surfaceRoughness = ultraSurfaceRoughness(waveSlope, detailSlope);
    float ultraRoughnessT = smoothstep(0.075, 0.34, surfaceRoughness);
    #endif
    vec3 normal = normalize(vec3(
      -waveDerivative.x - detailSlope.x,
      1.0,
      -waveDerivative.y - detailSlope.y
    ));
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    vec3 lightDirection = normalize(uLightDirection);
    float lightFacing = clamp(dot(normal, lightDirection), 0.0, 1.0);
    float viewFacing = clamp(dot(normal, viewDirection), 0.0, 1.0);

    float fresnel = 0.02 + 0.98 * pow(1.0 - viewFacing, 5.0);
    vec3 reflectionDirection = reflect(-viewDirection, normal);
    float reflectionLift = smoothstep(-0.12, 0.16, reflectionDirection.y);
    float reflectedSky = smoothstep(0.02, 0.82, reflectionDirection.y);
    vec3 reflectedColor = mix(uHorizonColor * 0.92, uSkyColor, reflectedSky);
    reflectedColor = mix(uHorizonColor * 0.78, reflectedColor, reflectionLift);
    #ifdef ULTRA_QUALITY_WATER
    vec3 ultraBroadReflection = mix(uHorizonColor * 0.86, uSkyColor, 0.54);
    float ultraReflectionBlur = smoothstep(0.075, 0.34, surfaceRoughness);
    reflectedColor = mix(
      reflectedColor,
      ultraBroadReflection,
      ultraReflectionBlur * 0.44
    );
    #endif

    float trough = 1.0 - smoothstep(-0.48, 0.38, waveHeight);
    float depthMix = clamp(0.18 + waveHeight * 0.27 + lightFacing * 0.23, 0.0, 1.0);
    vec3 waterBody = mix(uDeepColor, uShallowColor, depthMix);
    waterBody *= 1.0 - trough * 0.16;
    float forwardScatter = pow(clamp(dot(viewDirection, -lightDirection), 0.0, 1.0), 4.0);
    waterBody += uShallowColor * forwardScatter * uDirectLightStrength
      * (0.055 + waveSlope * 0.12);
    #ifdef HIGH_QUALITY_WATER
    float daylight = smoothstep(0.08, 0.92, uDirectLightStrength);
    vec3 weatherTint = mix(uFogColor * 0.78, uHorizonColor * 0.64, 0.42);
    float turquoiseRetention = mix(0.34, 0.92, daylight);
    waterBody = mix(weatherTint, waterBody, turquoiseRetention);
    float crestTransmission = smoothstep(-0.18, 0.58, waveHeight)
      * pow(clamp(dot(viewDirection, -lightDirection), 0.0, 1.0), 2.0);
    waterBody += uShallowColor * crestTransmission
      * uDirectLightStrength * 0.075;
    waterBody *= 1.0 - trough * 0.18;
    #endif
    #ifdef ULTRA_QUALITY_WATER
    float ultraOpticalPath = clamp(
      1.0 / max(viewFacing, 0.18) - 1.0,
      0.0,
      4.0
    );
    float ultraAbsorptionStrength = clamp(
      ultraOpticalPath * 0.11 + trough * 0.22,
      0.0,
      0.52
    );
    vec3 ultraAbsorptionTint = vec3(0.74, 0.88, 0.90);
    waterBody *= mix(
      vec3(1.0),
      ultraAbsorptionTint,
      ultraAbsorptionStrength
    );
    waterBody = mix(waterBody, uDeepColor, trough * 0.18);
    #endif
    float reflectionStrength = clamp(0.07 + fresnel * 0.89, 0.0, 0.95);
    #ifdef ULTRA_QUALITY_WATER
    reflectionStrength = clamp(
      0.05 + fresnel * mix(0.63, 0.45, ultraRoughnessT),
      0.0,
      0.68
    );
    #else
      #ifdef HIGH_QUALITY_WATER
    float microFacet = clamp(length(detailSlope) * 2.6, 0.0, 1.0);
    reflectionStrength = clamp(
      reflectionStrength + microFacet * 0.11,
      0.0,
      0.97
    );
      #endif
    #endif
    vec3 color = mix(waterBody, reflectedColor, reflectionStrength);

    vec3 halfDirection = normalize(lightDirection + viewDirection);
    float specularFacing = clamp(dot(normal, halfDirection), 0.0, 1.0);
    float windAlignment = 1.0 - abs(dot(
      normalize(vec2(halfDirection.x, halfDirection.z) + vec2(0.0001)),
      normalize(vec2(-0.56, 0.83))
    ));
    float sunCore = pow(specularFacing, 220.0) * 1.24;
    float sunSheen = pow(specularFacing, 38.0) * mix(0.10, 0.24, windAlignment);
    #ifdef ULTRA_QUALITY_WATER
    sunCore = pow(
      specularFacing,
      mix(620.0, 180.0, ultraRoughnessT)
    ) * mix(1.12, 0.68, ultraRoughnessT);
    sunSheen = pow(
      specularFacing,
      mix(92.0, 24.0, ultraRoughnessT)
    ) * mix(0.08, 0.20, windAlignment);
    sunCore += ultraSunGlint(
      vWorldPosition.xz,
      specularFacing,
      windAlignment
    ) * 0.42;
    #else
      #ifdef HIGH_QUALITY_WATER
    sunCore += pow(specularFacing, 420.0)
      * mix(0.20, 0.38, windAlignment);
    sunSheen += pow(specularFacing, 74.0)
      * mix(0.08, 0.18, windAlignment);
      #endif
    #endif

    float ribbonNoise = foamRibbonNoise(vWorldPosition.xz);
    float edgeNoise = foamEdgeNoise(vWorldPosition.xz);
    #ifdef HIGH_QUALITY_WATER
    float fineFoamNoise = valueNoise(
      vWorldPosition.xz * 2.15 + vec2(uTime * 0.11, -uTime * 0.08)
    );
    edgeNoise = mix(edgeNoise, fineFoamNoise, 0.34);
    #endif
    float fineDetailFade = 1.0 - smoothstep(
      uDetailFade.x * 0.72,
      uDetailFade.x,
      vViewDepth
    );
    float bodyFoam = foamBody(
      waveHeight,
      waveSlope,
      ribbonNoise,
      edgeNoise,
      fineDetailFade
    );
    float bodyDistanceFade = 1.0 - smoothstep(
      uDetailFade.y * 0.62,
      uDetailFade.y * 0.96,
      vViewDepth
    );
    bodyFoam *= bodyDistanceFade;
    float capFoam;
    #ifdef ULTRA_QUALITY_WATER
    float ultraFoamDistanceFade = 1.0 - smoothstep(
      uDetailFade.x * 0.72,
      uDetailFade.y,
      vViewDepth
    );
    vec2 ultraFoam = ultraQualityFoam(
      vWorldPosition.xz,
      waveHeight,
      waveSlope,
      ribbonNoise,
      edgeNoise,
      ultraFoamDistanceFade
    );
    bodyFoam = max(bodyFoam * 0.42, ultraFoam.x);
    capFoam = ultraFoam.y;
    #else
      #ifdef HIGH_QUALITY_WATER
    float highFoamDistanceFade = 1.0 - smoothstep(
      uDetailFade.y * 0.42,
      uDetailFade.y * 0.88,
      vViewDepth
    );
    float highFoam = highQualityFoamCoverage(
      vWorldPosition.xz,
      waveHeight,
      waveSlope,
      highFoamDistanceFade
    );
    bodyFoam = max(bodyFoam, highFoam * 0.86);
      #endif
    capFoam = foamCap(waveHeight, waveSlope, bodyFoam, ribbonNoise);
      #ifdef HIGH_QUALITY_WATER
    float highCapFoam = highQualityCrestCap(
      vWorldPosition.xz,
      waveHeight,
      waveSlope,
      highFoam,
      highFoamDistanceFade
    );
    capFoam = max(capFoam, highCapFoam);
      #endif
    #endif
    float capDistanceFade = 1.0 - smoothstep(
      uDetailFade.y * 0.48,
      uDetailFade.y * 0.74,
      vViewDepth
    );
    capFoam *= capDistanceFade;
    float foam = clamp(bodyFoam + capFoam, 0.0, 1.0);
    color += uSunColor * (sunCore + sunSheen) * uDirectLightStrength
      * (1.0 - clamp(foam * 0.72 + capFoam * 0.22, 0.0, 0.94));
    #ifdef ULTRA_QUALITY_WATER
    vec3 ultraFoamColor = mix(
      uFoamColor,
      uSunColor,
      0.08 * uDirectLightStrength
    );
    color = mix(color, uFoamColor, bodyFoam * 0.56);
    color = mix(color, ultraFoamColor, capFoam * 0.78);
    #else
    vec3 capFoamColor = mix(
      uFoamColor,
      uSunColor,
      0.08 * uDirectLightStrength
    );
    color = mix(color, uFoamColor, bodyFoam * 0.64);
    color = mix(color, capFoamColor, capFoam * 0.90);
      #ifdef HIGH_QUALITY_WATER
    float highFoamLayer = clamp(
      highFoam * 0.78 + highCapFoam * capDistanceFade * 0.86,
      0.0,
      1.0
    );
    vec3 highFoamColor = mix(
      uFoamColor,
      vec3(0.96, 1.0, 0.98),
      0.46
    );
    color = mix(color, highFoamColor, highFoamLayer * 0.78);
      #endif
    #endif

    float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * vViewDepth * vViewDepth);
    float horizonFogProgress = smoothstep(
      uHorizonFog.x,
      uHorizonFog.y,
      vViewDepth
    );
    float distanceFogFactor = mix(
      min(fogFactor, uHorizonFog.z),
      1.0,
      horizonFogProgress
    );
    vec3 distanceFogColor = mix(
      uFogColor,
      uHorizonColor,
      horizonFogProgress
    );
    color = mix(color, distanceFogColor, clamp(distanceFogFactor, 0.0, 1.0));
    gl_FragColor = vec4(color, 0.98);
    #include <colorspace_fragment>
    gl_FragColor.rgb += orderedDither(gl_FragCoord.xy);
  }
`;


export function applyOceanShaderQuality(
  uniforms: OceanShaderUniforms,
  quality: WaterQuality,
): Readonly<Record<string, number>> {
  const values = OCEAN_SHADER_QUALITY[quality];
  uniforms.uDetailFade.value.set(values.detailFade[0], values.detailFade[1]);
  uniforms.uHorizonFog.value.set(
    values.horizonFog[0],
    values.horizonFog[1],
    values.horizonFog[2],
  );
  uniforms.uDeepColor.value.setHex(values.deepColor);
  uniforms.uShallowColor.value.setHex(values.shallowColor);
  uniforms.uFoamColor.value.setHex(values.foamColor);
  return values.defines;
}

export function createOceanShaderDefinition(quality: WaterQuality): Readonly<{
  vertexShader: string;
  fragmentShader: string;
  defines: Readonly<Record<string, number>>;
  uniforms: OceanShaderUniforms;
}> {
  const payload = createWaveUniformPayload(DEFAULT_WAVES);
  const uniforms: OceanShaderUniforms = {
    uTime: { value: 0 },
    uAmplitudeScale: { value: 1 },
    uOrigin: { value: new Vector2() },
    uDetailFade: { value: new Vector2() },
    uDirections: {
      value: payload.directions.map(([x, y]) => new Vector2(x, y)),
    },
    uParameters: {
      value: payload.parameters.map(
        ([x, y, z, w]) => new Vector4(x, y, z, w),
      ),
    },
    uPhases: { value: payload.phases },
    uVortexCenter: { value: new Vector2() },
    uVortexRadius: { value: 0 },
    uVortexDepression: { value: 0 },
    uVortexTangentStrength: { value: 0 },
    uVortexPhase: { value: 0 },
    uVortexStrength: { value: 0 },
    uDeepColor: { value: new Color() },
    uShallowColor: { value: new Color() },
    uFoamColor: { value: new Color() },
    uFogColor: { value: new Color(0x27343b) },
    uSkyColor: { value: new Color(0x496b75) },
    uHorizonColor: { value: new Color(0x6f8587) },
    uHorizonFog: { value: new Vector3() },
    uSunColor: { value: new Color(0xfff1cf) },
    uDirectLightStrength: { value: 1 },
    uFogDensity: { value: 0.018 },
    uLightDirection: { value: new Vector3() },
    uExclusionCount: { value: 0 },
    uExclusionWorldToLocal: {
      value: Array.from(
        { length: MAX_OCEAN_EXCLUSIONS },
        () => new Matrix4(),
      ),
    },
    uExclusionBounds: {
      value: Array.from(
        { length: MAX_OCEAN_EXCLUSIONS },
        () => new Vector4(),
      ),
    },
    uExclusionLowerBounds: {
      value: Array.from(
        { length: MAX_OCEAN_EXCLUSIONS },
        () => new Vector4(),
      ),
    },
    uExclusionTaperStarts: {
      value: Array.from(
        { length: MAX_OCEAN_EXCLUSIONS },
        () => new Vector2(),
      ),
    },
    uExclusionLowerTaperStarts: {
      value: Array.from(
        { length: MAX_OCEAN_EXCLUSIONS },
        () => new Vector2(),
      ),
    },
    uExclusionMinimumLocalYs: {
      value: Array.from(
        { length: MAX_OCEAN_EXCLUSIONS },
        () => UNBOUNDED_MINIMUM_LOCAL_Y,
      ),
    },
    uExclusionUpperLocalYs: {
      value: Array.from(
        { length: MAX_OCEAN_EXCLUSIONS },
        () => UNBOUNDED_MAXIMUM_LOCAL_Y,
      ),
    },
  };
  const defines = applyOceanShaderQuality(uniforms, quality);

  return Object.freeze({
    vertexShader: OCEAN_VERTEX_SHADER,
    fragmentShader: OCEAN_FRAGMENT_SHADER,
    defines,
    uniforms,
  });
}
