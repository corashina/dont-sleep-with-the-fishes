import {
  BackSide,
  Data3DTexture,
  LinearFilter,
  RedFormat,
  RepeatWrapping,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  UnsignedByteType,
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
  it('makes rough weather denser, lower, and faster', () => {
    const calm = volumetricCloudProfile('calm');
    const overcast = volumetricCloudProfile('overcast');
    const squall = volumetricCloudProfile('squall');

    expect(overcast.coverage).toBeGreaterThan(calm.coverage);
    expect(squall.coverage).toBeGreaterThan(overcast.coverage);
    expect(calm.coverage).toBeLessThanOrEqual(0.36);
    expect(squall.baseHeight).toBeLessThan(calm.baseHeight);
    expect(squall.wind.length()).toBeGreaterThan(calm.wind.length());
  });

  it('uses deep vertical volumes with the tallest squall towers', () => {
    const calm = volumetricCloudProfile('calm');
    const overcast = volumetricCloudProfile('overcast');
    const squall = volumetricCloudProfile('squall');

    expect(calm.baseHeight).toBeLessThanOrEqual(100);
    expect(calm.topHeight).toBeGreaterThanOrEqual(400);
    expect(overcast.topHeight - overcast.baseHeight).toBeGreaterThanOrEqual(260);
    expect(squall.topHeight).toBeGreaterThan(calm.topHeight);
    expect(squall.topHeight - squall.baseHeight)
      .toBeGreaterThan(calm.topHeight - calm.baseHeight);
    expect(calm.density).toBeGreaterThanOrEqual(1);
    expect(squall.extinction).toBeGreaterThan(calm.extinction);
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

  it('keeps the night sky clear', () => {
    const clouds = new VolumetricClouds(new Scene(), 'low');
    clouds.setEnabled(true);

    expect(updateClouds(clouds, 'night')).toBe(0);
    expect(clouds.mesh.visible).toBe(false);
    clouds.dispose();
  });

  it('fades between day and night without a visibility pop', () => {
    const clouds = new VolumetricClouds(new Scene(), 'low');
    clouds.setEnabled(true);
    expect(updateClouds(clouds, 'day', 1)).toBe(1);

    expect(updateClouds(clouds, 'night', 0.25)).toBeCloseTo(0.75);
    expect(clouds.material.uniforms.uOpacity!.value).toBeCloseTo(0.75);
    expect(clouds.mesh.visible).toBe(true);

    expect(updateClouds(clouds, 'night', 1)).toBe(0);
    expect(clouds.mesh.visible).toBe(false);
    clouds.dispose();
  });

  it('blends weather profile uniforms during a transition', () => {
    const clouds = new VolumetricClouds(new Scene(), 'low');
    const calm = volumetricCloudProfile('calm');
    const squall = volumetricCloudProfile('squall');
    clouds.setEnabled(true);
    updateCloudWeather(clouds, 'calm', 1, 1);

    updateCloudWeather(clouds, 'squall', 1.25, 0.25);

    const coverage = clouds.material.uniforms.uCoverage!.value as number;
    const baseHeight = clouds.material.uniforms.uBaseHeight!.value as number;
    expect(coverage).toBeGreaterThan(calm.coverage);
    expect(coverage).toBeLessThan(squall.coverage);
    expect(baseHeight).toBeLessThan(calm.baseHeight);
    expect(baseHeight).toBeGreaterThan(squall.baseHeight);
    clouds.dispose();
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
    expect(clouds.material.fragmentShader).toContain('float crownTop');
    expect(clouds.material.fragmentShader).toContain('float cloudGroup');
    expect(clouds.material.fragmentShader).toContain(
      'vec2(190.0, -310.0)',
    );
    expect(clouds.material.fragmentShader).toContain('float towerShape');
    expect(clouds.material.fragmentShader).toContain('float smallLobes');
    expect(clouds.material.fragmentShader).toContain(
      'pow(cloudGroup, 0.55)',
    );
    expect(clouds.material.fragmentShader).toContain('float solidBody');
    expect(clouds.material.fragmentShader).toContain('float baseRipple');
    expect(clouds.material.fragmentShader).toContain('float baseLift');
    expect(clouds.material.fragmentShader).toContain('float baseHeight');
    expect(clouds.material.fragmentShader).toContain('baseHeight - 0.02,');
    expect(clouds.material.fragmentShader).toContain('baseHeight + 0.04,');
    expect(clouds.material.fragmentShader).toContain('float topField');
    expect(clouds.material.fragmentShader).toContain('float billowedTop');
    expect(clouds.material.fragmentShader).toContain('float billowedSides');
    expect(clouds.material.fragmentShader).toContain('float boundaryErosion');
    expect(clouds.material.fragmentShader).toContain('float heightLight');
    expect(clouds.material.fragmentShader).toContain('float cloudDistance');
    expect(clouds.material.fragmentShader).toContain('float distanceFade');
    expect(clouds.material.fragmentShader).toContain('float edgeOpacity');
    expect(clouds.material.fragmentShader).toContain('float rayJitter');
    expect(clouds.material.fragmentShader).toContain(
      'travel += rayJitter * stepLength;',
    );
    expect(clouds.material.fragmentShader).toContain('travel += stepLength;');
    expect(clouds.material.fragmentShader).not.toContain('stepLength * 1.8');
    expect(clouds.material.fragmentShader).toContain('threshold + 0.12,');
    expect(clouds.material.fragmentShader).not.toContain(
      'float erodedBody = body -',
    );
    expect(clouds.material.uniforms.uLightStep!.value).toBeGreaterThanOrEqual(40);
    clouds.dispose();
  });

  it('builds coherent noise instead of independent static voxels', () => {
    const first = new VolumetricClouds(new Scene(), 'low');
    const second = new VolumetricClouds(new Scene(), 'low');
    const firstData = (first.material.uniforms.uNoiseTexture!.value as Data3DTexture)
      .image.data as Uint8Array;
    const secondData = (second.material.uniforms.uNoiseTexture!.value as Data3DTexture)
      .image.data as Uint8Array;
    let totalNeighborDelta = 0;
    let neighborCount = 0;
    let minimum = 255;
    let maximum = 0;

    for (let z = 0; z < 64; z += 1) {
      for (let y = 0; y < 64; y += 1) {
        const row = (z * 64 + y) * 64;
        for (let x = 0; x < 64; x += 1) {
          const value = firstData[row + x]!;
          minimum = Math.min(minimum, value);
          maximum = Math.max(maximum, value);
          if (x < 63) {
            totalNeighborDelta += Math.abs(value - firstData[row + x + 1]!);
            neighborCount += 1;
          }
        }
      }
    }

    expect(totalNeighborDelta / neighborCount).toBeLessThan(24);
    expect(maximum - minimum).toBeGreaterThan(120);
    expect(firstData).toEqual(secondData);
    first.dispose();
    second.dispose();
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
