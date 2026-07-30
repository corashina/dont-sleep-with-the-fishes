import {
  BufferGeometry,
  Color,
  Matrix4,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { DEFAULT_WAVES, createWaveUniformPayload } from './WaveField';
import {
  UNBOUNDED_MAXIMUM_LOCAL_Y,
  UNBOUNDED_MINIMUM_LOCAL_Y,
  type WaterExclusionRegion,
} from './WaterExclusion';
import {
  SUN_DIRECTION,
  type CelestialDirection,
} from '../world/celestialLight';
import type { WaterQuality } from '../rendering/waterQuality';

const MAX_EXCLUSIONS = 2;

export interface OceanSurfaceQuality {
  segments: number;
  detailFadeNear: number;
  detailFadeFar: number;
  horizonHazeStart: number;
  horizonHazeEnd: number;
  horizonHazeStrength: number;
  surfaceExtent: number;
  horizonHalfExtent: number;
  horizonRadialSegments: number;
}

export const OCEAN_SURFACE_QUALITY = Object.freeze({
  low: Object.freeze({
    segments: 192,
    detailFadeNear: 28,
    detailFadeFar: 92,
    horizonHazeStart: 35,
    horizonHazeEnd: 120,
    horizonHazeStrength: 0.88,
    surfaceExtent: 180,
    horizonHalfExtent: 1100,
    horizonRadialSegments: 48,
  }),
  high: Object.freeze({
    segments: 288,
    detailFadeNear: 40,
    detailFadeFar: 128,
    horizonHazeStart: 45,
    horizonHazeEnd: 145,
    horizonHazeStrength: 0.82,
    surfaceExtent: 180,
    horizonHalfExtent: 1100,
    horizonRadialSegments: 72,
  }),
}) satisfies Readonly<Record<WaterQuality, Readonly<OceanSurfaceQuality>>>;

const OCEAN_COLORS = Object.freeze({
  low: Object.freeze({
    deep: 0x162c35,
    shallow: 0x42656a,
    foam: 0xb7b7a5,
  }),
  high: Object.freeze({
    deep: 0x073844,
    shallow: 0x35a6a0,
    foam: 0xd4ded4,
  }),
}) satisfies Readonly<Record<WaterQuality, Readonly<{
  deep: number;
  shallow: number;
  foam: number;
}>>>;

export interface OceanAtmosphere {
  fogColor: Color;
  horizonColor: Color;
  skyColor: Color;
  sunColor: Color;
  sunVisibility: number;
}

const vertexShader = `
  uniform float uTime;
  uniform float uAmplitudeScale;
  uniform vec2 uOrigin;
  uniform vec2 uDirections[4];
  uniform vec4 uParameters[4];
  uniform float uPhases[4];
  varying float vHeight;
  varying float vWaveSlope;
  varying float vViewDepth;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  void main() {
    vec3 displaced = position;
    vec2 worldXZ = position.xz + uOrigin;
    float derivativeX = 0.0;
    float derivativeZ = 0.0;
    float height = 0.0;
    for (int i = 0; i < 4; i++) {
      vec2 direction = normalize(uDirections[i]);
      float amplitude = uParameters[i].x * uAmplitudeScale;
      float waveNumber = 6.28318530718 / uParameters[i].y;
      float theta = waveNumber * dot(direction, worldXZ) + uParameters[i].z * uTime + uPhases[i];
      float waveSin = sin(theta);
      float waveCos = cos(theta);
      height += amplitude * waveSin;
      displaced.x += uParameters[i].w * amplitude * direction.x * waveCos;
      displaced.z += uParameters[i].w * amplitude * direction.y * waveCos;
      derivativeX += amplitude * waveNumber * direction.x * waveCos;
      derivativeZ += amplitude * waveNumber * direction.y * waveCos;
    }
    displaced.y += height;
    vec3 localNormal = normalize(vec3(-derivativeX, 1.0, -derivativeZ));
    vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
    vHeight = height;
    vWaveSlope = length(vec2(derivativeX, derivativeZ));
    vViewDepth = length(cameraPosition - worldPosition.xyz);
    vWorldNormal = normalize(mat3(modelMatrix) * localNormal);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const fragmentShader = `
  uniform float uTime;
  uniform float uAmplitudeScale;
  uniform vec2 uDetailFade;
  uniform vec3 uDeepColor;
  uniform vec3 uShallowColor;
  uniform vec3 uFoamColor;
  uniform vec3 uFogColor;
  uniform vec3 uSkyColor;
  uniform vec3 uHorizonColor;
  uniform vec3 uHorizonHaze;
  uniform vec3 uSunColor;
  uniform float uDirectLightStrength;
  uniform float uFogDensity;
  uniform vec3 uLightDirection;
  uniform int uExclusionCount;
  uniform mat4 uExclusionWorldToLocal[2];
  uniform vec4 uExclusionBounds[2];
  uniform vec4 uExclusionLowerBounds[2];
  uniform float uExclusionTaperStarts[2];
  uniform float uExclusionLowerTaperStarts[2];
  uniform float uExclusionMinimumLocalYs[2];
  uniform float uExclusionUpperLocalYs[2];
  varying float vHeight;
  varying float vWaveSlope;
  varying float vViewDepth;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

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

  void main() {
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
        float lowerHalfWidth = max(abs(lowerBounds.x), abs(lowerBounds.y));
        float lowerHalfLength = max(abs(lowerBounds.z), abs(lowerBounds.w));
        float exclusionHalfWidth = max(abs(exclusionBounds.x), abs(exclusionBounds.y));
        float exclusionHalfLength = max(abs(exclusionBounds.z), abs(exclusionBounds.w));
        float localHalfWidth = mix(lowerHalfWidth, exclusionHalfWidth, profileProgress);
        float localHalfLength = mix(lowerHalfLength, exclusionHalfLength, profileProgress);
        float localTaperStart = mix(
          uExclusionLowerTaperStarts[i],
          uExclusionTaperStarts[i],
          profileProgress
        );
        float exclusionAbsZ = abs(exclusionLocal.z);
        float taperSpan = max(localHalfLength - localTaperStart, 0.0);
        float taperProgress = 0.0;
        if (taperSpan > 0.0) {
          taperProgress = clamp(
            (exclusionAbsZ - localTaperStart) / taperSpan,
            0.0,
            1.0
          );
        }
        localHalfWidth = localHalfWidth
          * sqrt(max(0.0, 1.0 - taperProgress * taperProgress));
        if (
          exclusionLocal.y >= uExclusionMinimumLocalYs[i]
          && exclusionLocal.y <= uExclusionUpperLocalYs[i]
          && exclusionAbsZ <= localHalfLength
          && abs(exclusionLocal.x) <= localHalfWidth
        ) {
          discard;
        }
      }
    }
    vec2 detailSlope = warpedDetailSlope(vWorldPosition.xz);
    #ifdef HIGH_QUALITY_WATER
    detailSlope += highQualityRippleSlope(vWorldPosition.xz);
    #endif
    vec3 normal = normalize(vWorldNormal + vec3(-detailSlope.x, 0.0, -detailSlope.y));
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

    float trough = 1.0 - smoothstep(-0.48, 0.38, vHeight);
    float depthMix = clamp(0.18 + vHeight * 0.27 + lightFacing * 0.23, 0.0, 1.0);
    vec3 waterBody = mix(uDeepColor, uShallowColor, depthMix);
    waterBody *= 1.0 - trough * 0.16;
    float forwardScatter = pow(clamp(dot(viewDirection, -lightDirection), 0.0, 1.0), 4.0);
    waterBody += uShallowColor * forwardScatter * uDirectLightStrength
      * (0.055 + vWaveSlope * 0.12);
    #ifdef HIGH_QUALITY_WATER
    float daylight = smoothstep(0.08, 0.92, uDirectLightStrength);
    vec3 weatherTint = mix(uFogColor * 0.78, uHorizonColor * 0.64, 0.42);
    float turquoiseRetention = mix(0.34, 0.92, daylight);
    waterBody = mix(weatherTint, waterBody, turquoiseRetention);
    float crestTransmission = smoothstep(-0.18, 0.58, vHeight)
      * pow(clamp(dot(viewDirection, -lightDirection), 0.0, 1.0), 2.0);
    waterBody += uShallowColor * crestTransmission
      * uDirectLightStrength * 0.075;
    waterBody *= 1.0 - trough * 0.18;
    #endif
    float reflectionStrength = clamp(0.07 + fresnel * 0.89, 0.0, 0.95);
    #ifdef HIGH_QUALITY_WATER
    float microFacet = clamp(length(detailSlope) * 2.6, 0.0, 1.0);
    reflectionStrength = clamp(
      reflectionStrength + microFacet * 0.11,
      0.0,
      0.97
    );
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
    #ifdef HIGH_QUALITY_WATER
    sunCore += pow(specularFacing, 420.0)
      * mix(0.20, 0.38, windAlignment);
    sunSheen += pow(specularFacing, 74.0)
      * mix(0.08, 0.18, windAlignment);
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
      vHeight,
      vWaveSlope,
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
    #ifdef HIGH_QUALITY_WATER
    float highFoamDistanceFade = 1.0 - smoothstep(
      uDetailFade.y * 0.42,
      uDetailFade.y * 0.88,
      vViewDepth
    );
    float highFoam = highQualityFoamCoverage(
      vWorldPosition.xz,
      vHeight,
      vWaveSlope,
      highFoamDistanceFade
    );
    bodyFoam = max(bodyFoam, highFoam * 0.86);
    #endif
    float capFoam = foamCap(vHeight, vWaveSlope, bodyFoam, ribbonNoise);
    #ifdef HIGH_QUALITY_WATER
    float highCapFoam = highQualityCrestCap(
      vWorldPosition.xz,
      vHeight,
      vWaveSlope,
      highFoam,
      highFoamDistanceFade
    );
    capFoam = max(capFoam, highCapFoam);
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
    vec3 capFoamColor = mix(uFoamColor, uSunColor, 0.08 * uDirectLightStrength);
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

    float horizonHaze = smoothstep(
      uHorizonHaze.x,
      uHorizonHaze.y,
      vViewDepth
    ) * uHorizonHaze.z;
    vec3 hazeColor = mix(uFogColor, uHorizonColor, 0.22);
    color = mix(color, hazeColor, horizonHaze);

    float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * vViewDepth * vViewDepth);
    color = mix(color, uFogColor, clamp(fogFactor, 0.0, 1.0));
    gl_FragColor = vec4(color, 0.98);
    #include <colorspace_fragment>
    gl_FragColor.rgb += orderedDither(gl_FragCoord.xy);
  }
