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
  low: 8,
  medium: 12,
  high: 16,
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
    float heightFraction = (samplePosition.y - uBaseHeight) / layerHeight;
    float lowerEdge = smoothstep(0.0, 0.15, heightFraction);
    float upperEdge = 1.0 - smoothstep(0.68, 1.0, heightFraction);
    vec3 wind = vec3(uWindOffset.x, 0.0, uWindOffset.y);
    float shape = texture(
      uNoiseTexture,
      samplePosition * uShapeScale + wind * uShapeScale
    ).r;
    float detail = texture(
      uNoiseTexture,
      samplePosition.zyx * uDetailScale - wind * uDetailScale * 1.37
    ).r;
    float threshold = 1.0 - uCoverage;
    float cloud = max(shape - threshold - detail * uErosion, 0.0);
    return cloud * uDensity * lowerEdge * upperEdge;
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
    float rayLength = (uTopHeight - uCameraPosition.y) / rayDirection.y;
    if (travel >= rayLength) {
      outputColor = vec4(0.0);
      return;
    }

    vec3 rayStart = uCameraPosition;
    float stepLength = max((rayLength - travel) / uMaxSteps, 0.5);
    float transmittance = 1.0;
    vec3 accumulated = vec3(0.0);
    float sunAmount = clamp(dot(rayDirection, normalize(uSunDirection)), 0.0, 1.0);
    float phaseFunction = 0.45 + 0.55 * pow(sunAmount, 6.0);

    for (int stepIndex = 0; stepIndex < 28; stepIndex++) {
      if (float(stepIndex) >= uMaxSteps || travel >= rayLength || transmittance < 0.02) break;
      vec3 samplePosition = rayStart + rayDirection * travel;
      float density = sampleCloudDensity(samplePosition);
      if (density > 0.001) {
        float lightDensity = sampleCloudDensity(
          samplePosition + normalize(uSunDirection) * uLightStep
        );
        float sunVisibility = exp(-lightDensity * uLightExtinction);
        vec3 light = uAmbientColor * uAmbientStrength
          + uSunColor * sunVisibility * phaseFunction;
        float alpha = 1.0 - exp(-density * stepLength * uExtinction);
        accumulated += transmittance * alpha * light;
        transmittance *= 1.0 - alpha;
      }
      travel += density > 0.001 ? stepLength : stepLength * 1.8;
    }

    float alpha = (1.0 - transmittance) * uOpacity;
    outputColor = vec4(accumulated * uOpacity, alpha);
  }
`;

function createNoiseTexture(): Data3DTexture {
  const voxelCount = NOISE_SIZE * NOISE_SIZE * NOISE_SIZE;
  const data = new Uint8Array(voxelCount);
  let state = 0x9e3779b9;
  for (let index = 0; index < voxelCount; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    data[index] = state & 0xff;
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
          uLightExtinction: { value: calm.extinction * 24 },
          uLightStep: { value: 18 },
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
      profile.extinction * 24,
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
