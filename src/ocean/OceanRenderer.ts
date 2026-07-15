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

const MAX_EXCLUSIONS = 2;

export interface OceanAtmosphere {
  fogColor: Color;
  horizonColor: Color;
  skyColor: Color;
  sunColor: Color;
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
  uniform vec3 uDeepColor;
  uniform vec3 uShallowColor;
  uniform vec3 uFoamColor;
  uniform vec3 uFogColor;
  uniform vec3 uSkyColor;
  uniform vec3 uHorizonColor;
  uniform vec3 uSunColor;
  uniform float uFogDensity;
  uniform vec3 uLightDirection;
  uniform int uExclusionCount;
  uniform mat4 uExclusionWorldToLocal[2];
  uniform vec4 uExclusionBounds[2];
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

  vec2 rippleSlope(vec2 worldPosition) {
    vec2 directionA = normalize(vec2(0.83, 0.56));
    vec2 directionB = normalize(vec2(-0.48, 0.88));
    vec2 directionC = normalize(vec2(0.18, -0.98));
    float rippleA = cos(dot(worldPosition, directionA) * 3.1 + uTime * 1.65);
    float rippleB = cos(dot(worldPosition, directionB) * 5.3 - uTime * 2.05);
    float rippleC = cos(dot(worldPosition, directionC) * 8.7 + uTime * 2.55);
    return directionA * rippleA * 0.085
      + directionB * rippleB * 0.045
      + directionC * rippleC * 0.018;
  }

  void main() {
    for (int i = 0; i < 2; i++) {
      if (i < uExclusionCount) {
        vec3 exclusionLocal = (uExclusionWorldToLocal[i] * vec4(vWorldPosition, 1.0)).xyz;
        vec4 exclusionBounds = uExclusionBounds[i];
        if (
          exclusionLocal.x >= exclusionBounds.x &&
          exclusionLocal.x <= exclusionBounds.y &&
          exclusionLocal.z >= exclusionBounds.z &&
          exclusionLocal.z <= exclusionBounds.w
        ) {
          discard;
        }
      }
    }
    vec2 detailSlope = rippleSlope(vWorldPosition.xz);
    vec3 normal = normalize(vWorldNormal + vec3(-detailSlope.x, 0.0, -detailSlope.y));
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    vec3 lightDirection = normalize(uLightDirection);
    float facing = clamp(dot(normal, lightDirection), 0.0, 1.0);
    float viewFacing = clamp(dot(normal, viewDirection), 0.0, 1.0);

    float fresnel = 0.02 + 0.98 * pow(1.0 - viewFacing, 5.0);
    vec3 reflectionDirection = reflect(-viewDirection, normal);
    float reflectedSky = smoothstep(-0.08, 0.72, reflectionDirection.y);
    vec3 reflectedColor = mix(uHorizonColor, uSkyColor, reflectedSky);

    float depthMix = clamp(0.28 + vHeight * 0.22 + facing * 0.24, 0.0, 1.0);
    vec3 waterBody = mix(uDeepColor, uShallowColor, depthMix);
    float forwardScatter = pow(clamp(dot(viewDirection, -lightDirection), 0.0, 1.0), 4.0);
    waterBody += uShallowColor * forwardScatter * (0.08 + vWaveSlope * 0.14);
    vec3 color = mix(waterBody, reflectedColor, clamp(0.06 + fresnel * 0.86, 0.0, 0.94));

    vec3 halfDirection = normalize(lightDirection + viewDirection);
    float specularFacing = clamp(dot(normal, halfDirection), 0.0, 1.0);
    float sunGlint = pow(specularFacing, 180.0) * 1.15
      + pow(specularFacing, 34.0) * 0.18;

    float crest = smoothstep(0.38, 0.78, vHeight);
    float breakingWave = smoothstep(0.12, 0.38, vWaveSlope + crest * 0.18);
    float foamBreakup = 0.5 + 0.5 * sin(
      vWorldPosition.x * 1.75
      + vWorldPosition.z * 1.27
      + sin(vWorldPosition.z * 2.35 - uTime * 0.7)
    );
    float foam = crest * breakingWave * smoothstep(0.26, 0.72, foamBreakup + crest * 0.22);
    color += uSunColor * sunGlint * (1.0 - foam * 0.75);
    color = mix(color, uFoamColor, foam * 0.68);
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
        uFogDensity: { value: 0.018 },
        uLightDirection: { value: new Vector3(-0.4, 0.85, 0.25) },
        uExclusionCount: { value: 0 },
        uExclusionWorldToLocal: { value: [new Matrix4(), new Matrix4()] },
        uExclusionBounds: { value: [new Vector4(), new Vector4()] },
      },
    });
    const geometry = new PlaneGeometry(180, 180, 128, 128);
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
  }

  setExclusions(regions: readonly WaterExclusionRegion[]): void {
    const worldToLocal = this.material.uniforms.uExclusionWorldToLocal!.value as Matrix4[];
    const bounds = this.material.uniforms.uExclusionBounds!.value as Vector4[];
    const activeCount = Math.min(regions.length, MAX_EXCLUSIONS);

    for (let index = 0; index < MAX_EXCLUSIONS; index += 1) {
      worldToLocal[index]!.identity();
      bounds[index]!.set(0, 0, 0, 1);
    }
    for (let index = 0; index < activeCount; index += 1) {
      worldToLocal[index]!.copy(regions[index]!.worldToLocal);
      bounds[index]!.copy(regions[index]!.bounds);
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
