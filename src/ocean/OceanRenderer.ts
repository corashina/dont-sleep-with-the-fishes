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

const vertexShader = `
  uniform float uTime;
  uniform float uAmplitudeScale;
  uniform vec2 uOrigin;
  uniform vec2 uDirections[4];
  uniform vec4 uParameters[4];
  uniform float uPhases[4];
  varying float vHeight;
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
    vViewDepth = length(cameraPosition - worldPosition.xyz);
    vWorldNormal = normalize(mat3(modelMatrix) * localNormal);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const fragmentShader = `
  uniform vec3 uDeepColor;
  uniform vec3 uShallowColor;
  uniform vec3 uFoamColor;
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  uniform vec3 uLightDirection;
  uniform int uExclusionCount;
  uniform mat4 uExclusionWorldToLocal[2];
  uniform vec4 uExclusionBounds[2];
  varying float vHeight;
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
    float facing = clamp(dot(normalize(vWorldNormal), normalize(uLightDirection)), 0.0, 1.0);
    float crest = smoothstep(0.48, 0.82, vHeight);
    float depthMix = clamp(0.42 + vHeight * 0.25 + facing * 0.25, 0.0, 1.0);
    vec3 color = mix(uDeepColor, uShallowColor, depthMix);
    color = mix(color, uFoamColor, crest * 0.42);
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

  update(timeSeconds: number, amplitudeScale: number, fogDensity: number): void {
    this.material.uniforms.uTime!.value = timeSeconds;
    this.material.uniforms.uAmplitudeScale!.value = amplitudeScale;
    this.material.uniforms.uFogDensity!.value = fogDensity;
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
