import {
  Color,
  type IUniform,
  type Texture,
  Matrix4,
  Vector2,
  Vector3,
  Vector4,
} from 'three';
import { OCEAN_OPTICS_UNIFORMS, OCEAN_OPTICS_FUNCTIONS } from './oceanOptics';
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
  uBloodOceanIntensity: IUniform<number>;
  [name: string]: IUniform;
  uWaterColor: IUniform<Texture | null>;
  uWaterDepth: IUniform<Texture | null>;
  uWaterReflection: IUniform<Texture | null>;
  uWaterReflectionDepth: IUniform<Texture | null>;
  uWaterReflectionSky: IUniform<Color>;
  uWaterOpenRadiance: IUniform<Color>;
  uWaterReflectionMatrix: IUniform<Matrix4>;
  uWaterInverseProjection: IUniform<Matrix4>;
  uWaterViewMatrix: IUniform<Matrix4>;
  uWaterViewport: IUniform<Vector4>;
  uWaterReady: IUniform<number>;
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
  readonly detailFade: readonly [number, number];
  readonly horizonFog: readonly [number, number, number];
  readonly defines: Readonly<Record<string, number>>;
}

const LOW_DEFINES = Object.freeze({});
const HIGH_DEFINES = Object.freeze({ HIGH_QUALITY_WATER: 1 });

const OCEAN_SHADER_QUALITY = Object.freeze({
  low: Object.freeze({
    deepColor: 0x162c35,
    shallowColor: 0x42656a,
    detailFade: Object.freeze([28, 92] as const),
    horizonFog: Object.freeze([150, 650, 0.86] as const),
    defines: LOW_DEFINES,
  }),
  high: Object.freeze({
    deepColor: 0x062932,
    shallowColor: 0x2f7377,
    detailFade: Object.freeze([52, 160] as const),
    horizonFog: Object.freeze([210, 820, 0.78] as const),
    defines: HIGH_DEFINES,
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
    if (uVortexStrength != 0.0) {
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
    }
    displaced.y += height;
    vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
    vViewDepth = length(cameraPosition - worldPosition.xyz);
    vOceanPosition = worldXZ;
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

export const OCEAN_FRAGMENT_SHADER = `
  ${OCEAN_OPTICS_UNIFORMS}
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
  uniform float uBloodOceanIntensity;
  uniform vec3 uShallowColor;
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

  void applyVortexDepression(
    vec2 worldPosition,
    inout float height,
    inout vec2 derivative
  ) {
    if (uVortexStrength == 0.0) return;
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
    applyVortexDepression(worldPosition, height, derivative);
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
    if (vViewDepth >= uDetailFade.y) return vec2(0.0);
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



  ${OCEAN_OPTICS_FUNCTIONS}

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
    #ifdef HIGH_QUALITY_WATER
    vec3 color = shadeHighWater();
    #else
    vec2 detailSlope = warpedDetailSlope(vWorldPosition.xz);
    float waveHeight;
    vec2 waveDerivative;
    sampleSurfaceWave(vOceanPosition, waveHeight, waveDerivative);
    float waveSlope = length(waveDerivative);
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

    float trough = 1.0 - smoothstep(-0.48, 0.38, waveHeight);
    float depthMix = clamp(0.18 + waveHeight * 0.27 + lightFacing * 0.23, 0.0, 1.0);
    vec3 waterBody = mix(uDeepColor, uShallowColor, depthMix);
    waterBody *= 1.0 - trough * 0.16;
    float forwardScatter = pow(clamp(dot(viewDirection, -lightDirection), 0.0, 1.0), 4.0);
    waterBody += uShallowColor * forwardScatter * uDirectLightStrength
      * (0.055 + waveSlope * 0.12);
    float reflectionStrength = clamp(0.07 + fresnel * 0.89, 0.0, 0.95);
    vec3 color = mix(waterBody, reflectedColor, reflectionStrength);

    vec3 halfDirection = normalize(lightDirection + viewDirection);
    float specularFacing = clamp(dot(normal, halfDirection), 0.0, 1.0);
    float windAlignment = 1.0 - abs(dot(
      normalize(vec2(halfDirection.x, halfDirection.z) + vec2(0.0001)),
      normalize(vec2(-0.56, 0.83))
    ));
    float sunCore = pow(specularFacing, 220.0) * 1.24;
    float sunSheen = pow(specularFacing, 38.0) * mix(0.10, 0.24, windAlignment);

    color += uSunColor * (sunCore + sunSheen) * uDirectLightStrength;

    #endif

    // Preserve wave shading in both water quality modes, with opaque crimson depths.
    float bloodLight = clamp(dot(color, vec3(0.2126, 0.7152, 0.0722)) * 2.4, 0.0, 1.0);
    vec3 bloodColor = mix(vec3(0.055, 0.0015, 0.002), vec3(0.42, 0.012, 0.012), bloodLight);
    color = mix(color, bloodColor, uBloodOceanIntensity);
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
    uWaterColor: { value: null },
    uWaterDepth: { value: null },
    uWaterReflection: { value: null },
    uWaterReflectionDepth: { value: null },
    uWaterReflectionSky: { value: new Color() },
    uWaterOpenRadiance: { value: new Color() },
    uWaterReflectionMatrix: { value: new Matrix4() },
    uWaterInverseProjection: { value: new Matrix4() },
    uWaterViewMatrix: { value: new Matrix4() },
    uWaterViewport: { value: new Vector4(0, 0, 1, 1) },
    uWaterReady: { value: 0 },
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
    uBloodOceanIntensity: { value: 0 },
    uShallowColor: { value: new Color() },
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
