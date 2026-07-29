import { Color, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  OCEAN_SURFACE_QUALITY,
  OceanRenderer,
} from '../src/ocean/OceanRenderer';
import { SUN_DIRECTION } from '../src/world/celestialLight';

describe('OceanRenderer', () => {
  it('keeps the current surface as Low and defines a denser High surface', () => {
    expect(OCEAN_SURFACE_QUALITY.low).toEqual({
      segments: 192,
      detailFadeNear: 28,
      detailFadeFar: 92,
      surfaceExtent: 180,
      horizonHalfExtent: 1100,
      horizonRadialSegments: 48,
    });
    expect(OCEAN_SURFACE_QUALITY.high).toEqual({
      segments: 288,
      detailFadeNear: 40,
      detailFadeFar: 128,
      surfaceExtent: 180,
      horizonHalfExtent: 1100,
      horizonRadialSegments: 72,
    });
  });

  it('switches geometry and shader state without rebuilding equal quality', () => {
    const ocean = new OceanRenderer();
    const lowSurface = ocean.mesh.geometry;
    const lowHorizon = ocean.horizonMesh.geometry;
    const disposeLowSurface = vi.spyOn(lowSurface, 'dispose');
    const disposeLowHorizon = vi.spyOn(lowHorizon, 'dispose');

    ocean.setQuality('high');
    const highSurface = ocean.mesh.geometry;
    const highHorizon = ocean.horizonMesh.geometry;

    expect(highSurface).not.toBe(lowSurface);
    expect(highHorizon).not.toBe(lowHorizon);
    expect(disposeLowSurface).toHaveBeenCalledOnce();
    expect(disposeLowHorizon).toHaveBeenCalledOnce();
    expect(ocean.material.defines?.HIGH_QUALITY_WATER).toBe(1);
    expect(ocean.material.uniforms.uDetailFade!.value.toArray()).toEqual([40, 128]);
    expect(
      (ocean.material.uniforms.uDeepColor!.value as Color).getHex(),
    ).toBe(0x073844);
    expect(
      (ocean.material.uniforms.uShallowColor!.value as Color).getHex(),
    ).toBe(0x35a6a0);

    ocean.setQuality('high');
    expect(ocean.mesh.geometry).toBe(highSurface);
    expect(ocean.horizonMesh.geometry).toBe(highHorizon);

    const disposeHighSurface = vi.spyOn(highSurface, 'dispose');
    const disposeHighHorizon = vi.spyOn(highHorizon, 'dispose');
    const disposeMaterial = vi.spyOn(ocean.material, 'dispose');
    ocean.dispose();
    ocean.dispose();
    expect(disposeHighSurface).toHaveBeenCalledOnce();
    expect(disposeHighHorizon).toHaveBeenCalledOnce();
    expect(disposeMaterial).toHaveBeenCalledOnce();
  });

  it('disposes each ocean geometry once', () => {
    const ocean = new OceanRenderer();
    const disposeOceanGeometry = vi.spyOn(ocean.mesh.geometry, 'dispose');
    const disposeHorizonGeometry = vi.spyOn(ocean.horizonMesh.geometry, 'dispose');
    const disposeMaterial = vi.spyOn(ocean.material, 'dispose');

    ocean.dispose();
    ocean.dispose();

    expect(disposeOceanGeometry).toHaveBeenCalledOnce();
    expect(disposeHorizonGeometry).toHaveBeenCalledOnce();
    expect(disposeMaterial).toHaveBeenCalledOnce();
  });

  it('gates each tapered footprint by the displaced fragment local height', () => {
    const ocean = new OceanRenderer();
    const shader = ocean.material.fragmentShader;

    expect(shader).toContain('uniform float uExclusionMinimumLocalYs[2];');
    expect(shader).toContain('uniform vec4 uExclusionLowerBounds[2];');
    expect(shader).toContain('uniform float uExclusionUpperLocalYs[2];');
    expect(shader).toContain('float profileProgress = clamp(');
    expect(shader).toContain('mix(lowerHalfWidth, exclusionHalfWidth, profileProgress)');
    expect(shader).toContain('exclusionLocal.y >= uExclusionMinimumLocalYs[i]');
    expect(shader).toContain(
      'exclusionLocal.y <= uExclusionUpperLocalYs[i]',
    );

    ocean.dispose();
  });

  it('aims direct light along the normalized shared sun direction', () => {
    const ocean = new OceanRenderer();
    const expected = new Vector3(...SUN_DIRECTION).normalize();

    expect(ocean.material.uniforms.uLightDirection!.value).toEqual(expected);

    ocean.dispose();
  });

  it('uploads clamped atmospheric sun visibility as direct-light strength', () => {
    const ocean = new OceanRenderer();
    const atmosphere = {
      fogColor: new Color(),
      horizonColor: new Color(),
      skyColor: new Color(),
      sunColor: new Color(),
      sunVisibility: 1.4,
    };

    ocean.update(0, 1, 0.018, atmosphere);
    expect(ocean.material.uniforms.uDirectLightStrength?.value).toBe(1);

    atmosphere.sunVisibility = -0.2;
    ocean.update(0, 1, 0.018, atmosphere);
    expect(ocean.material.uniforms.uDirectLightStrength?.value).toBe(0);

    ocean.dispose();
  });

  it('attenuates forward scatter and both sun highlights with direct-light strength', () => {
    const ocean = new OceanRenderer();
    const shader = ocean.material.fragmentShader;

    expect(shader).toContain(
      'waterBody += uShallowColor * forwardScatter * uDirectLightStrength',
    );
    expect(shader).toContain(
      'color += uSunColor * (sunCore + sunSheen) * uDirectLightStrength',
    );

    ocean.dispose();
  });

});
