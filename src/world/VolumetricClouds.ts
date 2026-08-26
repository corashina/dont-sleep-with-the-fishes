import {
  BackSide,
  Color,
  Data3DTexture,
  GLSL3,
  LinearFilter,
  Mesh,
  RedFormat,
  RepeatWrapping,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  UnsignedByteType,
  Vector2,
  Vector3,
} from 'three';
import type { VisualQuality } from '../rendering/visualQuality';
import { SUN_DIRECTION } from './celestialLight';
import { ignoreCleanupError, runCleanupSteps } from './SceneResources';
import type { SkyPalette, SkyState } from './skyPalette';
import {
  volumetricCloudProfile,
  type VolumetricCloudProfile,
} from './volumetricCloudProfiles';

const NOISE_SIZE = 64;
const CLOUD_RADIUS = 900;
const QUALITY_STEPS: Readonly<Record<VisualQuality, number>> = Object.freeze({
  low: 12,
  medium: 20,
  high: 28,
});

export interface VolumetricCloudUpdate {
  readonly time: number;
  readonly delta: number;
  readonly cameraPosition: Readonly<Vector3>;
  readonly state: Readonly<SkyState>;
  readonly palette: Readonly<SkyPalette>;
}

const vertexShader = `
  out vec3 vRayDirection;

  void main() {
    vRayDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  precision highp float;
  precision highp sampler3D;

  uniform sampler3D uNoiseTexture;
  uniform vec3 uCameraPosition;
  uniform vec3 uSunDirection;
  uniform vec3 uAmbientColor;
  uniform vec3 uSunColor;
  uniform vec2 uWindOffset;
  uniform float uTime;
  uniform float uOpacity;
  uniform float uCoverage;
  uniform float uDensity;
  uniform float uBaseHeight;
  uniform float uTopHeight;
  uniform float uShapeScale;
  uniform float uDetailScale;
  uniform float uErosion;
  uniform float uAmbientStrength;
  uniform float uExtinction;
  uniform float uLightExtinction;
  uniform float uLightStep;
  uniform float uMaxSteps;

  in vec3 vRayDirection;
  out vec4 outputColor;

  float sampleCloudDensity(vec3 samplePosition) {
    float layerHeight = max(uTopHeight - uBaseHeight, 0.001);
    float heightFraction = clamp(
      (samplePosition.y - uBaseHeight) / layerHeight,
      0.0,
      1.0
    );
    vec3 wind = vec3(uWindOffset.x, 0.0, uWindOffset.y);
    vec2 shapeCoordinates = (
      samplePosition.xz + uWindOffset + vec2(190.0, -310.0)
    ) * uShapeScale;
    float groupNoise = texture(
      uNoiseTexture,
      vec3(shapeCoordinates * 0.46, 0.17)
    ).r;
    float lobeNoise = texture(
      uNoiseTexture,
      vec3(shapeCoordinates * 1.32 + vec2(0.31, -0.27), 0.59)
    ).r;
    float crownNoise = texture(
      uNoiseTexture,
      vec3(shapeCoordinates * 2.75 + vec2(-0.19, 0.41), 0.83)
    ).r;
    float threshold = mix(0.66, 0.31, uCoverage);
    float groupShape = groupNoise * 0.78 + lobeNoise * 0.22;
    float cloudGroup = smoothstep(
      threshold,
      threshold + 0.12,
      groupShape
    );
    float towerCore = smoothstep(
      threshold + 0.02,
      threshold + 0.16,
      groupNoise * 0.84 + lobeNoise * 0.16
    );
    float towerShape = smoothstep(0.3, 0.72, lobeNoise)
      * cloudGroup;
    float smallLobes = smoothstep(0.3, 0.72, crownNoise)
      * cloudGroup;
    float crownTop = clamp(
      0.18
        + pow(cloudGroup, 0.55) * 0.28
        + towerCore * 0.2
        + towerShape * 0.12
        + smallLobes * 0.06,
      0.16,
      0.86
    );
    float lowerEdge = smoothstep(0.0, 0.045, heightFraction);
    float detail = texture(
      uNoiseTexture,
      samplePosition.zyx * uDetailScale - wind * uDetailScale * 1.37
    ).r;
    float sideField = cloudGroup + (detail - 0.5) * 0.28;
    float billowedSides = smoothstep(0.08, 0.38, sideField)
      * smoothstep(0.0, 0.18, cloudGroup);
    float topField = crownTop - heightFraction + (detail - 0.5) * 0.24;
    float billowedTop = smoothstep(-0.04, 0.12, topField);
    float solidBody = billowedSides * lowerEdge * billowedTop;
    float sideBoundary = 1.0 - smoothstep(0.18, 0.72, cloudGroup);
    float topBoundary = smoothstep(
      max(0.0, crownTop - 0.3),
      crownTop,
      heightFraction
    );
    float boundaryErosion = max(sideBoundary, topBoundary);
    float erodedBoundary = solidBody
      - (1.0 - detail) * uErosion * boundaryErosion * 0.42;
    float cloud = smoothstep(0.03, 0.2, erodedBoundary);
    return cloud * uDensity;
  }

  void main() {
    vec3 rayDirection = normalize(vRayDirection);
    if (rayDirection.y <= 0.0) {
      outputColor = vec4(0.0);
      return;
    }

    float travel = max(
      0.0,
      (uBaseHeight - uCameraPosition.y) / rayDirection.y
    );
    float cloudDistance = min(
      (uTopHeight - uCameraPosition.y) / rayDirection.y,
      880.0
    );
    if (travel >= cloudDistance) {
      outputColor = vec4(0.0);
      return;
    }

    vec3 rayStart = uCameraPosition;
    float stepLength = max((cloudDistance - travel) / uMaxSteps, 0.5);
    float rayJitter = fract(
      52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))
    );
    travel += rayJitter * stepLength;
    float transmittance = 1.0;
    vec3 accumulated = vec3(0.0);
    float sunAmount = clamp(dot(rayDirection, normalize(uSunDirection)), 0.0, 1.0);
    float phaseFunction = 0.7 + 0.9 * pow(sunAmount, 6.0);

    for (int stepIndex = 0; stepIndex < 28; stepIndex++) {
      if (float(stepIndex) >= uMaxSteps || travel >= cloudDistance || transmittance < 0.02) break;
      vec3 samplePosition = rayStart + rayDirection * travel;
      float density = sampleCloudDensity(samplePosition);
      float distanceFade = 1.0 - smoothstep(
        max(0.0, cloudDistance - 180.0),
        cloudDistance,
        travel
      );
      density *= distanceFade;
      if (density > 0.001) {
        float lightDensity = sampleCloudDensity(
          samplePosition + normalize(uSunDirection) * uLightStep
        );
        float sunVisibility = exp(-lightDensity * uLightExtinction);
        float heightFraction = clamp(
          (samplePosition.y - uBaseHeight) / max(uTopHeight - uBaseHeight, 0.001),
          0.0,
          1.0
        );
        float heightLight = mix(
          0.34,
          1.28,
          smoothstep(0.05, 0.9, heightFraction)
        );
        vec3 light = uAmbientColor * uAmbientStrength * mix(0.44, 1.0, heightFraction)
          + uSunColor * sunVisibility * phaseFunction * heightLight;
        float alpha = 1.0 - exp(-density * stepLength * uExtinction);
        accumulated += transmittance * alpha * light;
        transmittance *= 1.0 - alpha;
      }
      travel += stepLength;
    }

    float rawAlpha = (1.0 - transmittance) * uOpacity;
    float edgeOpacity = smoothstep(0.0, 0.22, rawAlpha);
    float alpha = rawAlpha * edgeOpacity;
    outputColor = vec4(accumulated * uOpacity * edgeOpacity, alpha);
  }
`;

