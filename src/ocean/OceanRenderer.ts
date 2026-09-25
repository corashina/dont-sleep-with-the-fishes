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
import { applyHighWaterLook } from './highWaterLook';
import { DEFAULT_WAVES, type VortexWaveState } from './WaveField';
import { WAVE_MODULATION } from './waveModulation';
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
  OCEAN_SHADER_QUALITY,
  applyOceanShaderQuality,
  createOceanShaderDefinition,
  type OceanShaderUniforms,
} from './oceanShader';
import {
  createOceanHorizonGeometries,
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
    horizonRadialSegments: 24,
    horizonRadialExponent: 1.75,
  }),
  high: Object.freeze({
    segments: 288,
    surfaceExtent: 180,
    horizonHalfExtent: 1100,
    horizonRadialSegments: 36,
    horizonRadialExponent: 1.75,
  }),
}) satisfies Readonly<Record<WaterQuality, Readonly<OceanSurfaceQuality>>>;

const finiteOrZero = (value: number): number => Number.isFinite(value) ? value : 0;
const WAVE_BOUND = DEFAULT_WAVES.reduce((sum, wave) => (
  sum + Math.abs(wave.amplitude) * (1 + Math.abs(wave.steepness))
), 0) * (WAVE_MODULATION.groupMinimum + WAVE_MODULATION.groupRange);

export interface OceanAtmosphere {
  phase: 'day' | 'night';
  fogVolume: number;
  fogTime: number;
  fogLightColor: Color;
  fogColor: Color;
  horizonColor: Color;
  skyColor: Color;
  sunColor: Color;
  sunVisibility: number;
}

export class OceanRenderer {
  readonly material: ShaderMaterial;
  readonly mesh: Mesh<BufferGeometry, ShaderMaterial>;
  readonly horizonMeshes: readonly Mesh<BufferGeometry, ShaderMaterial>[];
  private readonly uniforms: OceanShaderUniforms;
  private quality: WaterQuality;
  private disposed = false;
  private capture: OceanCapture | null = null;
  private updateVersion = 0;
  private preparedVersion = -1;
  private preparedCamera: Camera | null = null;
  private preparing = false;
  private atmosphere: OceanAtmosphere | undefined;
  private fogDensity = 0;
  private amplitudeScale = 1;
  private vortexBound = 0;

  constructor(
    quality: WaterQuality = 'low',
    private readonly lightDirection: CelestialDirection = SUN_DIRECTION,
  ) {
    this.quality = quality;
    const surfaceQuality = OCEAN_SURFACE_QUALITY[quality];
    const definition = createOceanShaderDefinition(quality);
    const material = new ShaderMaterial({
      vertexShader: definition.vertexShader,
      fragmentShader: definition.fragmentShader,
      transparent: false,
      defines: definition.defines,
      uniforms: definition.uniforms,
    });
    let surface: BufferGeometry | undefined;
    let horizons: BufferGeometry[] = [];
    try {
      surface = createOceanSurfaceGeometry(surfaceQuality);
      const mesh = new Mesh(surface, material);
      mesh.name = 'procedural-ocean';
      mesh.frustumCulled = false;
      mesh.receiveShadow = true;
      horizons = createOceanHorizonGeometries(surfaceQuality);
      const horizonMeshes = horizons.map((geometry, index) => {
        const panel = new Mesh(geometry, material);
        panel.name = `procedural-ocean-horizon-${index}`;
        panel.onBeforeRender = this.prepareWater;
        mesh.add(panel);
        return panel;
      });
      this.uniforms = definition.uniforms;
      this.applyAtmosphere();
      this.material = material;
      this.mesh = mesh;
      this.horizonMeshes = horizonMeshes;
      this.updateHorizonBounds();
      mesh.onBeforeRender = this.prepareWater;
      if (quality === 'high') this.createHighResources();
    } catch (error) {
      ignoreCleanupError(() => runCleanupSteps([
        () => surface?.dispose(),
        ...horizons.map((geometry) => () => geometry.dispose()),
        () => material.dispose(),
      ]));
      throw error;
    }
  }