`;

function createOceanPanel(
  width: number,
  depth: number,
  widthSegments: number,
  depthSegments: number,
  centerX: number,
  centerZ: number,
): PlaneGeometry {
  const panel = new PlaneGeometry(width, depth, widthSegments, depthSegments);
  panel.rotateX(-Math.PI / 2);
  panel.translate(centerX, 0, centerZ);
  return panel;
}

function createSurfaceGeometry(
  quality: Readonly<OceanSurfaceQuality>,
): PlaneGeometry {
  const geometry = new PlaneGeometry(
    quality.surfaceExtent,
    quality.surfaceExtent,
    quality.segments,
    quality.segments,
  );
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

function createHorizonGeometry(
  quality: Readonly<OceanSurfaceQuality>,
): BufferGeometry {
  const innerHalfExtent = quality.surfaceExtent / 2;
  const outerHalfExtent = quality.horizonHalfExtent;
  const ringSpan = outerHalfExtent - innerHalfExtent;
  const ringCenter = innerHalfExtent + ringSpan / 2;
  const edgeSegments = quality.segments;
  const radialSegments = quality.horizonRadialSegments;
  const panels = [
    createOceanPanel(quality.surfaceExtent, ringSpan, edgeSegments, radialSegments, 0, ringCenter),
    createOceanPanel(quality.surfaceExtent, ringSpan, edgeSegments, radialSegments, 0, -ringCenter),
    createOceanPanel(ringSpan, quality.surfaceExtent, radialSegments, edgeSegments, ringCenter, 0),
    createOceanPanel(ringSpan, quality.surfaceExtent, radialSegments, edgeSegments, -ringCenter, 0),
    createOceanPanel(ringSpan, ringSpan, radialSegments, radialSegments, ringCenter, ringCenter),
    createOceanPanel(ringSpan, ringSpan, radialSegments, radialSegments, ringCenter, -ringCenter),
    createOceanPanel(ringSpan, ringSpan, radialSegments, radialSegments, -ringCenter, ringCenter),
    createOceanPanel(ringSpan, ringSpan, radialSegments, radialSegments, -ringCenter, -ringCenter),
  ];
  const geometry = mergeGeometries(panels);
  panels.forEach((panel) => panel.dispose());
  if (!geometry) throw new Error('Unable to build ocean horizon geometry.');
  return geometry;
}

export class OceanRenderer {
  readonly material: ShaderMaterial;
  readonly mesh: Mesh<PlaneGeometry, ShaderMaterial>;
  readonly horizonMesh: Mesh<BufferGeometry, ShaderMaterial>;
  private quality: WaterQuality;
  private disposed = false;

  constructor(
    quality: WaterQuality = 'low',
    lightDirection: CelestialDirection = SUN_DIRECTION,
  ) {
    this.quality = quality;
    const surfaceQuality = OCEAN_SURFACE_QUALITY[quality];
    const colors = OCEAN_COLORS[quality];
    const payload = createWaveUniformPayload(DEFAULT_WAVES);
    this.material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: false,
      ...(quality === 'high'
        ? { defines: { HIGH_QUALITY_WATER: 1 } }
        : {}),
      uniforms: {
        uTime: { value: 0 },
        uAmplitudeScale: { value: 1 },
        uOrigin: { value: new Vector2() },
        uDetailFade: {
          value: new Vector2(
            surfaceQuality.detailFadeNear,
            surfaceQuality.detailFadeFar,
          ),
        },
        uHorizonHaze: {
          value: new Vector3(
            surfaceQuality.horizonHazeStart,
            surfaceQuality.horizonHazeEnd,
            surfaceQuality.horizonHazeStrength,
          ),
        },
        uDirections: { value: payload.directions.map(([x, y]) => new Vector2(x, y)) },
        uParameters: { value: payload.parameters.map(([x, y, z, w]) => new Vector4(x, y, z, w)) },
        uPhases: { value: payload.phases },
        uDeepColor: { value: new Color(colors.deep) },
        uShallowColor: { value: new Color(colors.shallow) },
        uFoamColor: { value: new Color(colors.foam) },
        uFogColor: { value: new Color(0x27343b) },
        uSkyColor: { value: new Color(0x496b75) },
        uHorizonColor: { value: new Color(0x6f8587) },
        uSunColor: { value: new Color(0xfff1cf) },
        uDirectLightStrength: { value: 1 },
        uFogDensity: { value: 0.018 },
        uLightDirection: { value: new Vector3(...lightDirection).normalize() },
        uExclusionCount: { value: 0 },
        uExclusionWorldToLocal: { value: [new Matrix4(), new Matrix4()] },
        uExclusionBounds: { value: [new Vector4(), new Vector4()] },
        uExclusionLowerBounds: { value: [new Vector4(), new Vector4()] },
        uExclusionTaperStarts: { value: [0, 0] },
        uExclusionLowerTaperStarts: { value: [0, 0] },
        uExclusionMinimumLocalYs: {
          value: [UNBOUNDED_MINIMUM_LOCAL_Y, UNBOUNDED_MINIMUM_LOCAL_Y],
        },
        uExclusionUpperLocalYs: {
          value: [UNBOUNDED_MAXIMUM_LOCAL_Y, UNBOUNDED_MAXIMUM_LOCAL_Y],
        },
      },
    });
    const geometry = createSurfaceGeometry(surfaceQuality);
    this.mesh = new Mesh(geometry, this.material);
    this.mesh.name = 'procedural-ocean';
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.horizonMesh = new Mesh(
      createHorizonGeometry(surfaceQuality),
      this.material,
    );
    this.horizonMesh.name = 'procedural-ocean-horizon';
    this.horizonMesh.frustumCulled = false;
    this.mesh.add(this.horizonMesh);
  }

  setQuality(value: WaterQuality): void {
    if (this.disposed || value === this.quality) return;
    const surfaceQuality = OCEAN_SURFACE_QUALITY[value];
    const nextSurface = createSurfaceGeometry(surfaceQuality);
    let nextHorizon: BufferGeometry;
    try {
      nextHorizon = createHorizonGeometry(surfaceQuality);
    } catch (error) {
      nextSurface.dispose();
      throw error;
    }
    const previousSurface = this.mesh.geometry;
    const previousHorizon = this.horizonMesh.geometry;
    this.mesh.geometry = nextSurface;
    this.horizonMesh.geometry = nextHorizon;
    previousSurface.dispose();
    previousHorizon.dispose();

    const colors = OCEAN_COLORS[value];
    (this.material.uniforms.uDetailFade!.value as Vector2).set(
      surfaceQuality.detailFadeNear,
      surfaceQuality.detailFadeFar,
    );
    (this.material.uniforms.uHorizonHaze!.value as Vector3).set(
      surfaceQuality.horizonHazeStart,
      surfaceQuality.horizonHazeEnd,
      surfaceQuality.horizonHazeStrength,
    );
    (this.material.uniforms.uDeepColor!.value as Color).setHex(colors.deep);
    (this.material.uniforms.uShallowColor!.value as Color).setHex(colors.shallow);
    (this.material.uniforms.uFoamColor!.value as Color).setHex(colors.foam);
    if (value === 'high') {
      this.material.defines = {
        ...this.material.defines,
        HIGH_QUALITY_WATER: 1,
      };
    } else if (this.material.defines !== undefined) {
      const defines = { ...this.material.defines };
      delete defines.HIGH_QUALITY_WATER;
      this.material.defines = defines;
    }
    this.material.needsUpdate = true;
    this.quality = value;
  }

  update(
    timeSeconds: number,
    amplitudeScale: number,
    fogDensity: number,
    atmosphere?: OceanAtmosphere,
  ): void {
    this.material.uniforms.uTime!.value = timeSeconds;
    this.material.uniforms.uAmplitudeScale!.value = amplitudeScale;
    this.material.uniforms.uFogDensity!.value = fogDensity;
    if (!atmosphere) return;
    (this.material.uniforms.uFogColor!.value as Color).copy(atmosphere.fogColor);
    (this.material.uniforms.uHorizonColor!.value as Color).copy(atmosphere.horizonColor);
    (this.material.uniforms.uSkyColor!.value as Color).copy(atmosphere.skyColor);
    (this.material.uniforms.uSunColor!.value as Color).copy(atmosphere.sunColor);
    this.material.uniforms.uDirectLightStrength!.value = Number.isFinite(
      atmosphere.sunVisibility,
    ) ? Math.min(1, Math.max(0, atmosphere.sunVisibility)) : 0;
  }

  setExclusions(regions: readonly WaterExclusionRegion[]): void {
    const worldToLocal = this.material.uniforms.uExclusionWorldToLocal!.value as Matrix4[];
    const bounds = this.material.uniforms.uExclusionBounds!.value as Vector4[];
    const lowerBounds = this.material.uniforms.uExclusionLowerBounds!.value as Vector4[];
    const taperStarts = this.material.uniforms.uExclusionTaperStarts!.value as number[];
    const lowerTaperStarts = this.material.uniforms.uExclusionLowerTaperStarts!.value as number[];
    const minimumLocalYs = this.material.uniforms.uExclusionMinimumLocalYs!.value as number[];
    const upperLocalYs = this.material.uniforms.uExclusionUpperLocalYs!.value as number[];
    const activeCount = Math.min(regions.length, MAX_EXCLUSIONS);

    for (let index = 0; index < MAX_EXCLUSIONS; index += 1) {
      worldToLocal[index]!.identity();
      bounds[index]!.set(0, 0, 0, 1);
      lowerBounds[index]!.set(0, 0, 0, 1);
      taperStarts[index] = 0;
      lowerTaperStarts[index] = 0;
      minimumLocalYs[index] = UNBOUNDED_MINIMUM_LOCAL_Y;
      upperLocalYs[index] = UNBOUNDED_MAXIMUM_LOCAL_Y;
    }
    for (let index = 0; index < activeCount; index += 1) {
      worldToLocal[index]!.copy(regions[index]!.worldToLocal);
      bounds[index]!.copy(regions[index]!.bounds);
      lowerBounds[index]!.set(
        -regions[index]!.lowerHalfWidth,
        regions[index]!.lowerHalfWidth,
        -regions[index]!.lowerHalfLength,
        regions[index]!.lowerHalfLength,
      );
      taperStarts[index] = regions[index]!.taperStart;
      lowerTaperStarts[index] = regions[index]!.lowerTaperStart;
      minimumLocalYs[index] = regions[index]!.minimumLocalY ?? UNBOUNDED_MINIMUM_LOCAL_Y;
      upperLocalYs[index] = regions[index]!.upperLocalY;
    }
    this.material.uniforms.uExclusionCount!.value = activeCount;
  }

  follow(worldX: number, worldZ: number): void {
    const snappedX = Math.round(worldX / 10) * 10;
    const snappedZ = Math.round(worldZ / 10) * 10;
    this.mesh.position.set(snappedX, 0, snappedZ);
    (this.material.uniforms.uOrigin!.value as Vector2).set(snappedX, snappedZ);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.mesh.geometry.dispose();
    this.horizonMesh.geometry.dispose();
    this.material.dispose();
  }
}