function hashLattice(x: number, y: number, z: number): number {
  let value = Math.imul(x, 0x1f123bb5)
    ^ Math.imul(y, 0x5f356495)
    ^ Math.imul(z, 0x6c8e9cf5)
    ^ 0x9e3779b9;
  value ^= value >>> 15;
  value = Math.imul(value, 0x2c1b3c6d);
  value ^= value >>> 12;
  value = Math.imul(value, 0x297a2d39);
  value ^= value >>> 15;
  return (value >>> 0) / 0xffffffff;
}

function smooth(value: number): number {
  return value * value * (3 - 2 * value);
}

function interpolate(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

function periodicValueNoise(
  x: number,
  y: number,
  z: number,
  frequency: number,
): number {
  const sampleX = x * frequency / NOISE_SIZE;
  const sampleY = y * frequency / NOISE_SIZE;
  const sampleZ = z * frequency / NOISE_SIZE;
  const x0 = Math.floor(sampleX) % frequency;
  const y0 = Math.floor(sampleY) % frequency;
  const z0 = Math.floor(sampleZ) % frequency;
  const x1 = (x0 + 1) % frequency;
  const y1 = (y0 + 1) % frequency;
  const z1 = (z0 + 1) % frequency;
  const tx = smooth(sampleX - Math.floor(sampleX));
  const ty = smooth(sampleY - Math.floor(sampleY));
  const tz = smooth(sampleZ - Math.floor(sampleZ));
  const bottomNear = interpolate(
    hashLattice(x0, y0, z0),
    hashLattice(x1, y0, z0),
    tx,
  );
  const bottomFar = interpolate(
    hashLattice(x0, y1, z0),
    hashLattice(x1, y1, z0),
    tx,
  );
  const topNear = interpolate(
    hashLattice(x0, y0, z1),
    hashLattice(x1, y0, z1),
    tx,
  );
  const topFar = interpolate(
    hashLattice(x0, y1, z1),
    hashLattice(x1, y1, z1),
    tx,
  );
  return interpolate(
    interpolate(bottomNear, bottomFar, ty),
    interpolate(topNear, topFar, ty),
    tz,
  );
}

function createNoiseTexture(): Data3DTexture {
  const voxelCount = NOISE_SIZE * NOISE_SIZE * NOISE_SIZE;
  const data = new Uint8Array(voxelCount);
  let index = 0;
  for (let z = 0; z < NOISE_SIZE; z += 1) {
    for (let y = 0; y < NOISE_SIZE; y += 1) {
      for (let x = 0; x < NOISE_SIZE; x += 1) {
        const value = periodicValueNoise(x, y, z, 3) * 0.58
          + periodicValueNoise(x, y, z, 6) * 0.28
          + periodicValueNoise(x, y, z, 12) * 0.14;
        const contrasted = Math.max(0, Math.min(1, (value - 0.2) / 0.62));
        data[index] = Math.round(contrasted * 255);
        index += 1;
      }
    }
  }

  const texture = new Data3DTexture(data, NOISE_SIZE, NOISE_SIZE, NOISE_SIZE);
  texture.format = RedFormat;
  texture.type = UnsignedByteType;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.wrapR = RepeatWrapping;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function blend(current: number, target: number, amount: number): number {
  return current + (target - current) * amount;
}

function moveToward(current: number, target: number, amount: number): number {
  return current < target
    ? Math.min(target, current + amount)
    : Math.max(target, current - amount);
}

export class VolumetricClouds {
  readonly material: ShaderMaterial;
  readonly mesh: Mesh<SphereGeometry, ShaderMaterial>;
  private readonly noiseTexture: Data3DTexture;
  private readonly windVelocity = new Vector2();
  private targetProfile: Readonly<VolumetricCloudProfile>;
  private targetStrength = 0;
  private enabled = false;
  private strength = 0;
  private disposed = false;

  constructor(
    private readonly scene: Scene,
    quality: VisualQuality,
  ) {
    const calm = volumetricCloudProfile('calm');
    this.targetProfile = calm;
    this.windVelocity.set(calm.wind.x, calm.wind.y);
    let noiseTexture: Data3DTexture | undefined;
    let material: ShaderMaterial | undefined;
    let geometry: SphereGeometry | undefined;
    let mesh: Mesh<SphereGeometry, ShaderMaterial> | undefined;
    try {
      noiseTexture = createNoiseTexture();
      material = new ShaderMaterial({
        glslVersion: GLSL3,
        vertexShader,
        fragmentShader,
        side: BackSide,
        depthTest: true,
        depthWrite: false,
        transparent: true,
        premultipliedAlpha: true,
        uniforms: {
          uNoiseTexture: { value: noiseTexture },
          uCameraPosition: { value: new Vector3() },
          uSunDirection: { value: new Vector3(...SUN_DIRECTION).normalize() },
          uAmbientColor: { value: new Color() },
          uSunColor: { value: new Color() },
          uWindOffset: { value: new Vector2() },
          uTime: { value: 0 },
          uOpacity: { value: 0 },
          uCoverage: { value: calm.coverage },
          uDensity: { value: calm.density },
          uBaseHeight: { value: calm.baseHeight },
          uTopHeight: { value: calm.topHeight },
          uShapeScale: { value: calm.shapeScale },
          uDetailScale: { value: calm.detailScale },
          uErosion: { value: calm.erosion },
          uAmbientStrength: { value: calm.ambient },
          uExtinction: { value: calm.extinction },
          uLightExtinction: { value: calm.extinction * 72 },
          uLightStep: { value: 48 },
          uMaxSteps: { value: QUALITY_STEPS[quality] },
        },
      });
      geometry = new SphereGeometry(CLOUD_RADIUS, 32, 16);
      mesh = new Mesh(geometry, material);
      mesh.name = 'volumetric-clouds';
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = -900;
      scene.add(mesh);
    } catch (error) {
      ignoreCleanupError(() => runCleanupSteps([
        () => mesh?.removeFromParent(),
        () => geometry?.dispose(),
        () => material?.dispose(),
        () => noiseTexture?.dispose(),
      ]));
      throw error;
    }
    this.noiseTexture = noiseTexture;
    this.material = material;
    this.mesh = mesh;
  }

  setEnabled(value: boolean): void {
    if (this.disposed) return;
    this.enabled = value;
  }

  setQuality(value: VisualQuality): void {
    if (this.disposed) return;
    this.material.uniforms.uMaxSteps!.value = QUALITY_STEPS[value];
  }

  update(frame: VolumetricCloudUpdate): number {
    if (this.disposed) return 0;

    const delta = Math.max(0, finite(frame.delta));
    const transition = Math.min(1, delta);
    this.targetStrength = this.enabled && frame.state.phase !== 'night' ? 1 : 0;
    this.strength = moveToward(this.strength, this.targetStrength, delta);

    const x = finite(frame.cameraPosition.x);
    const y = finite(frame.cameraPosition.y);
    const z = finite(frame.cameraPosition.z);
    this.mesh.position.set(x, y, z);

    this.targetProfile = volumetricCloudProfile(frame.state.weather);
    const profile = this.targetProfile;
    const time = finite(frame.time);
    const uniforms = this.material.uniforms;
    (uniforms.uCameraPosition!.value as Vector3).set(x, y, z);
    (uniforms.uAmbientColor!.value as Color)
      .lerp(frame.palette.ambientLightColor, transition);
    (uniforms.uSunColor!.value as Color).lerp(frame.palette.sunColor, transition);
    this.windVelocity.lerp(profile.wind, transition);
    (uniforms.uWindOffset!.value as Vector2)
      .addScaledVector(this.windVelocity, delta);
    uniforms.uTime!.value = time;
    uniforms.uOpacity!.value = this.strength;
    uniforms.uCoverage!.value = blend(
      uniforms.uCoverage!.value as number,
      profile.coverage,
      transition,
    );
    uniforms.uDensity!.value = blend(
      uniforms.uDensity!.value as number,
      profile.density,
      transition,
    );
    uniforms.uBaseHeight!.value = blend(
      uniforms.uBaseHeight!.value as number,
      profile.baseHeight,
      transition,
    );
    uniforms.uTopHeight!.value = blend(
      uniforms.uTopHeight!.value as number,
      profile.topHeight,
      transition,
    );
    uniforms.uShapeScale!.value = blend(
      uniforms.uShapeScale!.value as number,
      profile.shapeScale,
      transition,
    );
    uniforms.uDetailScale!.value = blend(
      uniforms.uDetailScale!.value as number,
      profile.detailScale,
      transition,
    );
    uniforms.uErosion!.value = blend(
      uniforms.uErosion!.value as number,
      profile.erosion,
      transition,
    );
    uniforms.uAmbientStrength!.value = blend(
      uniforms.uAmbientStrength!.value as number,
      profile.ambient,
      transition,
    );
    uniforms.uExtinction!.value = blend(
      uniforms.uExtinction!.value as number,
      profile.extinction,
      transition,
    );
    uniforms.uLightExtinction!.value = blend(
      uniforms.uLightExtinction!.value as number,
      profile.extinction * 72,
      transition,
    );
    this.mesh.visible = this.strength > 0;
    return this.strength;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.enabled = false;
    this.strength = 0;
    this.mesh.visible = false;
    runCleanupSteps([
      () => this.scene.remove(this.mesh),
      () => this.mesh.geometry.dispose(),
      () => this.material.dispose(),
      () => this.noiseTexture.dispose(),
    ]);
  }
}

export function tryCreateVolumetricClouds(
  scene: Scene,
  quality: VisualQuality,
  reportFallback: (error: unknown) => void = (error) =>
    console.warn('Volumetric clouds unavailable; using flat clouds.', error),
  create: (target: Scene, value: VisualQuality) => VolumetricClouds =
    (target, value) => new VolumetricClouds(target, value),
): VolumetricClouds | null {
  try {
    return create(scene, quality);
  } catch (error) {
    reportFallback(error);
    return null;
  }
}