  setQuality(value: WaterQuality): void {
    if (this.disposed || value === this.quality) return;
    const surfaceQuality = OCEAN_SURFACE_QUALITY[value];
    const nextSurface = createOceanSurfaceGeometry(surfaceQuality);
    let nextHorizons: BufferGeometry[] = [];
    try {
      nextHorizons = createOceanHorizonGeometries(surfaceQuality);
      if (value === 'high') this.createHighResources();
    } catch (error) {
      ignoreCleanupError(() => nextSurface.dispose());
      ignoreCleanupError(() => runCleanupSteps(nextHorizons.map((geometry) => () => geometry.dispose())));
      throw error;
    }
    const previousSurface = this.mesh.geometry;
    const previousHorizons = this.horizonMeshes.map((panel) => panel.geometry);
    this.mesh.geometry = nextSurface;
    this.horizonMeshes.forEach((panel, index) => { panel.geometry = nextHorizons[index]!; });
    this.updateHorizonBounds();
    this.material.defines = applyOceanShaderQuality(this.uniforms, value);
    this.material.needsUpdate = true;
    this.quality = value;
    this.applyAtmosphere();
    this.preparedVersion = -1;
    runCleanupSteps([
      () => { if (value === 'low') this.releaseHighResources(); },
      () => previousSurface.dispose(),
      ...previousHorizons.map((geometry) => () => geometry.dispose()),
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
    const boundScale = finiteOrZero(amplitudeScale);
    if (this.amplitudeScale !== boundScale) {
      this.amplitudeScale = boundScale;
      this.updateHorizonBounds();
    }
    this.fogDensity = fogDensity;
    this.atmosphere = atmosphere;
    this.applyAtmosphere();
  }

  private applyFogVolume(): number {
    const atmosphere = this.atmosphere;
    const amount = atmosphere?.fogVolume ?? 0;
    this.uniforms.uFogVolume.value = amount;
    this.uniforms.uFogTime.value = atmosphere?.fogTime ?? 0;
    if (atmosphere) this.uniforms.uFogLightColor.value.copy(atmosphere.fogLightColor);
    const horizon = OCEAN_SHADER_QUALITY[this.quality].horizonFog;
    this.uniforms.uHorizonFog.value.set(horizon[0], horizon[1], horizon[2] + (1 - horizon[2]) * amount);
    return amount;
  }

  private applyAtmosphere(): void {
    this.uniforms.uLightDirection.value.set(...this.lightDirection).normalize();
    const fogVolume = this.applyFogVolume();
    const atmosphere = this.atmosphere;
    if (this.quality === 'high') {
      applyHighWaterLook(this.uniforms, atmosphere?.phase ?? 'day');
      if (atmosphere) {
        const amount = Math.max(fogVolume, this.uniforms.uBloodOceanIntensity.value);
        this.uniforms.uFogColor.value.lerp(atmosphere.fogColor, amount);
        this.uniforms.uHorizonColor.value.lerp(atmosphere.horizonColor, amount);
        this.uniforms.uFogDensity.value += (this.fogDensity - this.uniforms.uFogDensity.value) * amount;
        this.uniforms.uDirectLightStrength.value *= 1 - fogVolume * 0.85;
      }
      return;
    }
    this.uniforms.uFogDensity.value = this.fogDensity;
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
    const vortexBound = Math.abs(finiteOrZero(state.strength)) * (
      Math.abs(finiteOrZero(state.depression)) + Math.abs(finiteOrZero(state.tangentStrength))
    );
    if (this.vortexBound !== vortexBound) {
      this.vortexBound = vortexBound;
      this.updateHorizonBounds();
    }
  }

  private updateHorizonBounds(): void {
    const displacement = WAVE_BOUND * Math.abs(this.amplitudeScale) + this.vortexBound;
    for (const panel of this.horizonMeshes) {
      const geometry = panel.geometry;
      const bounds = geometry.boundingBox!;
      // Keep CPU culling conservative while the vertex shader moves waves and vortices.
      geometry.boundingSphere!.radius = Math.hypot(
        (bounds.max.x - bounds.min.x) / 2,
        (bounds.max.y - bounds.min.y) / 2,
        (bounds.max.z - bounds.min.z) / 2,
      ) + displacement;
    }
  }

  setBloodOceanIntensity(intensity: number): void {
    if (this.disposed) return;
    this.uniforms.uBloodOceanIntensity.value = Number.isFinite(intensity)
      ? Math.min(1, Math.max(0, intensity)) : 0;
  }

  setExclusions(regions: readonly WaterExclusionRegion[]): void {
    const worldToLocal = this.uniforms.uExclusionWorldToLocal.value;
    const bounds = this.uniforms.uExclusionBounds.value;
    const lowerBounds = this.uniforms.uExclusionLowerBounds.value;
    const taperStarts = this.uniforms.uExclusionTaperStarts.value;
    const lowerTaperStarts = this.uniforms.uExclusionLowerTaperStarts.value;
    const minimumLocalYs = this.uniforms.uExclusionMinimumLocalYs.value;
    const upperLocalYs = this.uniforms.uExclusionUpperLocalYs.value;
    const hullContacts = this.uniforms.uExclusionHullContacts.value;
    const activeCount = Math.min(regions.length, MAX_OCEAN_EXCLUSIONS);

    for (let index = 0; index < MAX_OCEAN_EXCLUSIONS; index += 1) {
      worldToLocal[index]!.identity();
      bounds[index]!.set(0, 0, 0, 1);
      lowerBounds[index]!.set(0, 0, 0, 1);
      taperStarts[index]!.set(0, 0);
      lowerTaperStarts[index]!.set(0, 0);
      minimumLocalYs[index] = UNBOUNDED_MINIMUM_LOCAL_Y;
      upperLocalYs[index] = UNBOUNDED_MAXIMUM_LOCAL_Y;
      hullContacts[index] = 0;
    }
    for (let index = 0; index < activeCount; index += 1) {
      worldToLocal[index]!.copy(regions[index]!.worldToLocal);
      bounds[index]!.copy(regions[index]!.bounds);
      lowerBounds[index]!.copy(regions[index]!.lowerBounds);
      taperStarts[index]!.copy(regions[index]!.taperStarts);
      lowerTaperStarts[index]!.copy(regions[index]!.lowerTaperStarts);
      minimumLocalYs[index] = regions[index]!.minimumLocalY ?? UNBOUNDED_MINIMUM_LOCAL_Y;
      upperLocalYs[index] = regions[index]!.upperLocalY;
      hullContacts[index] = regions[index]!.keepSurfaceBelowRim ? 1 : 0;
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
    this.capture = capture;
    this.uniforms.uWaterColor.value = capture.colorTexture;
    this.uniforms.uWaterDepth.value = capture.depthTexture;
    this.uniforms.uWaterReflection.value = capture.reflectionTexture;
  }

  private readonly prepareWater = (
    renderer: WebGLRenderer,
    scene: Scene,
    camera: Camera,
    _geometry: BufferGeometry,
    material: Material,
  ): void => {
    if (
      this.disposed || this.preparing
      || material !== this.material || scene.overrideMaterial !== null
      || (this.preparedVersion === this.updateVersion && this.preparedCamera === camera)
    ) return;
    this.preparing = true;
    try {
      this.material.uniformsNeedUpdate = true;
      if (!this.capture) {
        this.preparedVersion = this.updateVersion; this.preparedCamera = camera;
        return;
      }
      this.capture.update(renderer, scene, camera, this.mesh);
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
    this.capture = null;
    this.preparedCamera = null;
    this.uniforms.uWaterReady.value = 0;
    this.uniforms.uWaterColor.value = null;
    this.uniforms.uWaterDepth.value = null;
    this.uniforms.uWaterReflection.value = null;
    capture?.dispose();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    runCleanupSteps([
      () => this.releaseHighResources(),
      () => this.mesh.geometry.dispose(),
      ...this.horizonMeshes.map((panel) => () => panel.geometry.dispose()),
      () => this.material.dispose(),
    ]);
  }
}
