import { describe, expect, it } from 'vitest';
import { Scene, Texture } from 'three';
import { Skybox } from '../src/world/Skybox';

describe('Skybox', () => {
  it('scales the flat cloud layer', () => {
    const sky = new Skybox(
      new Scene(),
      { weather: 'calm', phase: 'day', severity: 0 },
      new Texture(),
    );

    sky.setCloudLayerStrength(0.25);
    expect(sky.material.uniforms.uCloudLayerStrength!.value).toBe(0.25);
    sky.setCloudLayerStrength(Number.NaN);
    expect(sky.material.uniforms.uCloudLayerStrength!.value).toBe(0);

    sky.dispose();
  });
});
