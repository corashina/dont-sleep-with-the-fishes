import {
  Color,
  Matrix4,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
} from 'three';
import { DEFAULT_WAVES, createWaveUniformPayload } from './WaveField';
import type { WaterExclusionRegion } from './WaterExclusion';
import { SUN_DIRECTION } from '../world/celestialLight';

const MAX_EXCLUSIONS = 2;

export const OCEAN_SURFACE_QUALITY = Object.freeze({
  segments: 192,
  detailFadeNear: 28,
  detailFadeFar: 92,
});

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
  uniform vec3 uSunColor;
  uniform float uDirectLightStrength;
  uniform float uFogDensity;
  uniform vec3 uLightDirection;
  uniform int uExclusionCount;
  uniform mat4 uExclusionWorldToLocal[2];
  uniform vec4 uExclusionBounds[2];
  uniform float uExclusionTaperStarts[2];
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

  float foamBreakup(vec2 worldPosition) {
    vec2 wind = normalize(vec2(0.83, 0.56));
    vec2 crossWind = vec2(-wind.y, wind.x);
    vec2 warped = worldPosition + windWarp(worldPosition) * 0.65;
    float broad = 0.5 + 0.5 * sin(
      dot(warped, wind) * 1.38
      + sin(dot(warped, crossWind) * 0.74 - uTime * 0.31)
      + uTime * 0.18
    );
    float fine = 0.5 + 0.5 * sin(
      dot(warped, normalize(vec2(-0.41, 0.91))) * 4.85
      - uTime * 0.76
    );
    return smoothstep(0.34, 0.72, broad * 0.68 + fine * 0.32);
  }

  float crestFoam(float waveHeight, float waveSlope) {
    float roughness = clamp((uAmplitudeScale - 0.85) / 0.65, 0.0, 1.0);
    float crestStart = mix(0.53, 0.37, roughness);
    float slopeStart = mix(0.24, 0.16, roughness);
    float crest = smoothstep(crestStart, crestStart + 0.28, waveHeight);
    float breaking = smoothstep(slopeStart, slopeStart + 0.24, waveSlope);
    float coverage = mix(0.66, 0.92, roughness);
    return crest * breaking * coverage;
  }

  void main() {
    for (int i = 0; i < 2; i++) {
      if (i < uExclusionCount) {
        vec3 exclusionLocal = (uExclusionWorldToLocal[i] * vec4(vWorldPosition, 1.0)).xyz;
        vec4 exclusionBounds = uExclusionBounds[i];
        float exclusionHalfWidth = max(abs(exclusionBounds.x), abs(exclusionBounds.y));
        float exclusionHalfLength = max(abs(exclusionBounds.z), abs(exclusionBounds.w));
        float exclusionAbsZ = abs(exclusionLocal.z);
        float taperSpan = max(exclusionHalfLength - uExclusionTaperStarts[i], 0.0);
        float taperProgress = 0.0;
        if (taperSpan > 0.0) {
          taperProgress = clamp(
            (exclusionAbsZ - uExclusionTaperStarts[i]) / taperSpan,
            0.0,
            1.0
          );
        }
        float localHalfWidth = exclusionHalfWidth
          * sqrt(max(0.0, 1.0 - taperProgress * taperProgress));
        if (exclusionAbsZ <= exclusionHalfLength && abs(exclusionLocal.x) <= localHalfWidth) {
          discard;
        }
      }
    }
    vec2 detailSlope = warpedDetailSlope(vWorldPosition.xz);
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

    float foam = crestFoam(vHeight, vWaveSlope) * foamBreakup(vWorldPosition.xz);
    foam *= 1.0 - smoothstep(uDetailFade.y * 0.72, uDetailFade.y, vViewDepth);
    color += uSunColor * (sunCore + sunSheen) * uDirectLightStrength
      * (1.0 - foam * 0.78);
    color = mix(color, uFoamColor, foam * 0.74);

    float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * vViewDepth * vViewDepth);
    color = mix(color, uFogColor, clamp(fogFactor, 0.0, 1.0));
    gl_FragColor = vec4(color, 0.98);
    #include <colorspace_fragment>
    gl_FragColor.rgb += orderedDither(gl_FragCoord.xy);
  }
`;

export class OceanRenderer {
  readonly material: ShaderMaterial;
  readonly mesh: Mesh<PlaneGeometry, ShaderMaterial>;

  constructor() {
    const payload = createWaveUniformPayload(DEFAULT_WAVES);
    this.material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: false,
      uniforms: {
        uTime: { value: 0 },
        uAmplitudeScale: { value: 1 },
        uOrigin: { value: new Vector2() },
        uDetailFade: {
          value: new Vector2(
            OCEAN_SURFACE_QUALITY.detailFadeNear,
            OCEAN_SURFACE_QUALITY.detailFadeFar,
          ),
        },
        uDirections: { value: payload.directions.map(([x, y]) => new Vector2(x, y)) },
        uParameters: { value: payload.parameters.map(([x, y, z, w]) => new Vector4(x, y, z, w)) },
        uPhases: { value: payload.phases },
        uDeepColor: { value: new Color(0x162c35) },
        uShallowColor: { value: new Color(0x42656a) },
        uFoamColor: { value: new Color(0xb7b7a5) },
        uFogColor: { value: new Color(0x27343b) },
        uSkyColor: { value: new Color(0x496b75) },
        uHorizonColor: { value: new Color(0x6f8587) },
        uSunColor: { value: new Color(0xfff1cf) },
        uDirectLightStrength: { value: 1 },
        uFogDensity: { value: 0.018 },
        uLightDirection: { value: new Vector3(...SUN_DIRECTION).normalize() },
        uExclusionCount: { value: 0 },
        uExclusionWorldToLocal: { value: [new Matrix4(), new Matrix4()] },
        uExclusionBounds: { value: [new Vector4(), new Vector4()] },
        uExclusionTaperStarts: { value: [0, 0] },
      },
    });
    const geometry = new PlaneGeometry(
      180,
      180,
      OCEAN_SURFACE_QUALITY.segments,
      OCEAN_SURFACE_QUALITY.segments,
    );
    geometry.rotateX(-Math.PI / 2);
    this.mesh = new Mesh(geometry, this.material);
    this.mesh.name = 'procedural-ocean';
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
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
    const taperStarts = this.material.uniforms.uExclusionTaperStarts!.value as number[];
    const activeCount = Math.min(regions.length, MAX_EXCLUSIONS);

    for (let index = 0; index < MAX_EXCLUSIONS; index += 1) {
      worldToLocal[index]!.identity();
      bounds[index]!.set(0, 0, 0, 1);
      taperStarts[index] = 0;
    }
    for (let index = 0; index < activeCount; index += 1) {
      worldToLocal[index]!.copy(regions[index]!.worldToLocal);
      bounds[index]!.copy(regions[index]!.bounds);
      taperStarts[index] = regions[index]!.taperStart;
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
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
