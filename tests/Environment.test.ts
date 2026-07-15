import { describe, expect, it } from 'vitest';
import { DirectionalLight, Scene, Texture, Vector3 } from 'three';
import { Environment, SCAVENGE_SHADOW_CONFIG } from '../src/world/Environment';

describe('scavenging environment shadows', () => {
  it('covers the freighter and moved lifeboat with one fixed 2048 shadow map', () => {
    const scene = new Scene();
    const environment = new Environment(scene, new Texture());
    const lights = scene.children.filter((child): child is DirectionalLight => (
      child instanceof DirectionalLight
    ));
    expect(lights).toHaveLength(1);
    const light = lights[0]!;
    const camera = light.shadow.camera;

    expect(SCAVENGE_SHADOW_CONFIG).toEqual({
      mapSize: 2048,
      left: -24,
      right: 24,
      top: 24,
      bottom: -24,
      near: 0.5,
      far: 80,
      bias: -0.0005,
      normalBias: 0.03,
    });
    expect(light.shadow.mapSize.toArray()).toEqual([2048, 2048]);
    expect(camera).toMatchObject({
      left: -24, right: 24, top: 24, bottom: -24, near: 0.5, far: 80,
    });
    expect(light.shadow.bias).toBe(-0.0005);
    expect(light.shadow.normalBias).toBe(0.03);

    scene.updateMatrixWorld(true);
    light.shadow.updateMatrices(light);
    const coveragePoints = [
      new Vector3(-6.05, -5, -17.6),
      new Vector3(-6.05, 9, 17.6),
      new Vector3(10.6, -5, -17.6),
      new Vector3(10.6, 9, 17.6),
    ];
    coveragePoints.forEach((point) => {
      const clip = point.clone().project(camera);
      expect(Math.abs(clip.x), point.toArray().join(',')).toBeLessThanOrEqual(1);
      expect(Math.abs(clip.y), point.toArray().join(',')).toBeLessThanOrEqual(1);
      expect(clip.z, point.toArray().join(',')).toBeGreaterThanOrEqual(-1);
      expect(clip.z, point.toArray().join(',')).toBeLessThanOrEqual(1);
    });
    environment.dispose();
  });
});
