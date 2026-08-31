import {
  Data3DTexture,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector2,
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

function updateCloudWeather(
  clouds: VolumetricClouds,
  weather: 'calm' | 'overcast' | 'squall',
  time: number,
  delta: number,
): number {
  const state = { weather, phase: 'day' as const, severity: 0 };
  return clouds.update({
    time,
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

  it('integrates wind by delta when weather and absolute time change', () => {
    const clouds = new VolumetricClouds(new Scene(), 'low');
    clouds.setEnabled(true);
    updateCloudWeather(clouds, 'calm', 1, 1);
    const windOffset = clouds.material.uniforms.uWindOffset!.value as Vector2;
    const before = windOffset.clone();

    updateCloudWeather(clouds, 'squall', 1_000_000, 0.25);

    const travel = windOffset.distanceTo(before);
    expect(travel).toBeGreaterThan(0);
    expect(travel).toBeLessThanOrEqual(
      volumetricCloudProfile('squall').wind.length() * 0.25,
    );
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

  it('continues cleanup after a disposal throws and rethrows the first error', () => {
    const scene = new Scene();
    const clouds = new VolumetricClouds(scene, 'low');
    const texture = clouds.material.uniforms.uNoiseTexture!.value as Data3DTexture;
    const firstError = new Error('geometry disposal failed');
    const geometryDispose = vi.spyOn(clouds.mesh.geometry, 'dispose')
      .mockImplementation(() => { throw firstError; });
    const materialDispose = vi.spyOn(clouds.material, 'dispose');
    const textureDispose = vi.spyOn(texture, 'dispose');

    expect(() => clouds.dispose()).toThrow(firstError);
    expect(scene.getObjectByName('volumetric-clouds')).toBeUndefined();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(textureDispose).toHaveBeenCalledOnce();
    expect(() => clouds.dispose()).not.toThrow();
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

  it('rolls back default construction resources before returning fallback', () => {
    const scene = new Scene();
    const constructionError = new Error('scene add failed');
    const originalAdd = scene.add.bind(scene);
    vi.spyOn(scene, 'add').mockImplementation((...objects) => {
      originalAdd(...objects);
      throw constructionError;
    });
    const geometryDispose = vi.spyOn(SphereGeometry.prototype, 'dispose');
    const materialDispose = vi.spyOn(ShaderMaterial.prototype, 'dispose');
    const textureDispose = vi.spyOn(Data3DTexture.prototype, 'dispose');
    const reportFallback = vi.fn();

    try {
      expect(tryCreateVolumetricClouds(scene, 'low', reportFallback)).toBeNull();
      expect(reportFallback).toHaveBeenCalledWith(constructionError);
      expect(scene.getObjectByName('volumetric-clouds')).toBeUndefined();
      expect(geometryDispose).toHaveBeenCalledOnce();
      expect(materialDispose).toHaveBeenCalledOnce();
      expect(textureDispose).toHaveBeenCalledOnce();
    } finally {
      vi.restoreAllMocks();
    }
  });
});
