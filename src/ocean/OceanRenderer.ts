import {
  BufferGeometry,
  Mesh,
  ShaderMaterial,
  type Camera,
  type Color,
  type Material,
  type Scene,
  type WebGLRenderer,
} from 'three';
import { OceanCapture } from './OceanCapture';
import { OceanFoam } from './OceanFoam';
import { applyHighWaterLook } from './highWaterLook';
import type { VortexWaveState } from './WaveField';
import {
  UNBOUNDED_MAXIMUM_LOCAL_Y,
  UNBOUNDED_MINIMUM_LOCAL_Y,
  type WaterExclusionRegion,
} from './WaterExclusion';
import {
  SUN_DIRECTION,
  type CelestialDirection,
} from '../world/celestialLight';
import {
  ignoreCleanupError,
  runCleanupSteps,
} from '../world/SceneResources';
import type { WaterQuality } from '../rendering/waterQuality';
import {
  MAX_OCEAN_EXCLUSIONS,
  applyOceanShaderQuality,
  createOceanShaderDefinition,
  type OceanShaderUniforms,
} from './oceanShader';
import {
  createOceanHorizonGeometry,
  createOceanSurfaceGeometry,
} from './oceanGeometry';

interface OceanSurfaceQuality {
  readonly segments: number;
  readonly surfaceExtent: number;
  readonly horizonHalfExtent: number;
  readonly horizonRadialSegments: number;
  readonly horizonRadialExponent: number;
}

const OCEAN_SURFACE_QUALITY = Object.freeze({
  low: Object.freeze({
    segments: 192,
    surfaceExtent: 180,
    horizonHalfExtent: 1100,
    horizonRadialSegments: 48,
    horizonRadialExponent: 1.75,
  }),
  high: Object.freeze({
    segments: 288,
    surfaceExtent: 180,
    horizonHalfExtent: 1100,
    horizonRadialSegments: 72,
    horizonRadialExponent: 1.75,
  }),
}) satisfies Readonly<Record<WaterQuality, Readonly<OceanSurfaceQuality>>>;

const finiteOrZero = (value: number): number => Number.isFinite(value) ? value : 0;

export interface OceanAtmosphere {
  phase: 'day' | 'night';
  fogColor: Color;
  horizonColor: Color;
  skyColor: Color;
  sunColor: Color;
  sunVisibility: number;
}

export class OceanRenderer {
  readonly material: ShaderMaterial;
  readonly mesh: Mesh<BufferGeometry, ShaderMaterial>;
  readonly horizonMesh: Mesh<BufferGeometry, ShaderMaterial>;
  private readonly uniforms: OceanShaderUniforms;
  private quality: WaterQuality;
  private disposed = false;
  private capture: OceanCapture | null = null;
  private foam: OceanFoam | null = null;
  private updateVersion = 0;
  private preparedVersion = -1;
  private preparedCamera: Camera | null = null;
  private preparing = false;
  private atmosphere: OceanAtmosphere | undefined;
  private fogDensity = 0;

  constructor(
    quality: WaterQuality = 'low',
    private readonly lightDirection: CelestialDirection = SUN_DIRECTION,
  ) {
    this.quality = quality;
    const surfaceQuality = OCEAN_SURFACE_QUALITY[quality];
    const definition = createOceanShaderDefinition(quality);
    definition.uniforms.uLightDirection.value
      .set(...lightDirection)
      .normalize();
    const material = new ShaderMaterial({
      vertexShader: definition.vertexShader,
      fragmentShader: definition.fragmentShader,
      transparent: false,
      defines: definition.defines,
      uniforms: definition.uniforms,
    });
    let surface: BufferGeometry | undefined;
    let horizon: BufferGeometry | undefined;
    try {
      surface = createOceanSurfaceGeometry(surfaceQuality);
      const mesh = new Mesh(surface, material);
      mesh.name = 'procedural-ocean';
      mesh.frustumCulled = false;
      mesh.receiveShadow = true;
      horizon = createOceanHorizonGeometry(surfaceQuality);
      const horizonMesh = new Mesh(horizon, material);
      horizonMesh.name = 'procedural-ocean-horizon';
      horizonMesh.frustumCulled = false;
      mesh.add(horizonMesh);
      this.uniforms = definition.uniforms;
      this.applyAtmosphere();
      this.material = material;
      this.mesh = mesh;
      this.horizonMesh = horizonMesh;
      mesh.onBeforeRender = this.prepareWater;
      horizonMesh.onBeforeRender = this.prepareWater;
      if (quality === 'high') this.createHighResources();
    } catch (error) {
      ignoreCleanupError(() => runCleanupSteps([
        () => surface?.dispose(),
        () => horizon?.dispose(),
        () => material.dispose(),
      ]));
      throw error;
    }
  }

