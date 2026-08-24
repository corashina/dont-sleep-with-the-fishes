import {
  BufferGeometry,
  Mesh,
  ShaderMaterial,
  type Color,
} from 'three';
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
  OCEAN_SURFACE_QUALITY,
} from './oceanGeometry';

const finiteOrZero = (value: number): number => Number.isFinite(value) ? value : 0;

export interface OceanAtmosphere {
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

  constructor(
    quality: WaterQuality = 'low',
    lightDirection: CelestialDirection = SUN_DIRECTION,
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
      this.material = material;
      this.mesh = mesh;
      this.horizonMesh = horizonMesh;
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
    } catch (error) {
      ignoreCleanupError(() => nextSurface.dispose());
      throw error;
    }
    const previousSurface = this.mesh.geometry;
    const previousHorizon = this.horizonMesh.geometry;
    this.mesh.geometry = nextSurface;
    this.horizonMesh.geometry = nextHorizon;
    this.material.defines = applyOceanShaderQuality(this.uniforms, value);
    this.material.needsUpdate = true;
    this.quality = value;
    runCleanupSteps([
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
    this.uniforms.uTime.value = timeSeconds;
    this.uniforms.uAmplitudeScale.value = amplitudeScale;
    this.uniforms.uFogDensity.value = fogDensity;
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

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    runCleanupSteps([
      () => this.mesh.geometry.dispose(),
      () => this.horizonMesh.geometry.dispose(),
      () => this.material.dispose(),
    ]);
  }
}
