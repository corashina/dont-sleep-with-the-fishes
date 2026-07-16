import { Vector2 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  OCEAN_SURFACE_QUALITY,
  OceanRenderer,
} from '../src/ocean/OceanRenderer';

describe('OceanRenderer', () => {
  it('uses the balanced surface density and ordered detail fade', () => {
    const ocean = new OceanRenderer();
    const position = ocean.mesh.geometry.getAttribute('position');

    expect(OCEAN_SURFACE_QUALITY).toEqual({
      segments: 192,
      detailFadeNear: 28,
      detailFadeFar: 92,
    });
    expect(ocean.mesh.geometry.parameters.widthSegments).toBe(192);
    expect(ocean.mesh.geometry.parameters.heightSegments).toBe(192);
    expect(position.count).toBe(193 * 193);
    expect(ocean.material.uniforms.uDetailFade!.value).toEqual(new Vector2(28, 92));
    expect(OCEAN_SURFACE_QUALITY.detailFadeNear)
      .toBeLessThan(OCEAN_SURFACE_QUALITY.detailFadeFar);

    ocean.dispose();
  });
});
