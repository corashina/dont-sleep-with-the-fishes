import { describe, expect, it, vi } from 'vitest';
import { BackSide, Color, Scene, ShaderMaterial, Vector3 } from 'three';
import { Skybox } from '../src/world/Skybox';
import { createTestMoonTexture } from './helpers/skyAssets';

describe('Skybox', () => {
  it('creates one cloudless inward-facing sky mesh', () => {
    const scene = new Scene();
    const sky = new Skybox(
      scene,
      { weather: 'calm', phase: 'day', severity: 0 },
      createTestMoonTexture(),
    );
    const mesh = scene.getObjectByName('procedural-skybox');
    expect(mesh).toBe(sky.mesh);
    expect(sky.material).toBeInstanceOf(ShaderMaterial);
    expect(sky.material.side).toBe(BackSide);
    expect(sky.material.depthWrite).toBe(false);
    expect(sky.material.depthTest).toBe(false);
    expect(sky.material.fragmentShader).toContain('vec3 starLayer(');
    expect(sky.material.fragmentShader).not.toMatch(/cloud/i);
    sky.dispose();
  });

  it('binds but does not own the shared moon texture', () => {
    const scene = new Scene();
    const moonTexture = createTestMoonTexture();
    const textureDispose = vi.spyOn(moonTexture, 'dispose');
    const sky = new Skybox(
      scene,
      { weather: 'calm', phase: 'night', severity: 0 },
      moonTexture,
    );

    expect(sky.material.uniforms.uMoonMap!.value).toBe(moonTexture);
    expect(sky.material.fragmentShader).toContain('uniform sampler2D uMoonMap;');
    expect(sky.material.fragmentShader).toContain('texture2D(uMoonMap, moonUv)');

    sky.dispose();
    sky.dispose();
    expect(textureDispose).not.toHaveBeenCalled();
  });

  it('follows the camera and finishes a target transition in 1.5 seconds', () => {
    const sky = new Skybox(
      new Scene(),
      { weather: 'calm', phase: 'day', severity: 0 },
      createTestMoonTexture(),
    );
    const cameraPosition = new Vector3(12, 5, -8);
    sky.update(0, { weather: 'squall', phase: 'night', severity: 0 }, cameraPosition);
    const start = sky.palette.zenithColor.clone();
    sky.update(0.75, { weather: 'squall', phase: 'night', severity: 0 }, cameraPosition);
    const middle = sky.palette.zenithColor.clone();
    sky.update(0.75, { weather: 'squall', phase: 'night', severity: 0 }, cameraPosition);
    expect(sky.mesh.position.toArray()).toEqual(cameraPosition.toArray());
    expect(middle).not.toEqual(start);
    expect(sky.palette.starVisibility).toBeCloseTo(0.02);
    sky.dispose();
  });

  it('applies and clears a bounded transient tint', () => {
    const sky = new Skybox(
      new Scene(),
      { weather: 'calm', phase: 'day', severity: 0 },
      createTestMoonTexture(),
    );
    sky.setTint(new Color(0x0d5063), 2);
    expect(sky.material.uniforms.uTintAmount!.value).toBe(1);
    sky.resetTransient();
    expect(sky.material.uniforms.uTintAmount!.value).toBe(0);
    sky.dispose();
  });

  it('removes and disposes its resources once', () => {
    const scene = new Scene();
    const sky = new Skybox(
      scene,
      { weather: 'calm', phase: 'day', severity: 0 },
      createTestMoonTexture(),
    );
    const geometryDispose = vi.spyOn(sky.mesh.geometry, 'dispose');
    const materialDispose = vi.spyOn(sky.material, 'dispose');
    sky.dispose();
    sky.dispose();
    expect(scene.getObjectByName('procedural-skybox')).toBeUndefined();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
  });
});
