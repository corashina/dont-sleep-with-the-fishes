import {
  BackSide,
  Data3DTexture,
  LinearFilter,
  RedFormat,
  RepeatWrapping,
  Scene,
  UnsignedByteType,
  Vector3,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  tryCreateVolumetricClouds,
  VolumetricClouds,
} from '../src/world/VolumetricClouds';
import { volumetricCloudProfile } from '../src/world/volumetricCloudProfiles';
import { skyPaletteFor, type SkyPhase } from '../src/world/skyPalette';

describe('volumetricCloudProfile', () => {
  it('makes rough weather denser, lower, and faster', () => {
    const calm = volumetricCloudProfile('calm');
    const overcast = volumetricCloudProfile('overcast');
    const squall = volumetricCloudProfile('squall');

    expect(overcast.coverage).toBeGreaterThan(calm.coverage);
    expect(squall.coverage).toBeGreaterThan(overcast.coverage);
    expect(squall.baseHeight).toBeLessThan(calm.baseHeight);
    expect(squall.wind.length()).toBeGreaterThan(calm.wind.length());
  });

  it('returns frozen profiles and wind vectors', () => {
    const profile = volumetricCloudProfile('calm');

    expect(Object.isFrozen(profile)).toBe(true);
    expect(Object.isFrozen(profile.wind)).toBe(true);
    expect(volumetricCloudProfile('calm')).toBe(profile);
  });
});

function updateClouds(
  clouds: VolumetricClouds,
  phase: SkyPhase = 'day',
  delta = 2,
): number {
  const state = { weather: 'calm' as const, phase, severity: 0 };
  return clouds.update({
    time: 1,
    delta,
    cameraPosition: new Vector3(3, 5, 7),
    state,
    palette: skyPaletteFor(state),
  });
}

describe('VolumetricClouds', () => {
  it('starts hidden, updates enabled state, and removes itself on disposal', () => {
    const scene = new Scene();
    const clouds = new VolumetricClouds(scene, 'low');

    expect(clouds.mesh.visible).toBe(false);
    clouds.setEnabled(true);
    expect(updateClouds(clouds)).toBe(1);
    expect(clouds.mesh.visible).toBe(true);
    expect(clouds.mesh.position.toArray()).toEqual([3, 5, 7]);

    clouds.dispose();
    expect(scene.getObjectByName('volumetric-clouds')).toBeUndefined();
  });

  it('keeps the night sky clear', () => {
    const clouds = new VolumetricClouds(new Scene(), 'low');
    clouds.setEnabled(true);

    expect(updateClouds(clouds, 'night')).toBe(0);
    expect(clouds.mesh.visible).toBe(false);
    clouds.dispose();
  });

  it('fades out after it is disabled', () => {
    const clouds = new VolumetricClouds(new Scene(), 'low');
    clouds.setEnabled(true);
    updateClouds(clouds);
    clouds.setEnabled(false);

    expect(updateClouds(clouds, 'day', 0.25)).toBeCloseTo(0.75);
    expect(clouds.mesh.visible).toBe(true);
    expect(updateClouds(clouds, 'day', 1)).toBe(0);
    expect(clouds.mesh.visible).toBe(false);
    clouds.dispose();
  });

  it('sanitizes non-finite frame inputs', () => {
    const clouds = new VolumetricClouds(new Scene(), 'medium');
    clouds.setEnabled(true);
    const state = { weather: 'calm' as const, phase: 'day' as const, severity: 0 };

    const strength = clouds.update({
      time: Number.NaN,
      delta: Number.POSITIVE_INFINITY,
      cameraPosition: new Vector3(Number.NaN, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY),
      state,
      palette: skyPaletteFor(state),
    });

    expect(strength).toBe(0);
    expect(clouds.mesh.position.toArray()).toEqual([0, 0, 0]);
    expect(clouds.material.uniforms.uTime!.value).toBe(0);
    clouds.dispose();
  });

  it.each([
    ['low', 12],
    ['medium', 20],
    ['high', 28],
  ] as const)('uses %s quality step limits', (quality, steps) => {
    const clouds = new VolumetricClouds(new Scene(), quality);
    expect(clouds.material.uniforms.uMaxSteps!.value).toBe(steps);
    clouds.dispose();
  });

  it('builds the required deterministic noise texture and shader shell', () => {
    const clouds = new VolumetricClouds(new Scene(), 'low');
    const texture = clouds.material.uniforms.uNoiseTexture!.value as Data3DTexture;

    expect(texture.image).toMatchObject({ width: 64, height: 64, depth: 64 });
    expect(texture.format).toBe(RedFormat);
    expect(texture.type).toBe(UnsignedByteType);
    expect(texture.minFilter).toBe(LinearFilter);
    expect(texture.magFilter).toBe(LinearFilter);
    expect(texture.wrapS).toBe(RepeatWrapping);
    expect(texture.wrapT).toBe(RepeatWrapping);
    expect(texture.wrapR).toBe(RepeatWrapping);
    expect(clouds.mesh.geometry.parameters.radius).toBe(900);
    expect(clouds.material.side).toBe(BackSide);
    expect(clouds.material.depthTest).toBe(true);
    expect(clouds.material.depthWrite).toBe(false);
    expect(clouds.material.transparent).toBe(true);
    expect(clouds.material.premultipliedAlpha).toBe(true);
    expect(clouds.material.fragmentShader).toContain(
      'for (int stepIndex = 0; stepIndex < 28; stepIndex++)',
    );
    expect(clouds.material.fragmentShader).toContain('rayDirection.y <= 0.0');
    clouds.dispose();
  });

  it('disposes geometry, material, and texture once', () => {
    const clouds = new VolumetricClouds(new Scene(), 'low');
    const texture = clouds.material.uniforms.uNoiseTexture!.value as Data3DTexture;
    const geometryDispose = vi.spyOn(clouds.mesh.geometry, 'dispose');
    const materialDispose = vi.spyOn(clouds.material, 'dispose');
    const textureDispose = vi.spyOn(texture, 'dispose');

    clouds.dispose();
    clouds.dispose();

    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
    expect(textureDispose).toHaveBeenCalledTimes(1);
  });
});

describe('tryCreateVolumetricClouds', () => {
  it('reports one fallback warning and returns null on creation failure', () => {
    const error = new Error('WebGL 3D textures unavailable');
    const reportFallback = vi.fn();
    const create = vi.fn(() => { throw error; });

    expect(tryCreateVolumetricClouds(
      new Scene(),
      'low',
      reportFallback,
      create,
    )).toBeNull();
    expect(reportFallback).toHaveBeenCalledOnce();
    expect(reportFallback).toHaveBeenCalledWith(error);
    expect(create).toHaveBeenCalledOnce();
  });
});
