import { Color, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { OCEAN_PRESENTATION, OceanRenderer } from '../src/ocean/OceanRenderer';
import { SUN_DIRECTION } from '../src/world/celestialLight';

describe('OceanRenderer', () => {
  it('uses the authored foam and grazing-reflection response gains', () => {
    expect(OCEAN_PRESENTATION.foamGain).toBe(1.15);
    expect(OCEAN_PRESENTATION.grazingReflectionGain).toBe(1.12);
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
