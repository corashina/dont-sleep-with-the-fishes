import { Scene } from 'three';
import { expect, it } from 'vitest';
import { Skybox } from '../src/world/Skybox';
import { createTestMoonTexture } from './helpers/skyAssets';

it('keeps Starry Night shader values transient', () => {
  const scene = new Scene();
  const moonTexture = createTestMoonTexture();
  const sky = new Skybox(
    scene,
    { weather: 'calm', phase: 'night', severity: 0 },
    moonTexture,
  );

  expect(sky.material.fragmentShader).toContain('starryNightLayer');
  expect(sky.material.fragmentShader).toContain('uStarryNightTime');
  expect(sky.material.fragmentShader).toContain('uConstellationStrength');
  expect(sky.material.fragmentShader).toContain('orionLayer');
  expect(sky.material.fragmentShader).not.toContain('constellationSegment');
  expect(sky.material.fragmentShader).toContain(
    'vec3 center = normalize(vec3(0.52, 0.38, -1.0));',
  );
  expect(sky.material.fragmentShader).toContain(
    'stars += constellationStar(point, rigel, 0.0034, 5.6);',
  );
  expect(sky.material.fragmentShader).toContain(
    'float horizontalRay = (1.0 - smoothstep(',
  );
  expect(sky.material.fragmentShader).toContain(
    'float rays = max(horizontalRay, verticalRay);',
  );
  expect(sky.material.fragmentShader).toContain(
    'float moonStarOcclusion = 1.0 - moonSample.a;',
  );
  expect(sky.material.fragmentShader).toContain(
    'float distanceToBoundary = 0.5 - max(',
  );
  expect(sky.material.fragmentShader).toContain(
    'float haloRadius = min(radius * 7.5, distanceToBoundary * 0.96);',
  );
  expect(sky.material.fragmentShader).toContain(
    'if (uStarryNightStrength > 0.0) {',
  );
  expect(sky.material.fragmentShader).toContain(
    'float radius = mix(0.040, 0.092, hash31(cell + 12.8));',
  );
  expect(sky.material.uniforms.uStarryNightStrength?.value).toBe(0);
  expect(sky.material.uniforms.uStarryNightTime?.value).toBe(0);
  expect(sky.material.uniforms.uConstellationStrength?.value).toBe(0);

  sky.setStarryNight({ strength: 2, time: 3, constellationStrength: 2 });
  expect(sky.material.uniforms.uStarryNightStrength?.value).toBe(1);
  expect(sky.material.uniforms.uStarryNightTime?.value).toBe(3);
  expect(sky.material.uniforms.uConstellationStrength?.value).toBe(1);

  sky.setStarryNight({ strength: -1, time: -3, constellationStrength: -1 });
  expect(sky.material.uniforms.uStarryNightStrength?.value).toBe(0);
  expect(sky.material.uniforms.uStarryNightTime?.value).toBe(0);
  expect(sky.material.uniforms.uConstellationStrength?.value).toBe(0);

  sky.setStarryNight({
    strength: Number.NaN,
    time: Number.POSITIVE_INFINITY,
    constellationStrength: Number.NaN,
  });
  expect(sky.material.uniforms.uStarryNightStrength?.value).toBe(0);
  expect(sky.material.uniforms.uStarryNightTime?.value).toBe(0);

  sky.resetTransient();
  expect(sky.material.uniforms.uStarryNightStrength?.value).toBe(0);
  expect(sky.material.uniforms.uStarryNightTime?.value).toBe(0);

  sky.setStarryNight({ strength: 1, time: 4, constellationStrength: 1 });
  sky.dispose();
  expect(sky.material.uniforms.uStarryNightStrength?.value).toBe(0);
  expect(sky.material.uniforms.uStarryNightTime?.value).toBe(0);
  moonTexture.dispose();
});
