import { Scene, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { Skybox } from '../src/world/Skybox';
import { createTestMoonTexture } from './helpers/skyAssets';

it('uses the enhanced star field for the normal night sky', () => {
  const scene = new Scene();
  const moonTexture = createTestMoonTexture();
  const night = { weather: 'calm', phase: 'night', severity: 0 } as const;
  const sky = new Skybox(scene, night, moonTexture);

  expect(sky.material.fragmentShader).toContain('uStarTime');
  expect(sky.material.fragmentShader).toContain(
    'float radius = mix(0.040, 0.092, hash31(cell + 12.8));',
  );
  expect(sky.material.fragmentShader).toContain(
    'float haloRadius = min(radius * 7.5, distanceToBoundary * 0.96);',
  );
  expect(sky.material.fragmentShader).toContain(
    'vec3 glowingStars = glowingStarLayer(direction, 145.0, 0.9948)',
  );
  expect(sky.material.fragmentShader).not.toContain('starryNight');
  expect(sky.material.fragmentShader).not.toContain('constellation');
  expect(sky.material.fragmentShader).not.toContain('orionLayer');
  expect(sky.material.uniforms.uStarTime?.value).toBe(0);
  expect(sky.palette.starVisibility).toBe(0.72);

  sky.update(0.5, night, new Vector3());
  expect(sky.material.uniforms.uStarTime?.value).toBeCloseTo(0.5);
  sky.resetTransient();
  expect(sky.material.uniforms.uStarTime?.value).toBeCloseTo(0.5);

  sky.dispose();
  moonTexture.dispose();
});