  setQuality(value: WaterQuality): void {
    if (this.disposed || value === this.quality) return;
    const surfaceQuality = OCEAN_SURFACE_QUALITY[value];
    const nextSurface = createOceanSurfaceGeometry(surfaceQuality);
    let nextHorizon: BufferGeometry;
    try {
      nextHorizon = createOceanHorizonGeometry(surfaceQuality);
      if (value === 'high') this.createHighResources();
    } catch (error) {
      ignoreCleanupError(() => nextSurface.dispose());
      ignoreCleanupError(() => nextHorizon?.dispose());
      throw error;
    }
    const previousSurface = this.mesh.geometry;
    const previousHorizon = this.horizonMesh.geometry;
    this.mesh.geometry = nextSurface;
    this.horizonMesh.geometry = nextHorizon;
    this.material.defines = applyOceanShaderQuality(this.uniforms, value);
    this.material.needsUpdate = true;
    this.quality = value;
    this.applyAtmosphere();
    this.preparedVersion = -1;
    runCleanupSteps([
      () => { if (value === 'low') this.releaseHighResources(); },
      () => previousSurface.dispose(),
      () => previousHorizon.dispose(),
    ]);
  }

  update(
    timeSeconds: number,
    amplitudeScale: number,
    fogDensity: number,
    atmosphere?: OceanAtmosphere,
  ): void {
    this.updateVersion += 1;
    this.uniforms.uTime.value = timeSeconds;
    this.uniforms.uAmplitudeScale.value = amplitudeScale;
    this.fogDensity = fogDensity;
    this.atmosphere = atmosphere;
    this.applyAtmosphere();
  }

  private applyAtmosphere(): void {
    if (this.quality === 'high') {
      applyHighWaterLook(this.uniforms, this.atmosphere?.phase ?? 'day');
      return;
    }
    this.uniforms.uLightDirection.value.set(...this.lightDirection).normalize();
    this.uniforms.uFogDensity.value = this.fogDensity;
    const atmosphere = this.atmosphere;
    if (!atmosphere) return;
    this.uniforms.uFogColor.value.copy(atmosphere.fogColor);
    this.uniforms.uHorizonColor.value.copy(atmosphere.horizonColor);
    this.uniforms.uSkyColor.value.copy(atmosphere.skyColor);
    this.uniforms.uSunColor.value.copy(atmosphere.sunColor);
    this.uniforms.uDirectLightStrength.value = Number.isFinite(
      atmosphere.sunVisibility,
    ) ? Math.min(1, Math.max(0, atmosphere.sunVisibility)) : 0;
  }

  setVortex(state: Readonly<VortexWaveState>): void {
    this.uniforms.uVortexCenter.value.set(
      finiteOrZero(state.centerX),
      finiteOrZero(state.centerZ),
    );
    this.uniforms.uVortexRadius.value = finiteOrZero(state.radius);
    this.uniforms.uVortexDepression.value = finiteOrZero(state.depression);
    this.uniforms.uVortexTangentStrength.value = finiteOrZero(state.tangentStrength);
    this.uniforms.uVortexPhase.value = finiteOrZero(state.phase);
    this.uniforms.uVortexStrength.value = finiteOrZero(state.strength);
  }

  vortexStateForTest(): VortexWaveState {
    const center = this.uniforms.uVortexCenter.value;
    return {
      centerX: center.x,
      centerZ: center.y,
      radius: this.uniforms.uVortexRadius.value,
      depression: this.uniforms.uVortexDepression.value,
      tangentStrength: this.uniforms.uVortexTangentStrength.value,
      phase: this.uniforms.uVortexPhase.value,
      strength: this.uniforms.uVortexStrength.value,
    };
  }

