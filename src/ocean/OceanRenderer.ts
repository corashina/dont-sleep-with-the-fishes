import {
  BufferGeometry,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  type Color,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
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

const finiteOrZero = (value: number): number => Number.isFinite(value) ? value : 0;

export interface OceanSurfaceQuality {
  segments: number;
  surfaceExtent: number;
  horizonHalfExtent: number;
  horizonRadialSegments: number;
  horizonRadialExponent: number;
}

export const OCEAN_SURFACE_QUALITY = Object.freeze({
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
  ultra: Object.freeze({
    segments: 384,
    surfaceExtent: 180,
    horizonHalfExtent: 1100,
    horizonRadialSegments: 96,
    horizonRadialExponent: 1.75,
  }),
}) satisfies Readonly<Record<WaterQuality, Readonly<OceanSurfaceQuality>>>;

export interface OceanAtmosphere {
  fogColor: Color;
  horizonColor: Color;
  skyColor: Color;
  sunColor: Color;
  sunVisibility: number;
}

function createOceanPanel(
  width: number,
  depth: number,
  widthSegments: number,
  depthSegments: number,
  centerX: number,
  centerZ: number,
  grading?: Readonly<{
    xDirection?: -1 | 1;
    zDirection?: -1 | 1;
    innerHalfExtent: number;
    outerHalfExtent: number;
    exponent: number;
  }>,
): PlaneGeometry {
  const panel = new PlaneGeometry(width, depth, widthSegments, depthSegments);
  try {
    panel.rotateX(-Math.PI / 2);
    panel.translate(centerX, 0, centerZ);
    if (grading) {
      const positions = panel.getAttribute('position');
      const span = grading.outerHalfExtent - grading.innerHalfExtent;
      const grade = (value: number, direction: -1 | 1): number => {
        const distance = direction * value;
        const progress = Math.min(
          1,
          Math.max(0, (distance - grading.innerHalfExtent) / span),
        );
        return direction * (
          grading.innerHalfExtent
          + span * Math.pow(progress, grading.exponent)
        );
      };
      for (let index = 0; index < positions.count; index += 1) {
        if (grading.xDirection) {
          positions.setX(
            index,
            grade(positions.getX(index), grading.xDirection),
          );
        }
        if (grading.zDirection) {
          positions.setZ(
            index,
            grade(positions.getZ(index), grading.zDirection),
          );
        }
      }
      positions.needsUpdate = true;
    }
  } catch (error) {
    ignoreCleanupError(() => panel.dispose());
    throw error;
  }
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
  try {
    geometry.rotateX(-Math.PI / 2);
  } catch (error) {
    ignoreCleanupError(() => geometry.dispose());
    throw error;
  }
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
  const grade = (
    xDirection?: -1 | 1,
    zDirection?: -1 | 1,
  ) => ({
    xDirection,
    zDirection,
    innerHalfExtent,
    outerHalfExtent,
    exponent: quality.horizonRadialExponent,
  });
  const panels: PlaneGeometry[] = [];
  let geometry: BufferGeometry;
  try {
    panels.push(createOceanPanel(
      quality.surfaceExtent, ringSpan, edgeSegments, radialSegments,
      0, ringCenter, grade(undefined, 1),
    ));
    panels.push(createOceanPanel(
      quality.surfaceExtent, ringSpan, edgeSegments, radialSegments,
      0, -ringCenter, grade(undefined, -1),
    ));
    panels.push(createOceanPanel(
      ringSpan, quality.surfaceExtent, radialSegments, edgeSegments,
      ringCenter, 0, grade(1),
    ));
    panels.push(createOceanPanel(
      ringSpan, quality.surfaceExtent, radialSegments, edgeSegments,
      -ringCenter, 0, grade(-1),
    ));
    panels.push(createOceanPanel(
      ringSpan, ringSpan, radialSegments, radialSegments,
      ringCenter, ringCenter, grade(1, 1),
    ));
    panels.push(createOceanPanel(
      ringSpan, ringSpan, radialSegments, radialSegments,
      ringCenter, -ringCenter, grade(1, -1),
    ));
    panels.push(createOceanPanel(
      ringSpan, ringSpan, radialSegments, radialSegments,
      -ringCenter, ringCenter, grade(-1, 1),
    ));
    panels.push(createOceanPanel(
      ringSpan, ringSpan, radialSegments, radialSegments,
      -ringCenter, -ringCenter, grade(-1, -1),
    ));
    const mergedGeometry = mergeGeometries(panels);
    if (!mergedGeometry) {
      throw new Error('Unable to build ocean horizon geometry.');
    }
    geometry = mergedGeometry;
  } catch (error) {
    ignoreCleanupError(() => runCleanupSteps(
      panels.map((panel) => () => panel.dispose()),
    ));
    throw error;
  }
  try {
    runCleanupSteps(panels.map((panel) => () => panel.dispose()));
  } catch (error) {
    ignoreCleanupError(() => geometry.dispose());
    throw error;
  }
  return geometry;
}

export class OceanRenderer {
  readonly material: ShaderMaterial;
  readonly mesh: Mesh<PlaneGeometry, ShaderMaterial>;
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
    let surface: PlaneGeometry | undefined;
    let horizon: BufferGeometry | undefined;
    try {
      surface = createSurfaceGeometry(surfaceQuality);
      const mesh = new Mesh(surface, material);
      mesh.name = 'procedural-ocean';
      mesh.frustumCulled = false;
      mesh.receiveShadow = true;
      horizon = createHorizonGeometry(surfaceQuality);
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
    const nextSurface = createSurfaceGeometry(surfaceQuality);
    let nextHorizon: BufferGeometry;
    try {
      nextHorizon = createHorizonGeometry(surfaceQuality);
    } catch (error) {
      ignoreCleanupError(() => nextSurface.dispose());
      throw error;
    }
    const previousSurface = this.mesh.geometry;
    const previousHorizon = this.horizonMesh.geometry;
    this.mesh.geometry = nextSurface;
    this.horizonMesh.geometry = nextHorizon;
    previousSurface.dispose();
    previousHorizon.dispose();

    this.material.defines = applyOceanShaderQuality(this.uniforms, value);
    this.material.needsUpdate = true;
    this.quality = value;
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
