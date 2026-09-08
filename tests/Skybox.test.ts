import { Scene, Texture, Vector3, Vector4 } from 'three';
import { describe, expect, it } from 'vitest';
import { Skybox } from '../src/world/Skybox';

describe('default cloud motion', () => {
  it('keeps cloud groups stable when the camera and weather change', () => {
    const state = { weather: 'calm' as const, phase: 'day' as const, severity: 0 };
    const texture = new Texture();
    const sky = new Skybox(new Scene(), state, texture);
    const centers = sky.material.uniforms.uCloudCenters!.value as Vector4[];
    const scales = sky.material.uniforms.uCloudScales!.value as Vector4[];
    const originalCenters = centers.map(center => center.toArray());
    const originalScales = scales.map(scale => scale.toArray().slice(0, 3));
    try {
      for (let frame = 0; frame < 60; frame++) {
        sky.update(1 / 60, { ...state, weather: 'squall' }, new Vector3(frame, 3, -frame));
      }
      expect(sky.material.uniforms.uCloudCenters!.value).toBe(centers);
      expect(sky.material.uniforms.uCloudScales!.value).toBe(scales);
      expect(centers.map(center => center.toArray())).toEqual(originalCenters);
      expect(scales.map(scale => scale.toArray().slice(0, 3))).toEqual(originalScales);
      expect(sky.mesh.position.toArray()).toEqual([59, 3, -59]);
    } finally {
      sky.dispose();
      texture.dispose();
    }
  });

  it('continues through the star clock wrap and weather changes without jumping', () => {
    const state = { weather: 'calm' as const, phase: 'day' as const, severity: 0 };
    const texture = new Texture();
    const sky = new Skybox(new Scene(), state, texture);
    const position = new Vector3();
    try {
      sky.update(4095, state, position);
      const before = sky.material.uniforms.uCloudTime!.value as number;
      sky.update(2, { ...state, weather: 'squall' }, position);
      expect(sky.material.uniforms.uCloudTime!.value - before).toBe(2);

      const after = sky.material.uniforms.uCloudTime!.value as number;
      sky.update(Number.NaN, state, position);
      sky.update(Number.POSITIVE_INFINITY, state, position);
      sky.update(-1, state, position);
      expect(sky.material.uniforms.uCloudTime!.value).toBe(after);
      sky.update(0.25, state, position);
      expect(sky.material.uniforms.uCloudTime!.value - after).toBe(0.25);
    } finally {
      sky.dispose();
      texture.dispose();
    }
  });
});