  setExclusions(regions: readonly WaterExclusionRegion[]): void {
    const worldToLocal = this.uniforms.uExclusionWorldToLocal.value;
    const bounds = this.uniforms.uExclusionBounds.value;
    const lowerBounds = this.uniforms.uExclusionLowerBounds.value;
    const taperStarts = this.uniforms.uExclusionTaperStarts.value;
    const lowerTaperStarts = this.uniforms.uExclusionLowerTaperStarts.value;
    const minimumLocalYs = this.uniforms.uExclusionMinimumLocalYs.value;
    const upperLocalYs = this.uniforms.uExclusionUpperLocalYs.value;
    const activeCount = Math.min(regions.length, MAX_OCEAN_EXCLUSIONS);

    for (let index = 0; index < MAX_OCEAN_EXCLUSIONS; index += 1) {
      worldToLocal[index]!.identity();
      bounds[index]!.set(0, 0, 0, 1);
      lowerBounds[index]!.set(0, 0, 0, 1);
      taperStarts[index]!.set(0, 0);
      lowerTaperStarts[index]!.set(0, 0);
      minimumLocalYs[index] = UNBOUNDED_MINIMUM_LOCAL_Y;
      upperLocalYs[index] = UNBOUNDED_MAXIMUM_LOCAL_Y;
    }
    for (let index = 0; index < activeCount; index += 1) {
      worldToLocal[index]!.copy(regions[index]!.worldToLocal);
      bounds[index]!.copy(regions[index]!.bounds);
      lowerBounds[index]!.copy(regions[index]!.lowerBounds);
      taperStarts[index]!.copy(regions[index]!.taperStarts);
      lowerTaperStarts[index]!.copy(regions[index]!.lowerTaperStarts);
      minimumLocalYs[index] = regions[index]!.minimumLocalY ?? UNBOUNDED_MINIMUM_LOCAL_Y;
      upperLocalYs[index] = regions[index]!.upperLocalY;
    }
    this.uniforms.uExclusionCount.value = activeCount;
  }

  follow(worldX: number, worldZ: number): void {
    const snappedX = Math.round(worldX / 10) * 10;
    const snappedZ = Math.round(worldZ / 10) * 10;
    this.mesh.position.set(snappedX, 0, snappedZ);
    this.uniforms.uOrigin.value.set(snappedX, snappedZ);
  }

  private createHighResources(): void {
    const capture = new OceanCapture();
    let foam: OceanFoam;
    try {
      foam = new OceanFoam(this.uniforms);
    } catch (error) {
      ignoreCleanupError(() => capture.dispose());
      throw error;
    }
    this.capture = capture;
    this.foam = foam;
    this.uniforms.uFoamExtent.value = foam.extent;
    this.uniforms.uWaterColor.value = capture.colorTexture;
    this.uniforms.uWaterDepth.value = capture.depthTexture;
    this.uniforms.uWaterReflection.value = capture.reflectionTexture;
    this.uniforms.uWaterReflectionDepth.value = capture.reflectionDepthTexture;
  }

  private readonly prepareWater = (
    renderer: WebGLRenderer,
    scene: Scene,
    camera: Camera,
    _geometry: BufferGeometry,
    material: Material,
  ): void => {
    if (
      this.disposed || this.preparing || !this.capture || !this.foam
      || material !== this.material || scene.overrideMaterial !== null
      || (this.preparedVersion === this.updateVersion && this.preparedCamera === camera)
    ) return;
    this.preparing = true;
    try {
      this.foam.update(renderer, this.uniforms.uTime.value, this.uniforms.uOrigin.value);
      this.capture.update(renderer, scene, camera, this.mesh);
      this.uniforms.uPersistentFoam.value = this.foam.texture;
      this.uniforms.uFoamOrigin.value.copy(this.foam.origin);
      this.uniforms.uWaterReflectionMatrix.value.copy(this.capture.reflectionMatrix);
      this.uniforms.uWaterInverseProjection.value.copy(this.capture.inverseProjection);
      this.uniforms.uWaterViewMatrix.value.copy(this.capture.viewMatrix);
      this.uniforms.uWaterViewport.value.copy(this.capture.viewport);
      this.uniforms.uWaterReady.value = 1;
      this.material.uniformsNeedUpdate = true;
      this.preparedVersion = this.updateVersion;
      this.preparedCamera = camera;
    } finally {
      this.preparing = false;
    }
  };

  private releaseHighResources(): void {
    const capture = this.capture;
    const foam = this.foam;
    this.capture = null;
    this.foam = null;
    this.preparedCamera = null;
    this.uniforms.uWaterReady.value = 0;
    this.uniforms.uWaterColor.value = null;
    this.uniforms.uWaterDepth.value = null;
    this.uniforms.uWaterReflection.value = null;
    this.uniforms.uWaterReflectionDepth.value = null;
    this.uniforms.uPersistentFoam.value = null;
    runCleanupSteps([
      () => capture?.dispose(),
      () => foam?.dispose(),
    ]);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    runCleanupSteps([
      () => this.releaseHighResources(),
      () => this.mesh.geometry.dispose(),
      () => this.horizonMesh.geometry.dispose(),
      () => this.material.dispose(),
    ]);
  }
}
